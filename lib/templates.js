/** Research templates: task presets plus method protocols. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = JSON.parse(readFileSync(join(HERE, '..', 'assets', 'templates.json'), 'utf8'))

export const TEMPLATES = Object.freeze(DATA.templates)
export const TEMPLATE_IDS = Object.freeze(TEMPLATES.map((item) => item.id))

const PLACEHOLDER = /\{([a-z][a-z0-9_]*)\}/giu

export function listTemplates(filter = {}) {
  const kind = filter.kind ? String(filter.kind) : ''
  return TEMPLATES.filter((item) => !kind || item.kind === kind).map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    tier: item.tier,
    domain: item.domain || null,
    stages: item.stages,
    deliverables: item.deliverables,
    placeholders: placeholdersOf(item),
  }))
}

export function getTemplate(id) {
  return TEMPLATES.find((item) => item.id === id) || null
}

export function placeholdersOf(template) {
  const found = new Set()
  for (const text of [template.prompt?.zh, template.prompt?.en]) {
    if (!text) continue
    for (const match of text.matchAll(PLACEHOLDER)) found.add(match[1])
  }
  return [...found]
}

export function fillTemplate(text, vars = {}) {
  return String(text || '').replace(PLACEHOLDER, (whole, name) => {
    const value = vars[name] ?? vars.topic ?? vars.subject
    if (value === undefined || value === null || String(value).trim() === '') {
      return `[${name.toUpperCase()}]`
    }
    return String(value)
  })
}

/** Materialise a template into the fields a campaign needs. */
export function applyTemplate(template, vars = {}) {
  const lang = vars.lang === 'en' ? 'en' : 'zh'
  const prompt = fillTemplate(template.prompt?.[lang] || template.prompt?.zh || '', vars)
  return {
    id: template.id,
    title: template.title?.[lang] || template.title?.zh || template.id,
    prompt,
    tier: template.tier || 'M',
    domain: template.domain || null,
    stages: template.stages || [],
    deliverables: template.deliverables || [],
    gateHints: template.gateHints || {},
    question: prompt,
    scope: `模板：${template.title?.zh || template.id}。先声明数据边界与不做什么，再开始检索。`,
    success: '主指标有明确方向与判定阈值；关键断言有至少两条独立证据；负对照未显示同等效应。',
  }
}
