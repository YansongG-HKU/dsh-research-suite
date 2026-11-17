/**
 * dsh-research-suite — Host plugin entry.
 *
 * Owns the campaign store under `<DSH_HOME>/research-suite`, the fourteen `rsx_*`
 * agent tools, one short system-prompt section and the loopback panel routes.
 * The Client half (declared through `dsh.client`) renders the 科研套件 panel and
 * calls the same Host service — one source of truth.
 */
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { DATA_DIR_NAME, resolveConfig } from './lib/config.js'
import { ResearchStore } from './lib/ledger.js'
import { registerPanel } from './lib/panel.js'
import { ResearchService } from './lib/service.js'
import { createTools } from './lib/tools.js'
import { messageOf } from './lib/util.js'

export const inject = ['tools']

export const name = 'dsh-research-suite'

const PROMPT_SECTION = [
  'Research Suite (科研套件) is the project container for multi-step research here. Use it whenever the task will outlive one answer: literature reviews, replications, data analyses, evaluations, due diligence, or anything the user calls a 研究/项目/综述/复现/尽调/评测.',
  'A campaign has nine gates: scoping → survey → hypothesis → design → execute → analyze → write → review → release. Start with rsx_template action:"apply" (11 task presets + replication/ablation/adversarial-review protocols) or rsx_campaign action:"create". Record the question, scope and success criteria, then run rsx_gate action:"check" before advancing.',
  'For sector work select a domain profile with rsx_domain action:"set": finance, ai, medicine or industrial. A profile turns protocol fields into blocking checks at their stages (point-in-time/OOS dates, TRIPOD+AI, PRISMA counts, MSA/DOE, review roles, monitoring); conditional fields switch off when the design/risk tier makes them inapplicable. It is an alignment checklist, not a certification claim. Use rsx_domain action:"check" to see the exact missing fields for the current stage.',
  'Log as you work, not at the end: rsx_source for what you read (action:"import" ingests Zotero/Scholar BibTeX), rsx_claim for what you assert, rsx_evidence to link claim↔source/run, rsx_run for a real command + seed + metrics, rsx_number for every number with trace run:R-xxxxxxxxxx#metric or source:S-0001, rsx_extract to build the source × dimension matrix, rsx_artifact for datasets/code/environments, rsx_figure for figure+code+data provenance. Numbers in the manuscript are written as {{N-0001}} and citations as [[src:S-0001]]; the write gate rejects orphan digits and unknown refs.',
  'Before the review gate, run rsx_review action:"audit": it checks citations resolve, quotes occur in the captured text, numbers match the run that produced them, figures carry code+data, the pre-registration still describes the analysis, and domain fields/roles are present. Findings are blocking/major/minor/info; only blocking stops the gate, and any later edit makes the audit stale. For a domain campaign add one rsx_gate action:"review" per domain role (affiliation, conflict, independent, qualification), then audit after those reviews.',
  'Never invent a ledger entry: run the command first, then record what actually happened. If a gate blocks, read detail.blocking and fix the checks instead of working around them. Before delivery call rsx_write action:"declaration" (AI + watermark + human reviewer), record rsx_campaign action:"monitor" (plan, owner, cadence, metrics, observations), run rsx_campaign action:"evaluate" for the 12-dimension loop score, then action:"export", and give the user the REPORT.md path plus LOOP.md / DOMAIN.md / references.bib / AUDIT.md / provenance.json.',
  'The sidebar panel shows the same state; the user can create campaigns, inspect the ledger, browse templates, edit domain/monitoring state, run the loop evaluation and read the report there. Continue an existing campaign by reading rsx_campaign action:"status" rather than starting over.',
].join(' ')

function resolveDataDir(config) {
  if (typeof config?.dataDir === 'string' && config.dataDir.trim().length > 0) return config.dataDir.trim()
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, DATA_DIR_NAME)
}

function createLog(ctx) {
  const write = (level, message) => {
    try {
      const logger = ctx?.logger
      if (typeof logger?.[level] === 'function') logger[level](`[dsh-research-suite] ${message}`)
    } catch {
      /* logging never breaks activation */
    }
  }
  return {
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
  }
}

export function apply(ctx, rowConfig) {
  const log = createLog(ctx)
  const config = resolveConfig(rowConfig)
  const dataDir = resolveDataDir(config)
  let service
  let panelDispose = null
  let disposed = false

  try {
    mkdirSync(dataDir, { recursive: true })
    const store = new ResearchStore({ dir: dataDir, log }).init()
    service = new ResearchService({ store, config, log })
  } catch (error) {
    log.warn(`could not initialise the plugin; staying inert: ${messageOf(error)}`)
    return () => {}
  }

  let registered = 0
  try {
    for (const definition of createTools({ service, log })) {
      try {
        ctx.effect(() => ctx.tools.register(definition), `dsh-research-suite: ${definition.name}`)
        registered += 1
      } catch (error) {
        log.warn(`could not register ${definition.name}: ${messageOf(error)}`)
      }
    }
  } catch (error) {
    log.warn(`could not build the tool definitions: ${messageOf(error)}`)
  }

  try {
    if (typeof ctx.systemPrompt?.section === 'function') {
      ctx.effect(
        () =>
          ctx.systemPrompt.section({
            name: 'dsh-research-suite',
            order: 9176,
            interpolate: false,
            text: () => PROMPT_SECTION,
          }),
        'dsh-research-suite: prompt section',
      )
    }
  } catch (error) {
    log.warn(`could not register the prompt section: ${messageOf(error)}`)
  }

  try {
    panelDispose = registerPanel({ ctx, service, log })
  } catch (error) {
    log.warn(`could not register the panel routes: ${messageOf(error)}`)
  }

  log.info(`active: ${registered} tools, panel /dsh-research-suite, data ${dataDir}`)

  return () => {
    if (disposed) return
    disposed = true
    try {
      panelDispose?.()
    } catch {
      /* best effort */
    }
  }
}
