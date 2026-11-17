/**
 * Agent-facing tools. One tool per entity, each returning a compact JSON
 * payload. Failures are structured (`ok:false`) so the agent can recover
 * without guessing.
 */
import { PLUGIN_NAME, STAGE_ORDER, TIERS, VERSION, LIMITS } from './config.js'
import { messageOf, truncate } from './util.js'

const OUTPUT = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => {
    const bounded = truncate(JSON.stringify(value ?? null), LIMITS.maxToolPayload)
    return [{ type: 'text', text: bounded.truncated ? `${bounded.text}\n… output truncated` : bounded.text }]
  },
}

function failure(code, error, hint, detail) {
  return { ok: false, code, error, repair: hint, ...(detail !== undefined ? { detail } : {}) }
}

function codedError(code, message, detail) {
  const error = new Error(message)
  error.code = code
  if (detail !== undefined) error.detail = detail
  return error
}

function repairFor(code) {
  switch (code) {
    case 'no_campaign':
      return 'Create one: rsx_campaign action:"create" {question, scope, success} or rsx_template action:"apply".'
    case 'not_found':
      return 'List what exists first (rsx_campaign action:"list" / rsx_source action:"list" / rsx_gate action:"history").'
    case 'invalid_input':
      return 'Re-read the parameter descriptions and pass valid values.'
    case 'gate_blocked':
      return 'Fix the blocking checks (see detail.blocking + detail.checks), then call rsx_gate action:"advance" again.'
    case 'trace_unresolved':
    case 'trace_mismatch':
      return 'Use trace "run:R-xxxxxxxxxx#metric" for a recorded run metric, or "source:S-0001" for a literature number.'
    case 'budget_in_use':
      return 'Tier cannot change after spend; create a new campaign or keep the current tier.'
    case 'too_large':
      return 'Split the content or pass a file path within the size limit.'
    default:
      return 'Fix the arguments and retry; call rsx_campaign action:"status" to inspect state.'
  }
}

function guarded(handler) {
  return async (args) => {
    try {
      return await handler(args && typeof args === 'object' ? args : {})
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : 'failed'
      return failure(code, messageOf(error), repairFor(code), error?.detail)
    }
  }
}

const CAMPAIGN = {
  type: 'string',
  description: 'Campaign id. Omit to use the current campaign.',
}

export function createTools({ service }) {
  const tools = []

  tools.push({
    name: 'rsx_campaign',
    description: [
      'Research campaign control room: create/list/get/update a campaign, record the world model, the disconfirming search, the pre-registration and budget spend, and inspect integrity.',
      'A campaign moves through scoping → survey → hypothesis → design → execute → analyze → write → review → release. Use this first, then the entity tools (source/claim/evidence/run/number/extract/artifact/figure/review), then rsx_gate to advance.',
      'action:"status" returns the current stage, the gate state and the hash-chain integrity; action:"world" records entities/facts/questions/failures/coverage/novelty/safety used by the gates; action:"monitor" records the post-release monitoring plan that closes the loop.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'list', 'get', 'update', 'world', 'search', 'prereg', 'budget', 'archive', 'status', 'monitor'], description: 'Operation (default: get).' },
        campaign: CAMPAIGN,
        title: { type: 'string', description: 'Campaign title (create/update).' },
        question: { type: 'string', description: 'The research question (create/update). At least 12 characters for the scoping gate.' },
        scope: { type: 'string', description: 'Boundaries: what is in and out of scope.' },
        success: { type: 'string', description: 'Falsifiable success criteria.' },
        numbersAllowlist: { type: 'string', pattern: '^[0-9.,\\s]+$', description: 'Comma/space separated constants allowed in the manuscript without a ledger trace (update action).' },
        tier: { type: 'string', enum: ['S', 'M', 'L', 'XL'], description: 'Effort tier; S=60k tokens, M=400k, L=2M, XL=12M.' },
        domain: { type: 'string', description: 'Optional domain profile id at create: finance, ai, medicine, industrial, or general.' },
        values: { type: 'object', additionalProperties: true, description: 'Optional domain field values at create, keyed by field id (see rsx_domain action:"list").' },
        monitoring: { type: 'object', additionalProperties: true, description: 'For monitor: {plan, owner, cadence, signals:[...], status:"planned"|"active"|"paused"|"closed", reviewedAt, notes}.' },
        plan: { type: 'string', description: 'Monitoring plan (monitor action).' },
        owner: { type: 'string', description: 'Monitoring owner (monitor action).' },
        cadence: { type: 'string', description: 'Monitoring review cadence (monitor action).' },
        signals: { type: 'array', items: { type: 'string' }, description: 'Monitoring signals / metrics (monitor action).' },
        status: { type: 'string', enum: ['none', 'planned', 'active', 'paused', 'closed'], description: 'Monitoring status (monitor action).' },
        reviewedAt: { type: 'string', description: 'Last monitoring review date/time.' },
        kind: { type: 'string', description: 'World bucket for world set/get: entity, fact, question, failure, coverage, novelty, safety.' },
        key: { type: 'string', description: 'World key (world set/get).' },
        value: { description: 'World value; for novelty a plain string records {checked:true, nearest}. For safety use dual_use:"pass".', additionalProperties: true },
        query: { type: 'string', description: 'Query used for the disconfirming search.' },
        disconfirming: { type: 'boolean', description: 'Set true to record that a disconfirming search was run.' },
        spec: { type: 'object', additionalProperties: true, description: 'Pre-registration: {hypothesisId, metric, n, analysisPlan, stoppingRule, seed, controls:["negative"], envLock}.' },
        stage: { type: 'string', enum: STAGE_ORDER, description: 'Budget stage (default: current stage).' },
        tokens: { type: 'integer', description: 'Tokens to charge to the stage budget.' },
        seconds: { type: 'integer', description: 'Seconds to charge to the stage budget.' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 30_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'get'
      switch (action) {
        case 'create':
          return { ok: true, ...service.create(args) }
        case 'list':
          return { ok: true, ...service.state() }
        case 'get':
          return { ok: true, ...service.get(args.campaign) }
        case 'status': {
          const { state, integrity } = service.get(args.campaign)
          return {
            ok: true,
            campaign: { id: state.id, title: state.title, stage: state.stage, tier: state.tier, domain: state.domain || null },
            gate: service.gate(state.id, { action: 'check' }).gate,
            integrity,
          }
        }
        case 'monitor':
          return { ok: true, ...service.monitor(args.campaign, args.monitoring && typeof args.monitoring === 'object' ? { ...args.monitoring, ...args } : args) }
        case 'update':
          return { ok: true, ...service.update(args.campaign, args) }
        case 'world':
          return { ok: true, ...service.world(args.campaign, args) }
        case 'search':
          return { ok: true, ...service.search(args.campaign, args) }
        case 'prereg':
          return { ok: true, ...service.prereg(args.campaign, args) }
        case 'budget':
          return { ok: true, ...service.budget(args.campaign, args) }
        case 'archive':
          return { ok: true, ...service.archive(args.campaign) }
        default:
          throw codedError('invalid_input', `unknown action: ${action}`)
      }
    }),
  })

  tools.push({
    name: 'rsx_template',
    description: [
      'Research templates: 11 task presets (literature review, clinical trials, ML pipeline, health trends, paper slides, interview synthesis, OSS evaluation, quant backtest, academic site, due diligence, industrial DOE) plus 3 method protocols (replication, ablation, adversarial review). Templates tagged with a domain start the campaign with finance/ai/medicine/industrial checks already active.',
      'action:"apply" creates a campaign pre-filled from the template and returns a ready-to-paste prompt plus the deliverable checklist; then run the scoping gate.',
      'action:"list" filters by kind (task/method); action:"get" returns one template with its placeholders.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get', 'apply'], description: 'Operation (default: list).' },
        kind: { type: 'string', enum: ['task', 'method'], description: 'Filter by template kind.' },
        template: { type: 'string', description: 'Template id, e.g. lit-review, ml-pipeline, replicate, ablation, review.' },
        topic: { type: 'string', description: 'Fills {topic} in the template (subject of the study).' },
        data: { type: 'string', description: 'Fills {data} (dataset path or description).' },
        paper: { type: 'string', description: 'Fills {paper} (paper title / arXiv id / path).' },
        company: { type: 'string', description: 'Fills {company}.' },
        name: { type: 'string', description: 'Fills {name} (person / project name).' },
        libs: { type: 'string', description: 'Fills {libs} (libraries to compare).' },
        strategy: { type: 'string', description: 'Fills {strategy}.' },
        claim: { type: 'string', description: 'Fills {claim} (claim to ablate).' },
        target: { type: 'string', description: 'Fills {target} (work to review).' },
        lang: { type: 'string', enum: ['zh', 'en'], description: 'Template language (default zh).' },
        domain: { type: 'string', description: 'Optional domain override: finance, ai, medicine, industrial, or general.' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 30_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'list'
      if (action === 'list') return { ok: true, templates: service.templates(args.kind) }
      if (action === 'get') {
        const found = service.templates().find((item) => item.id === (args.template || args.id))
        if (!found) throw codedError('not_found', `unknown template: ${args.template}`)
        return { ok: true, template: found }
      }
      if (action === 'apply') return { ok: true, ...service.templateApply(args) }
      throw codedError('invalid_input', `unknown action: ${action}`)
    }),
  })

  tools.push({
    name: 'rsx_source',
    description: [
      'Evidence ledger — sources. Record a paper/preprint/dataset/registry/report/news item with title, year, kind, reliability (primary/secondary/tertiary), DOI/authors/journal, and captured content (text or a file path).',
      'Captured content is stored as a content-addressed artifact and hashed; the survey gate needs 8 sources, 2 primary, 1 from 2023+, captured content, a disconfirming search and a coverage map.',
      'action:"import" parses a BibTeX string (Zotero/Google Scholar export) into multiple sources, deduplicating DOI/title; action:"bibtex" renders references.bib. action:"list" returns rows; ids look like S-0001 and are cited in manuscripts as [[src:S-0001]].',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list', 'get', 'import', 'bibtex'], description: 'Operation (default: add).' },
        campaign: CAMPAIGN,
        title: { type: 'string', description: 'Source title.' },
        url: { type: 'string', description: 'Canonical URL.' },
        doi: { type: 'string', description: 'DOI (without https://doi.org/).' },
        authors: { type: 'string', description: 'Author list, "A and B" or a plain string.' },
        journal: { type: 'string', description: 'Journal / venue / booktitle.' },
        bibtexKey: { type: 'string', description: 'Explicit BibTeX citation key.' },
        bibtex: { type: 'string', description: 'BibTeX text: one record for add, many for import.' },
        year: { type: 'integer', description: 'Publication year.' },
        kind: { type: 'string', enum: ['paper', 'preprint', 'dataset', 'registry', 'report', 'news', 'book', 'other'], description: 'Source kind.' },
        reliability: { type: 'string', enum: ['primary', 'secondary', 'tertiary'], description: 'Primary = original data/paper; secondary = review/news; tertiary = index.' },
        content: { type: 'string', description: 'Captured full text / abstract / key passages (stored as an artifact).' },
        path: { type: 'string', description: 'Absolute path to a captured text/PDF-extract file (alternative to content).' },
        locator: { type: 'string', description: 'Page / section / registry id.' },
        notes: { type: 'string', description: 'Why this source matters.' },
        retracted: { type: 'boolean', description: 'Mark a source as retracted; citing it blocks the audit.' },
        id: { type: 'string', description: 'Source id for get.' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 60_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'add'
      if (action === 'add') return { ok: true, ...service.sourceAdd(args.campaign, args) }
      if (action === 'import') return { ok: true, ...service.sourceImportBibtex(args.campaign, args) }
      if (action === 'bibtex') return { ok: true, ...service.sourceBibtex(args.campaign) }
      const { state } = service.get(args.campaign)
      if (action === 'get') {
        const source = state.sources.find((item) => item.id === args.id)
        if (!source) throw codedError('not_found', `source not found: ${args.id}`)
        return { ok: true, source }
      }
      return { ok: true, sources: state.sources }
    }),
  })

  tools.push({
    name: 'rsx_claim',
    description: [
      'Evidence ledger — claims and hypotheses. A hypothesis must state falsifier, killCriterion, predicted observation, metricName and metricUnit; the hypothesis gate needs two supporting evidence rows and a novelty check.',
      'action:"status" sets proposed/supported/contested/refuted with a reason; every claim must leave "proposed" before analyze/review gates pass.',
      'Use kind:"hypothesis" for the main testable claim (one per campaign is enough), kind:"claim" for supporting assertions.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'status', 'list'], description: 'Operation (default: add).' },
        campaign: CAMPAIGN,
        statement: { type: 'string', description: 'The claim, stated so it could be false.' },
        kind: { type: 'string', enum: ['claim', 'hypothesis', 'question'], description: 'Entity kind (default claim).' },
        falsifier: { type: 'string', description: 'What observation would falsify it.' },
        killCriterion: { type: 'string', description: 'When to abandon the line of work.' },
        predicted: { type: 'string', description: 'The predicted observation.' },
        metricName: { type: 'string', description: 'Primary metric name.' },
        metricUnit: { type: 'string', description: 'Metric unit.' },
        confidence: { type: 'number', description: '0–1 subjective confidence.' },
        claim: { type: 'string', description: 'Claim id (status action).' },
        status: { type: 'string', enum: ['proposed', 'supported', 'contested', 'refuted'], description: 'New status.' },
        reason: { type: 'string', description: 'Why the status changed.' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 30_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'add'
      if (action === 'add') return { ok: true, ...service.claimAdd(args.campaign, args) }
      if (action === 'status') return { ok: true, ...service.claimStatus(args.campaign, args) }
      const { state } = service.get(args.campaign)
      return { ok: true, claims: state.claims }
    }),
  })

  tools.push({
    name: 'rsx_evidence',
    description: [
      'Evidence ledger — link a claim to a source (S-0001), a run (R-xxxxxxxxxx) or a registered artifact (sha256:…), with relation supports/refutes/context plus an optional locator and quote.',
      'Evidence is the only way a claim becomes supported: the hypothesis gate requires two supporting rows, and the report lists every claim with its evidence count.',
      'action:"list" shows the ledger with the exact quote that backs each row.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list'], description: 'Operation (default: add).' },
        campaign: CAMPAIGN,
        claim: { type: 'string', description: 'Claim id, e.g. C-0001.' },
        relation: { type: 'string', enum: ['supports', 'refutes', 'context'], description: 'Relation (default supports).' },
        ref: { type: 'string', description: 'S-0001, R-xxxxxxxxxx or sha256:…' },
        locator: { type: 'string', description: 'Page / section / table / metric key.' },
        quote: { type: 'string', description: 'The exact passage or metric that backs the claim.' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 30_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'add'
      if (action === 'add') return { ok: true, ...service.evidenceAdd(args.campaign, args) }
      const { state } = service.get(args.campaign)
      return { ok: true, evidence: state.evidence }
    }),
  })

  tools.push({
    name: 'rsx_run',
    description: [
      'Record a real execution (default: record only, the plugin does not run commands). Pass the exact command, status, seed, exit code, control:"negative" for the negative control, metrics as a JSON object, and optionally stdoutPath.',
      'The execute gate requires one successful seeded run with metrics, its exact command, and a really-run negative control. Metrics keys become traceable number sources: run:R-xxxxxxxxxx#key.',
      'Never invent a run: run the command yourself with the shell tool, then record it here with the real outputs.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['record', 'list', 'get'], description: 'Operation (default: record).' },
        campaign: CAMPAIGN,
        command: { type: 'string', description: 'The exact command that was run.' },
        status: { type: 'string', enum: ['success', 'failed', 'skipped'], description: 'Outcome.' },
        exitCode: { type: 'integer', description: 'Process exit code.' },
        seed: { type: 'integer', description: 'Random seed used.' },
        control: { type: 'string', description: 'Set "negative" for the negative control run.' },
        metrics: { type: 'object', additionalProperties: true, description: 'Metric name → number, e.g. {"pearson_r":0.446}.' },
        stage: { type: 'string', enum: STAGE_ORDER, description: 'Pipeline stage (default current).' },
        stdoutPath: { type: 'string', description: 'Absolute path to captured stdout/stderr (stored as an artifact).' },
        note: { type: 'string', description: 'What changed / what to watch.' },
        id: { type: 'string', description: 'Run id for get.' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 60_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'record'
      if (action === 'record') return { ok: true, ...service.runRecord(args.campaign, args) }
      const { state } = service.get(args.campaign)
      if (action === 'get') {
        const run = state.runs.find((item) => item.id === args.id)
        if (!run) throw codedError('not_found', `run not found: ${args.id}`)
        return { ok: true, run }
      }
      return { ok: true, runs: state.runs }
    }),
  })

  tools.push({
    name: 'rsx_number',
    description: [
      'Evidence ledger — numbers. Register every number that will appear in the manuscript with a trace: run:R-xxxxxxxxxx#metric for your own runs, source:S-0001 for literature values.',
      'The tool verifies the value against the traced run metric on write, returns the markdown token {{N-0001}}, and the analyze gate requires all traces to resolve and at least one uncertainty.',
      'Write numbers in the manuscript as {{N-0001}} — never type them by hand; the write gate flags orphan digits.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list'], description: 'Operation (default: add).' },
        campaign: CAMPAIGN,
        name: { type: 'string', description: 'Human-readable metric name.' },
        value: { type: 'number', description: 'The number.' },
        unit: { type: 'string', description: 'Unit (%, r, ms, mg/L, …).' },
        uncertainty: { type: 'string', description: 'CI / SD / SE / range, e.g. "95% CI 0.31–0.57".' },
        trace: { type: 'string', description: 'run:R-xxxxxxxxxx#key or source:S-0001.' },
        note: { type: 'string', description: 'How it was computed.' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 30_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'add'
      if (action === 'add') return { ok: true, ...service.numberAdd(args.campaign, args) }
      const { state } = service.get(args.campaign)
      return { ok: true, numbers: state.numbers }
    }),
  })

  tools.push({
    name: 'rsx_extract',
    description: [
      'Evidence extraction matrix (Elicit-style): one row per source × dimension, with value, exact quote, locator and confidence. The matrix is exported as MATRIX.md/matrix.csv and shown in the panel.',
      'Use it for literature reviews and cross-paper comparison: dimensions are the columns, each source gets a row. The audit checks that a quote actually occurs in the captured source text.',
      'action:"matrix" returns the pivot table plus Markdown and CSV; action:"list" filters by source/dimension.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list', 'matrix'], description: 'Operation (default: add).' },
        campaign: CAMPAIGN,
        source: { type: 'string', description: 'Source id, e.g. S-0001.' },
        dimension: { type: 'string', description: 'Column name, e.g. sample_size / method / effect_size.' },
        value: { description: 'Cell value (string or number).' },
        quote: { type: 'string', description: 'Exact passage from the captured source supporting the value.' },
        locator: { type: 'string', description: 'Page / section / table.' },
        confidence: { type: 'number', description: '0–1 extraction confidence.' },
        notes: { type: 'string', description: 'Caveats for this cell.' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 30_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'add'
      if (action === 'add') return { ok: true, ...service.extractionAdd(args.campaign, args) }
      if (action === 'matrix') return { ok: true, ...service.matrix(args.campaign) }
      return { ok: true, ...service.extractionList(args.campaign, args) }
    }),
  })

  tools.push({
    name: 'rsx_review',
    description: [
      'Automated reviewer (Claude Science-style): checks every manuscript citation resolves to a captured source, every quote occurs in the captured text, every number matches the run that produced it, every figure has figure+code+data provenance, the pre-registration still describes the executed analysis, and the negative control is real.',
      'Findings have severity blocking/major/minor/info. Only blocking findings stop the rsx_gate review gate; majors are for the human reviewer to resolve. The audit records a subject hash and an HMAC-SHA256 signature over the decision, so any later edit makes it stale or invalid and the review gate asks for a fresh audit.',
      'action:"audit" runs and records the signed audit; action:"view" returns the latest audit + matrix; action:"list" shows audit history, signature status and freshness.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['audit', 'view', 'list'], description: 'Operation (default: audit).' },
        campaign: CAMPAIGN,
        record: { type: 'boolean', description: 'Set false to run a dry audit without appending to the ledger (default true).' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 60_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'audit'
      if (action === 'audit') return { ok: true, ...service.audit(args.campaign, { record: args.record !== false }) }
      if (action === 'view') return { ok: true, ...service.auditView(args.campaign) }
      return { ok: true, ...service.auditList(args.campaign) }
    }),
  })

  tools.push({
    name: 'rsx_artifact',
    description: [
      'Content-addressed artifacts: register a dataset, code file, environment lock, supplementary file or any other evidence with a role and a description. Bytes are hashed; the same content is never stored twice.',
      'Every artifact is exported under artifacts/ and appears in provenance.json and ro-crate-metadata.json. Use action:"list"/"get" to inspect roles, sizes and a short text preview.',
      'Figures should go through rsx_figure so figure+code+data are linked as one provenance unit.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list', 'get'], description: 'Operation (default: add).' },
        campaign: CAMPAIGN,
        path: { type: 'string', description: 'Absolute path to the file.' },
        content: { type: 'string', description: 'UTF-8 content, alternative to path.' },
        role: { type: 'string', enum: ['file', 'source', 'dataset', 'code', 'figure', 'stdout', 'supplement', 'manuscript', 'environment', 'other'], description: 'Artifact role (default file).' },
        label: { type: 'string', description: 'Human-readable label.' },
        description: { type: 'string', description: 'What this artifact is and how it was produced.' },
        mime: { type: 'string', description: 'MIME type, e.g. text/csv.' },
        artifact: { type: 'string', description: 'Artifact id for get.' },
        id: { type: 'string', description: 'Alias for artifact id.' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 60_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'add'
      if (action === 'add') return { ok: true, ...service.artifactAdd(args.campaign, args) }
      if (action === 'get') return { ok: true, ...service.artifactGet(args.campaign, args) }
      return { ok: true, ...service.artifactList(args.campaign, args) }
    }),
  })

  tools.push({
    name: 'rsx_figure',
    description: [
      'Attach a figure with full provenance: the figure file, the exact code that drew it, the data it read, optionally the environment artifact, the run id, a plain-language description and a caption.',
      'The write gate blocks figures without figure+code+data. The audit also checks that every referenced artifact exists and that the run resolves; prose-only figures are not release quality.',
      'Paths are registered automatically; existing sha256: ids are accepted too.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'list'], description: 'Operation (default: add).' },
        campaign: CAMPAIGN,
        artifact: { type: 'string', description: 'Figure image artifact id or path.' },
        path: { type: 'string', description: 'Alias for artifact path.' },
        codeArtifact: { type: 'string', description: 'Code artifact id or path.' },
        codePath: { type: 'string', description: 'Alias for code path.' },
        dataArtifact: { type: 'string', description: 'Data artifact id or path.' },
        dataPath: { type: 'string', description: 'Alias for data path.' },
        envArtifact: { type: 'string', description: 'Environment lock artifact id or path.' },
        envPath: { type: 'string', description: 'Alias for environment path.' },
        title: { type: 'string', description: 'Figure title.' },
        caption: { type: 'string', description: 'Caption used in the manuscript.' },
        description: { type: 'string', description: 'Plain-language description of what the figure shows.' },
        env: { type: 'string', description: 'Environment note (versions / hardware) if not using envArtifact.' },
        run: { type: 'string', description: 'Run id that produced the figure.' },
        source: { type: 'string', description: 'Source id (e.g. S-0001) the figure is based on.' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 60_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'add'
      if (action === 'add') return { ok: true, ...service.figureAttach(args.campaign, args) }
      return { ok: true, ...service.figureList(args.campaign) }
    }),
  })

  tools.push({
    name: 'rsx_domain',
    description: [
      'Domain research profiles: finance, AI/ML, medicine/clinical and industrial/engineering. Each profile maps required protocol fields to pipeline stages and adds blocking domain checks (PRISMA ordering, OOS dates, review roles, monitoring, etc.).',
      'action:"list" returns the four profiles; action:"get" returns the selected profile, values, completeness and current gate; action:"set" selects a profile and optionally merges values; action:"check" evaluates one stage.',
      'Selecting a domain is not a compliance claim: the profile is a structured alignment checklist. Use rsx_campaign action:"monitor" to close the post-release loop.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'get', 'set', 'check'], description: 'Operation (default: get).' },
        campaign: CAMPAIGN,
        domain: { type: 'string', description: 'Profile id: finance, ai, medicine, industrial, or general (clear).' },
        values: { type: 'object', additionalProperties: true, description: 'Field values keyed by profile field id; unknown ids are rejected. Text fields can be updated incrementally.' },
        stage: { type: 'string', enum: STAGE_ORDER, description: 'Stage for check (default: current).' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 30_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'get'
      if (action === 'list') return { ok: true, ...service.domains() }
      if (action === 'set') return { ok: true, ...service.domain(args.campaign, { ...args, action: 'set' }) }
      if (action === 'check') return { ok: true, ...service.domain(args.campaign, { ...args, action: 'check' }) }
      if (action === 'get') return { ok: true, ...service.domain(args.campaign, { action: 'get' }) }
      throw codedError('invalid_input', `unknown domain action: ${action}`)
    }),
  })

  tools.push({
    name: 'rsx_gate',
    description: [
      'The nine gates. action:"check" runs the gate for a stage (default: current) and records the result; action:"advance" advances only when the current stage passes, otherwise returns the blocking checks; action:"back" returns to an earlier stage with a reason.',
      'action:"review" records a structured review (reviewer, adversarial, verdict accept/minor/major/reject, issues with severity blocking/major/minor); the review gate needs two reviews and at least one adversarial.',
      'Review roles: a domain campaign needs one review per profile role (quant/risk, ml/safety, clinical/statistics, engineering/quality); pass role with the review.',
      'Run check before advance so you can see the exact blocking codes. Gate results are append-only history. The review gate also requires a fresh, passing automated audit whose HMAC signature verifies (`rsx_review action:"audit"`); release requires `stateOk !== false`.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['check', 'advance', 'back', 'history', 'review'], description: 'Operation (default: check).' },
        campaign: CAMPAIGN,
        stage: { type: 'string', enum: STAGE_ORDER, description: 'Stage to check, or the target stage for back.' },
        reason: { type: 'string', description: 'Why the work goes back.' },
        reviewer: { type: 'string', description: 'Reviewer name / role (review action).' },
        role: { type: 'string', description: 'Domain review role id (quant/risk, ml/safety, clinical/statistics, engineering/quality). Each domain role needs its own review.' },
        adversarial: { type: 'boolean', description: 'True for a red-team review.' },
        verdict: { type: 'string', enum: ['accept', 'minor', 'major', 'reject'], description: 'Review verdict.' },
        issues: {
          type: 'array',
          description: 'Review issues: [{severity:"blocking"|"major"|"minor", title, detail, resolved}]',
          items: { type: 'object', additionalProperties: true },
        },
        notes: { type: 'string', description: 'Review summary.' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 30_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'check'
      if (action === 'advance' || action === 'back' || action === 'review' || action === 'history' || action === 'check') {
        return { ok: true, ...service.gate(args.campaign, args) }
      }
      throw codedError('invalid_input', `unknown action: ${action}`)
    }),
  })

  tools.push({
    name: 'rsx_write',
    description: [
      'Writing and delivery. action:"manuscript" stores the draft (text or path) and runs the write gate; "declaration" records AI assistance + watermark + model + human reviewer; "render" writes REPORT.md, campaign.json, ledger.jsonl, declaration.md, references.bib, MATRIX.md, matrix.csv, AUDIT.md, DOMAIN.md (when a domain profile is set), provenance.json and ro-crate-metadata.json into the campaign exports folder.',
      'action:"export" additionally copies artifacts and builds BUNDLE.zip. action:"report" returns the Markdown without writing.',
      'Manuscript rules: numbers as {{N-0001}}, sources as [[src:S-0001]]; the write gate rejects orphan digits and unknown refs.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['manuscript', 'render', 'export', 'declaration', 'report'], description: 'Operation (default: render).' },
        campaign: CAMPAIGN,
        text: { type: 'string', description: 'Manuscript Markdown (manuscript action).' },
        path: { type: 'string', description: 'Absolute manuscript path (alternative to text).' },
        title: { type: 'string', description: 'Manuscript title.' },
        ai: { type: 'boolean', description: 'AI involvement (default true).' },
        watermark: { type: 'boolean', description: 'Watermark added (default true).' },
        model: { type: 'string', description: 'Model / tool name for the declaration.' },
        humanReviewer: { type: 'string', description: 'Human reviewer name.' },
        date: { type: 'string', description: 'Declaration date (YYYY-MM-DD).' },
        notes: { type: 'string', description: 'Declaration notes.' },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    timeoutMs: 60_000,
    isConcurrencySafe: () => false,
    execute: guarded(async (args) => {
      const action = args.action || 'render'
      if (action === 'report') return { ok: true, ...service.report(args.campaign) }
      return { ok: true, ...service.write(args.campaign, args) }
    }),
  })

  return tools
}

export const TOOL_NAMES = Object.freeze([
  'rsx_campaign',
  'rsx_template',
  'rsx_source',
  'rsx_claim',
  'rsx_evidence',
  'rsx_run',
  'rsx_number',
  'rsx_extract',
  'rsx_review',
  'rsx_artifact',
  'rsx_figure',
  'rsx_domain',
  'rsx_gate',
  'rsx_write',
])

export const TOOL_META = Object.freeze({ plugin: PLUGIN_NAME, version: VERSION, tiers: Object.keys(TIERS) })
