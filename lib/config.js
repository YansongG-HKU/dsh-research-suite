/** Plugin identity, limits, pipeline constants and configuration resolution. */

export const PLUGIN_NAME = 'dsh-research-suite'
export const VERSION = '0.4.0'
export const ROUTE_PREFIX = '/dsh-research-suite'
export const REQUEST_HEADER = 'x-dsh-research-suite'
export const DATA_DIR_NAME = 'research-suite'

export const STAGE_ORDER = Object.freeze([
  'scoping',
  'survey',
  'hypothesis',
  'design',
  'execute',
  'analyze',
  'write',
  'review',
  'release',
])

export const STAGE_LABELS = Object.freeze({
  scoping: { zh: '定题', en: 'Scoping' },
  survey: { zh: '文献测绘', en: 'Survey' },
  hypothesis: { zh: '假设', en: 'Hypothesis' },
  design: { zh: '设计', en: 'Design' },
  execute: { zh: '执行', en: 'Execute' },
  analyze: { zh: '分析', en: 'Analyze' },
  write: { zh: '写作', en: 'Write' },
  review: { zh: '评审', en: 'Review' },
  release: { zh: '发布', en: 'Release' },
})

export const TIERS = Object.freeze({
  S: { tokens: 60_000, seconds: 1_800, agents: 1 },
  M: { tokens: 400_000, seconds: 14_400, agents: 3 },
  L: { tokens: 2_000_000, seconds: 86_400, agents: 12 },
  XL: { tokens: 12_000_000, seconds: 259_200, agents: 64 },
})

export const STAGE_SHARE = Object.freeze({
  scoping: 0.03,
  survey: 0.12,
  hypothesis: 0.1,
  design: 0.08,
  execute: 0.4,
  analyze: 0.1,
  write: 0.1,
  review: 0.05,
  release: 0.02,
})

export const CLAIM_STATUSES = Object.freeze(['proposed', 'supported', 'contested', 'refuted'])
export const RELATIONS = Object.freeze(['supports', 'refutes', 'context'])
export const SOURCE_KINDS = Object.freeze(['paper', 'preprint', 'dataset', 'registry', 'report', 'news', 'book', 'other'])
export const RELIABILITY = Object.freeze(['primary', 'secondary', 'tertiary'])
export const ARTIFACT_ROLES = Object.freeze([
  'file',
  'source',
  'dataset',
  'code',
  'figure',
  'stdout',
  'supplement',
  'manuscript',
  'environment',
  'other',
])
export const AUDIT_SEVERITIES = Object.freeze(['blocking', 'major', 'minor', 'info'])

export const LIMITS = Object.freeze({
  maxBodyBytes: 2 * 1024 * 1024,
  maxToolPayload: 120 * 1024,
  maxManuscriptBytes: 2 * 1024 * 1024,
  maxArtifactBytes: 64 * 1024 * 1024,
  maxCampaigns: 200,
  maxBibtexEntries: 100,
  maxExtractions: 500,
})

export const DEFAULT_SETTINGS = Object.freeze({
  defaultTier: 'M',
  language: 'zh',
  allowExec: false,
})

export function resolveConfig(rowConfig) {
  const raw = rowConfig && typeof rowConfig === 'object' ? rowConfig : {}
  return {
    defaultTier: typeof raw.defaultTier === 'string' && TIERS[raw.defaultTier] ? raw.defaultTier : DEFAULT_SETTINGS.defaultTier,
    language: raw.language === 'en' ? 'en' : 'zh',
    allowExec: raw.allowExec === true,
    dataDir: typeof raw.dataDir === 'string' && raw.dataDir.trim() ? raw.dataDir.trim() : '',
  }
}
