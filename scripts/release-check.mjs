/**
 * Release-contract check. Cheap, deterministic and safe to run in CI before
 * the test suite: it catches the class of mistake that unit tests cannot see
 * (one version constant left behind, a stale bundle, a missing migration doc).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SCHEMA_VERSION, VERSION } from '../lib/config.js'
import { TOOL_NAMES } from '../lib/tools.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const failures = []
const checks = []
const check = (name, ok, detail) => {
  checks.push({ name, ok: ok === true, detail: ok === true ? '' : detail || '' })
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`)
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
check('package version', packageJson.version === VERSION, `${packageJson.version} != ${VERSION}`)
check('schema 5', SCHEMA_VERSION === 5, `SCHEMA_VERSION=${SCHEMA_VERSION}`)
check('16 tools', TOOL_NAMES.length === 16, `${TOOL_NAMES.length} tools`)
check('version in package description', (packageJson.description || '').includes(VERSION), `description must name ${VERSION}`)

const clientSource = readFileSync(join(root, 'src/client/00-head.js'), 'utf8')
check(
  'client version',
  clientSource.includes(`const VERSION = "${VERSION}"`),
  `src/client/00-head.js must use ${VERSION}`,
)
check('client health view', clientSource.includes('health: "健康"') && clientSource.includes('runHealth: "运行体检"'))
check('client portfolio view', clientSource.includes('portfolio: "组合"') && clientSource.includes('archivedProjects: "归档项目"'))

const bundle = readFileSync(join(root, 'client.js'), 'utf8')
check('bundle version', bundle.includes(`const VERSION = "${VERSION}"`), 'client.js is stale; run npm run build:client')
check('bundle health view', bundle.includes('function Health(props)'), 'client.js lacks the health view')
check('bundle portfolio view', bundle.includes('function Portfolio(props)'), 'client.js lacks the portfolio view')
check('bundle size bounded', Buffer.byteLength(bundle) < 220_000, `${Buffer.byteLength(bundle)} bytes`)

const readme = readFileSync(join(root, 'README.md'), 'utf8')
check('README version', readme.includes(`当前版本 **${VERSION}**`) || readme.includes(`**${VERSION}**`), 'README must name the current version')
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
check('CHANGELOG entry', changelog.includes(`## [${VERSION}]`), `CHANGELOG needs a ${VERSION} entry`)
for (const file of [
  'docs/1.0.0-发布契约.md',
  'docs/1.0.0-迁移与恢复.md',
  'docs/1.0.0-验收.md',
  `docs/${VERSION}-操作台.md`,
  `docs/${VERSION}-验收.md`,
  'MIGRATION.md',
  'SECURITY.md',
  'lib/stewardship.js',
  'scripts/acceptance.mjs',
]) {
  check(`file ${file}`, existsSync(join(root, file)), `missing required ${VERSION} artifact`)
}

const report = {
  ok: failures.length === 0,
  version: VERSION,
  schemaVersion: SCHEMA_VERSION,
  tools: TOOL_NAMES.length,
  bundleBytes: Buffer.byteLength(bundle),
  checks,
  failures,
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (!report.ok) process.exitCode = 1
