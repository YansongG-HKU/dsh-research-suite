#!/usr/bin/env node
/**
 * Exercise the real rsx_search tool handler (not just the module) against
 * live OpenAlex/Crossref, in a throwaway campaign store.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ResearchStore } from '../../workspace/dsh-research-suite/lib/ledger.js'
import { ResearchService } from '../../workspace/dsh-research-suite/lib/service.js'
import { createTools } from '../../workspace/dsh-research-suite/lib/tools.js'
import { resolveConfig } from '../../workspace/dsh-research-suite/lib/config.js'

const here = dirname(fileURLToPath(import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'rs-0.9-tool-'))
const store = new ResearchStore({ dir }).init()
const service = new ResearchService({ store, config: resolveConfig({}), log: { info() {}, warn() {} } })
const tools = createTools({ service })
const tool = tools.find((item) => item.name === 'rsx_search')
assert.ok(tool, 'rsx_search must be registered')

const started = Date.now()
const result = await tool.execute({ query: 'multi-agent research system', provider: 'both', limit: 4, timeoutMs: 12_000 })
const wallMs = Date.now() - started
const checks = {
  ok: result.ok === true,
  bothProviders: result.counts?.openalex >= 1 && result.counts?.crossref >= 1,
  merged: result.candidates?.some((item) => (item.providers || []).length > 1),
  bounded: result.candidates?.length === 4,
  noWarnings: result.warnings?.length === 0,
  didNotWriteCampaigns: service.state().campaigns.length === 0,
  underBudget: wallMs < 30_000,
}
const ok = Object.values(checks).every(Boolean)
const payload = {
  ok,
  generatedAt: new Date().toISOString(),
  tool: tool.name,
  wallMs,
  checks,
  counts: result.counts,
  warnings: result.warnings,
  candidates: (result.candidates || []).map((item) => ({
    title: item.title,
    year: item.year,
    doi: item.doi,
    providers: item.providers,
  })),
}
writeFileSync(join(here, 'tool-call.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(payload, null, 2))
try {
  rmSync(dir, { recursive: true, force: true })
} catch {
  /* Windows may hold a handle briefly */
}
if (!ok) process.exitCode = 1
