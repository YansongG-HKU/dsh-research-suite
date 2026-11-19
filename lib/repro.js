/**
 * Executable reproduction package.
 *
 * A "materials are available on request" note is not a reproduction package.
 * This module turns the recorded runs, pre-registration and content-addressed
 * artifacts into a manifest a second person can actually execute: exact
 * commands, seeds, expected metrics, environment lock and artifact checksums.
 */
import { preregCore } from './rigor.js'

function arr(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function buildReproPackage(state) {
  const prereg = state.prereg && typeof state.prereg === 'object' ? state.prereg : {}
  const runs = arr(state.runs)
    .filter((run) => run.status === 'success')
    .map((run) => ({
      id: run.id,
      stage: run.stage,
      control: run.control || 'primary',
      command: run.command,
      seed: run.seed,
      exitCode: run.exitCode,
      metrics: run.metrics || {},
      stdoutArtifact: run.stdoutArtifact || null,
      ts: run.ts,
    }))
  const artifacts = arr(state.artifacts).map((item) => ({
    id: item.id,
    bytes: item.bytes,
    role: item.role,
    label: item.label || '',
    mime: item.mime || '',
  }))
  const environment = {
    envLock: str(prereg.envLock),
    artifacts: artifacts.filter((item) => item.role === 'environment'),
  }
  const checksums = artifacts
    .filter((item) => String(item.id).startsWith('sha256:'))
    .map((item) => `${String(item.id).slice(7)}  ${item.label || item.role}`)
  const control = runs.find((run) => run.control === 'negative') || null
  const primary = runs.filter((run) => run.control !== 'negative')
  const manifest = {
    schema: 'dsh-research-suite/repro/1',
    campaign: state.id,
    title: state.title,
    question: state.question,
    prereg: preregCore(prereg),
    preregLockedAt: prereg.lockedAt || null,
    preregLockedHash: prereg.lockedHash || null,
    environment,
    runs,
    controls: { negative: control ? control.id : null, primary: primary.map((run) => run.id) },
    artifacts,
    checksums,
    note: 'Metrics are expected values from the recorded runs. Re-run the exact command and compare; do not edit the manifest to match a different output.',
  }
  manifest.markdown = renderReproMarkdown(manifest)
  return manifest
}

export function renderReproMarkdown(manifest) {
  const lines = [
    `# 复现包 · ${manifest.title || manifest.campaign}`,
    '',
    `- 活动：${manifest.campaign}`,
    `- 问题：${manifest.question || '—'}`,
    `- 预注册锁定时间：${manifest.preregLockedAt || '—'}`,
    `- 环境锁：${manifest.environment.envLock || '未登记'}`,
    '',
    '## 运行',
    '',
  ]
  if (manifest.runs.length === 0) lines.push('没有成功运行记录。')
  for (const run of manifest.runs) {
    lines.push(`### ${run.id}${run.control === 'negative' ? '（负对照）' : ''}`, '', '```bash', run.command || '# no command recorded', '```', '')
    lines.push(`- seed：${run.seed === null || run.seed === undefined ? '未记录' : run.seed}`)
    lines.push(`- 期望指标：\`${JSON.stringify(run.metrics)}\``)
    if (run.stdoutArtifact) lines.push(`- 原始输出：\`${run.stdoutArtifact}\``)
    lines.push('')
  }
  lines.push('## 预注册参数', '', '```json', JSON.stringify(manifest.prereg, null, 2), '```', '')
  lines.push('## 工件校验和', '')
  if (manifest.checksums.length === 0) lines.push('没有内容寻址工件。')
  else {
    lines.push('```text')
    for (const row of manifest.checksums) lines.push(row)
    lines.push('```')
  }
  lines.push('', '> 复现判定标准：同一命令、同一种子、同一环境锁下重跑，主指标落在记录值附近，负对照不出现同等效应。')
  return lines.join('\n')
}
