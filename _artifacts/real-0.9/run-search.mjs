#!/usr/bin/env node
/**
 * Real-network acceptance for the 0.9 literature retrieval adapter.
 * It calls the same module the rsx_search tool calls; no mocks.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { searchLiterature } from '../../workspace/dsh-research-suite/lib/retrieval.js'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'search-live.json')

async function attempt(name, options) {
  const started = Date.now()
  try {
    const result = await searchLiterature(options)
    return { name, ok: true, wallMs: Date.now() - started, result }
  } catch (error) {
    return {
      name,
      ok: false,
      wallMs: Date.now() - started,
      code: error?.code || 'failed',
      error: error?.message || String(error),
      detail: error?.detail,
    }
  }
}

const primary = await attempt('primary-both', {
  query: 'multi-agent research system',
  provider: 'both',
  limit: 6,
  timeoutMs: 12_000,
})
const fallback = await attempt('fallback-crossref', {
  query: 'sleep deprivation working memory',
  provider: 'crossref',
  limit: 3,
  timeoutMs: 12_000,
})

const candidates = primary.ok ? primary.result.candidates : []
const dois = candidates.map((item) => item.doi).filter(Boolean)
const uniqueDois = new Set(dois)
const checks = {
  primaryOk: primary.ok,
  bothProvidersQueried: primary.ok && primary.result.providers.length === 2,
  bothProvidersReturned: primary.ok && primary.result.counts.openalex >= 3 && primary.result.counts.crossref >= 3,
  candidatesAtLeastThree: candidates.length >= 3,
  everyCandidateHasTitle: candidates.every((item) => typeof item.title === 'string' && item.title.length > 3),
  doiPresentOnAtLeastThree: dois.length >= 3,
  doiUnique: uniqueDois.size === dois.length,
  crossProviderMergeObserved: candidates.some((item) => Array.isArray(item.providers) && item.providers.length > 1),
  noWarnings: primary.ok && primary.result.warnings.length === 0,
  withinTimeoutBudget: primary.ok && primary.wallMs < 30_000,
  fallbackOk: fallback.ok && fallback.result.candidates.length >= 1,
  fallbackHasNoWarnings: fallback.ok && fallback.result.warnings.length === 0,
}
const ok = Object.values(checks).every(Boolean)

const payload = {
  ok,
  generatedAt: new Date().toISOString(),
  checks,
  primary: primary.ok
    ? {
        query: primary.result.query,
        provider: primary.result.provider,
        providers: primary.result.providers,
        counts: primary.result.counts,
        warnings: primary.result.warnings,
        elapsedMs: primary.result.elapsedMs,
        wallMs: primary.wallMs,
        candidates: primary.result.candidates,
      }
    : primary,
  fallback: fallback.ok
    ? {
        query: fallback.result.query,
        provider: fallback.result.provider,
        providers: fallback.result.providers,
        counts: fallback.result.counts,
        warnings: fallback.result.warnings,
        elapsedMs: fallback.result.elapsedMs,
        wallMs: fallback.wallMs,
        candidates: fallback.result.candidates.map((item) => ({
          title: item.title,
          year: item.year,
          doi: item.doi,
          provider: item.provider,
          url: item.url,
        })),
      }
    : fallback,
}
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

const lines = [
  '# 0.9 实时文献检索验收',
  '',
  `- 时间：${payload.generatedAt}`,
  `- 结果：${ok ? 'PASS' : 'FAIL'}`,
  `- 主查询：${primary.ok ? `${primary.result.query} · ${primary.result.counts.openalex} OpenAlex + ${primary.result.counts.crossref} Crossref · ${primary.wallMs} ms` : `${primary.code}: ${primary.error}`}`,
  `- 回退查询：${fallback.ok ? `${fallback.result.query} · ${fallback.result.counts.crossref} Crossref · ${fallback.wallMs} ms` : `${fallback.code}: ${fallback.error}`}`,
  '',
  '## 检查',
  '',
  ...Object.entries(checks).map(([key, value]) => `- ${value ? 'PASS' : 'FAIL'} \`${key}\``),
  '',
  '## 主查询候选',
  '',
  ...candidates.map(
    (item, index) =>
      `${index + 1}. ${item.title} (${item.year ?? 'n.d.'}) · ${item.doi || 'no DOI'} · ${(item.providers || []).join('+')} · ${item.venue || 'no venue'}`,
  ),
  '',
  `完整 JSON：${out}`,
  '',
]
writeFileSync(join(here, 'search-live.log'), lines.join('\n'), 'utf8')

console.log(lines.join('\n'))
if (!ok) process.exitCode = 1
