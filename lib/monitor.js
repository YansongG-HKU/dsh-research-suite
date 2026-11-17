/**
 * Post-release monitoring, kept deterministic and local.
 *
 * A monitoring plan is not a closed loop until it has a metric definition, an
 * observation stream and a decision rule. This module normalises those pieces
 * and evaluates the latest observation against the pre-registered target. It
 * does not fetch production telemetry: the operator or an integration records
 * observations, and every observation is visible in the event chain.
 */
import { utcnow } from './util.js'

export const MONITORING_STATUSES = Object.freeze(['none', 'planned', 'active', 'paused', 'closed', 'alert'])
export const DIRECTIONS = Object.freeze(['two-sided', 'higher', 'lower'])

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function short(value, limit = 120) {
  return str(value).slice(0, limit)
}

export function defaultMonitoring() {
  return {
    status: 'none',
    plan: '',
    owner: '',
    cadence: '',
    signals: [],
    notes: '',
    reviewedAt: '',
    metrics: [],
    observations: [],
    updatedAt: null,
  }
}

export function normalizeMetric(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = short(raw.name || raw.metric || raw.id, 60)
  if (!name) return null
  const target = num(raw.target ?? raw.value)
  const min = num(raw.min)
  const max = num(raw.max)
  if (target === null && min === null && max === null) return null
  const tolerance = num(raw.tolerance) === null ? 0 : Math.max(0, num(raw.tolerance))
  return {
    name,
    label: short(raw.label, 80),
    unit: short(raw.unit, 24),
    target,
    tolerance,
    direction: DIRECTIONS.includes(raw.direction) ? raw.direction : 'two-sided',
    min,
    max,
  }
}

export function normalizeObservation(raw) {
  if (!raw || typeof raw !== 'object') return null
  const metric = short(raw.metric || raw.name, 60)
  const value = num(raw.value)
  if (!metric || value === null) return null
  return {
    metric,
    value,
    at: short(raw.at || raw.ts || raw.observedAt, 40) || utcnow(),
    note: short(raw.note, 500),
  }
}

export function normalizeMonitoring(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const metrics = []
  const seen = new Set()
  for (const item of Array.isArray(source.metrics) ? source.metrics : []) {
    const metric = normalizeMetric(item)
    if (!metric || seen.has(metric.name)) continue
    seen.add(metric.name)
    metrics.push(metric)
    if (metrics.length >= 20) break
  }
  const observations = (Array.isArray(source.observations) ? source.observations : [])
    .map(normalizeObservation)
    .filter(Boolean)
    .slice(-500)
  const signals = (Array.isArray(source.signals) ? source.signals : [])
    .map((item) => short(item, 120))
    .filter(Boolean)
    .slice(0, 20)
  return {
    status: MONITORING_STATUSES.includes(source.status) ? source.status : 'none',
    plan: short(source.plan, 4000),
    owner: short(source.owner, 160),
    cadence: short(source.cadence, 160),
    signals,
    notes: short(source.notes, 2000),
    reviewedAt: short(source.reviewedAt, 160),
    metrics,
    observations,
    updatedAt: source.updatedAt || null,
  }
}

function metricValueCheck(metric, value) {
  if (metric.min !== null && value < metric.min) {
    return { ok: false, detail: `低于下限 ${metric.min}` }
  }
  if (metric.max !== null && value > metric.max) {
    return { ok: false, detail: `高于上限 ${metric.max}` }
  }
  if (metric.target === null) return { ok: true, detail: '在上下限内' }
  const delta = value - metric.target
  if (metric.direction === 'higher') {
    const floor = metric.target - metric.tolerance
    return { ok: value >= floor, detail: `低于目标下限 ${floor}` }
  }
  if (metric.direction === 'lower') {
    const ceiling = metric.target + metric.tolerance
    return { ok: value <= ceiling, detail: `高于目标上限 ${ceiling}` }
  }
  return {
    ok: Math.abs(delta) <= metric.tolerance,
    detail: `偏离目标 ${delta >= 0 ? '+' : ''}${Number(delta.toFixed(6))}，容差 ±${metric.tolerance}`,
  }
}

/**
 * Evaluate the latest observation per metric. Alerts are deterministic: an
 * out-of-tolerance value, a missing metric for a registered signal, or an
 * observation for an unknown metric. Missing observations are gaps, not alerts,
 * so a freshly planned loop is not marked failed before its first review.
 */
export function evaluateMonitoring(raw) {
  const monitoring = normalizeMonitoring(raw)
  const alerts = []
  const gaps = []
  const metrics = []
  const byName = new Map(monitoring.metrics.map((item) => [item.name, item]))
  for (const metric of monitoring.metrics) {
    const rows = monitoring.observations.filter((item) => item.metric === metric.name)
    const latest = rows[rows.length - 1] || null
    if (!latest) {
      gaps.push({ code: 'metric_without_observation', metric: metric.name, detail: '指标已登记但还没有观测值' })
      metrics.push({ ...metric, observations: 0, latest: null, status: 'unobserved' })
      continue
    }
    const checked = metricValueCheck(metric, latest.value)
    if (!checked.ok) {
      alerts.push({
        code: 'metric_out_of_tolerance',
        metric: metric.name,
        severity: 'major',
        value: latest.value,
        at: latest.at,
        detail: checked.detail,
      })
    }
    metrics.push({ ...metric, observations: rows.length, latest, status: checked.ok ? 'ok' : 'alert' })
  }
  for (const signal of monitoring.signals) {
    if (!byName.has(signal)) {
      gaps.push({ code: 'signal_without_metric', signal, detail: `信号 ${signal} 没有可计算的指标定义` })
    }
  }
  const unknown = new Set(monitoring.observations.map((item) => item.metric).filter((name) => !byName.has(name)))
  for (const name of unknown) {
    gaps.push({ code: 'observation_without_metric', metric: name, detail: `观测 ${name} 没有对应的指标定义` })
  }
  const latestAt = monitoring.observations.length
    ? monitoring.observations[monitoring.observations.length - 1].at
    : ''
  return {
    status: alerts.length > 0 ? 'alert' : monitoring.status,
    ok: alerts.length === 0,
    alerts,
    gaps,
    metrics,
    observations: monitoring.observations.length,
    signals: monitoring.signals,
    latestAt,
    checkedAt: utcnow(),
  }
}

export function monitoringAssessment(stateOrMonitoring) {
  if (stateOrMonitoring && stateOrMonitoring.monitoring !== undefined) {
    return evaluateMonitoring(stateOrMonitoring.monitoring)
  }
  return evaluateMonitoring(stateOrMonitoring)
}

/** Merge a new observation or metric definition without losing history. */
export function withMetrics(monitoring, rawMetrics) {
  const base = normalizeMonitoring(monitoring)
  const incoming = (Array.isArray(rawMetrics) ? rawMetrics : []).map(normalizeMetric).filter(Boolean)
  const byName = new Map(base.metrics.map((item) => [item.name, item]))
  for (const metric of incoming) byName.set(metric.name, metric)
  return { ...base, metrics: [...byName.values()].slice(0, 20), updatedAt: utcnow() }
}

export function withObservations(monitoring, rawObservations) {
  const base = normalizeMonitoring(monitoring)
  const incoming = (Array.isArray(rawObservations) ? rawObservations : []).map(normalizeObservation).filter(Boolean)
  return {
    ...base,
    observations: [...base.observations, ...incoming].slice(-500),
    updatedAt: utcnow(),
  }
}
