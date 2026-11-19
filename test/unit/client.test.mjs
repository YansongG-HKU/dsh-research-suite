import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const SOURCE = readFileSync(new URL('../../client.js', import.meta.url), 'utf8')

function collectButtons(node, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const item of node) collectButtons(item, out)
    return out
  }
  if (!Array.isArray(node.args)) return out
  if (typeof node.args[0] === 'function') return collectButtons(node.args[0](node.args[1]), out)
  const props = node.args[1]
  if (node.args[0] === 'button' && props && /rsx-fly-action/.test(props.className || '')) out.push(node)
  for (const child of node.args.slice(2)) collectButtons(child, out)
  return out
}

function loadClientPlugin() {
  let captured = null
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    window: {
      __ModuleLoader__: {
        load(options) {
          captured = options
        },
      },
      localStorage: { getItem: () => null, setItem: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    navigator: { language: 'zh-CN' },
    document: { createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }), head: { appendChild: () => {} } },
  }
  vm.runInNewContext(SOURCE, sandbox, { filename: 'client.js' })
  assert.ok(captured, 'the loader must be called')
  const reactStub = {
    createElement: (...args) => ({ args }),
    useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
    useEffect: () => {},
    useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    Fragment: 'fragment',
  }
  const plugin = captured.factory((name) => {
    if (name === 'react') return reactStub
    throw new Error(`unexpected require: ${name}`)
  })
  return { captured, plugin }
}

test('client bundle registers a sidebar entry and the main panel', () => {
  const { captured, plugin } = loadClientPlugin()
  assert.equal(captured.id, 'dsh-research-suite')
  assert.equal(plugin.inject.includes('slots'), true)
  assert.equal(typeof plugin.apply, 'function')

  const registrations = []
  const injections = []
  const ctx = {
    effect: (fn) => fn(),
    slots: {
      inject: (name, fn) => {
        injections.push(name)
        return fn()
      },
      register: (meta, render) => {
        registrations.push({ meta, render })
        return () => {}
      },
    },
    layout: { selectPanel: () => {} },
  }
  plugin.apply(ctx)
  assert.deepEqual(injections.sort(), ['main', 'sidebar.panellist'])
  const sidebar = registrations.find((item) => item.meta.name === 'sidebar.panellist')
  const main = registrations.find((item) => item.meta.name === 'main')
  assert.equal(sidebar.meta.id, 'dsh-research-suite')
  assert.equal(sidebar.meta.order, 26)
  assert.equal(typeof sidebar.meta.label, 'function')
  assert.equal(main.meta.key, 'dsh-research-suite')
  assert.equal(typeof sidebar.render, 'function')
  assert.equal(typeof main.render, 'function')
  const mark = sidebar.render({ size: 18 })
  assert.ok(mark && mark.args, 'the sidebar renderer returns an element')
})

test('client helpers are framework-free and bilingual', () => {
  const { plugin } = loadClientPlugin()
  const helpers = plugin.__test__
  assert.equal(helpers.stageLabel('analyze', 'zh'), '分析')
  assert.equal(helpers.stageLabel('analyze', 'en'), 'Analyze')
  assert.equal(helpers.stageLabel('nope', 'zh'), 'nope')
  assert.equal(helpers.makeT('en')('panel'), 'Research Suite')
  assert.equal(helpers.makeT('zh')('panel'), '科研套件')
  assert.equal(helpers.makeT('zh')('health'), '健康')
  assert.equal(helpers.makeT('en')('health'), 'Health')
  assert.match(SOURCE, /const VERSION = "1\.1\.0"/u)
  assert.match(SOURCE, /function Health\(props\)/u)
  assert.equal(helpers.STAGES.length, 9)
  assert.equal(helpers.shortHash('sha256:' + 'a'.repeat(64)).endsWith('aaaa'), true)
  assert.equal(helpers.fmtNum(1234.5), '1,234.5')
  const state = { stage: 'execute', gates: [{ stage: 'scoping', ok: true, blocking: [] }] }
  assert.equal(helpers.latestGates(state).scoping.ok, true)
  assert.equal(helpers.stageTone('scoping', state, helpers.latestGates(state)), 'ok')
  assert.equal(helpers.stageTone('execute', state, helpers.latestGates(state)), 'current')
  assert.equal(helpers.stageTone('write', state, helpers.latestGates(state)), 'idle')
  const prompt = helpers.campaignPrompt({ id: 'rs-12345678', title: 'T' }, 'zh')
  assert.match(prompt, /rs-12345678/)
  assert.match(prompt, /rsx_gate/)
})

test('flywheel model exposes real stages, blockers and rounds', () => {
  const { plugin } = loadClientPlugin()
  const helpers = plugin.__test__
  const state = {
    stage: 'execute',
    gates: [
      { stage: 'scoping', ok: true, blocking: [] },
      { stage: 'survey', ok: true, blocking: [] },
      { stage: 'hypothesis', ok: true, blocking: [] },
      { stage: 'design', ok: true, blocking: [] },
      { stage: 'execute', ok: false, blocking: ['run_missing'], passed: 2, total: 4 },
    ],
    cycles: [{ id: 'K-0001' }, { id: 'K-0002' }, { id: 'K-0003' }],
  }
  const model = helpers.flywheelModel(state, { ok: false, passed: 2, total: 4 })
  assert.equal(model.nodes.length, 9)
  assert.equal(model.nodes[0].status, 'done')
  assert.equal(model.nodes[4].status, 'blocked')
  assert.equal(model.nodes[5].status, 'pending')
  assert.equal(model.done, 4)
  assert.equal(model.progress, 4 / 9)
  assert.equal(model.round, 3)
  assert.equal(model.hasCycles, true)
  assert.equal(model.gatePassed, 2)
  assert.equal(model.gateTotal, 4)

  const empty = helpers.flywheelModel({ stage: 'scoping', gates: [] }, null)
  assert.equal(empty.round, 0)
  assert.equal(empty.hasCycles, false)
  assert.equal(empty.nodes[0].status, 'current')
  assert.equal(empty.nodes[1].status, 'pending')
  assert.equal(empty.gatePassed, 0)
})

test('flywheel uses the live gate before it is persisted into state.gates', () => {
  const { plugin } = loadClientPlugin()
  const helpers = plugin.__test__
  const state = {
    stage: 'hypothesis',
    gates: [
      { stage: 'scoping', ok: true, blocking: [] },
      { stage: 'survey', ok: true, blocking: [] },
    ],
    cycles: [{ id: 'K-0001' }, { id: 'K-0002' }],
  }
  const gate = { stage: 'hypothesis', ok: false, blocking: ['hypothesis'], passed: 0, total: 1 }
  const model = helpers.flywheelModel(state, gate)
  assert.equal(model.nodes[2].status, 'blocked')
  assert.equal(model.nodes[2].gateOk, false)
  assert.equal(model.done, 2)
  assert.equal(model.gatePassed, 0)
  assert.equal(model.gateTotal, 1)
})

test('flywheel actions gate export on release and archive on lifecycle state', () => {
  const { plugin } = loadClientPlugin()
  const helpers = plugin.__test__
  const releaseGate = { stage: 'release', ok: true, blocking: [], passed: 12, total: 12 }
  const releaseState = {
    stage: 'release',
    gates: [{ stage: 'release', ok: true, blocking: [], passed: 12, total: 12 }],
    cycles: [{ id: 'K-0001' }],
    archived: false,
  }

  const complete = helpers.flywheelActionAvailability(releaseState, releaseGate, { paused: false, busy: false })
  assert.equal(complete.export.enabled, true)
  assert.equal(complete.ledger.enabled, true)
  assert.equal(complete.audit.enabled, true)
  assert.equal(complete.report.enabled, true)
  assert.equal(complete.archive.enabled, true)

  const paused = helpers.flywheelActionAvailability(releaseState, releaseGate, { paused: true, busy: false })
  assert.equal(paused.export.enabled, false)
  assert.equal(paused.export.reason, 'paused')
  assert.equal(paused.ledger.enabled, true)
  assert.equal(paused.audit.enabled, true)
  assert.equal(paused.report.enabled, true)
  assert.equal(paused.archive.enabled, true)
  assert.equal(paused.archive.reason, null)

  const early = helpers.flywheelActionAvailability(
    { stage: 'hypothesis', gates: [{ stage: 'survey', ok: true, blocking: [] }], cycles: [] },
    { stage: 'hypothesis', ok: false, blocking: ['hypothesis'], passed: 0, total: 1 },
    { paused: false, busy: false },
  )
  assert.equal(early.export.enabled, false)
  assert.equal(early.export.reason, 'release')
  assert.equal(early.ledger.enabled, true)
  assert.equal(early.audit.enabled, true)
  assert.equal(early.report.enabled, false)
  assert.equal(early.report.reason, 'write')
  assert.equal(early.archive.enabled, true)
  assert.equal(early.archive.reason, null)

  const blockedRelease = helpers.flywheelActionAvailability(
    { stage: 'release', gates: [{ stage: 'release', ok: false, blocking: ['human_approval'], passed: 11, total: 12 }], cycles: [] },
    { stage: 'release', ok: false, blocking: ['human_approval'], passed: 11, total: 12 },
    { paused: false, busy: false },
  )
  assert.equal(blockedRelease.export.enabled, false)
  assert.equal(blockedRelease.export.reason, 'release')
  assert.equal(blockedRelease.archive.enabled, true)

  const archived = helpers.flywheelActionAvailability({ ...releaseState, archived: true }, releaseGate, { paused: false, busy: false })
  assert.equal(archived.export.enabled, false)
  assert.equal(archived.export.reason, 'archived')
  assert.equal(archived.archive.enabled, false)
  assert.equal(archived.archive.reason, 'archived')

  const busy = helpers.flywheelActionAvailability(releaseState, releaseGate, { paused: false, busy: true })
  assert.equal(busy.export.enabled, false)
  assert.equal(busy.export.reason, 'busy')
  assert.equal(busy.archive.enabled, false)
  assert.equal(busy.archive.reason, 'busy')
  assert.equal(busy.ledger.enabled, true)
  assert.equal(busy.audit.enabled, true)
  assert.equal(busy.report.enabled, true)
})

test('flywheel renders five native action buttons with disabled reasons', () => {
  const { plugin } = loadClientPlugin()
  const helpers = plugin.__test__
  const t = helpers.makeT('zh')
  const releaseGate = { stage: 'release', ok: true, blocking: [], passed: 12, total: 12 }
  const releaseState = {
    id: 'rs-12345678',
    stage: 'release',
    gates: [{ stage: 'release', ok: true, blocking: [], passed: 12, total: 12 }],
    cycles: [],
    archived: false,
    evidence: [],
    sources: [],
    seq: 12,
  }
  const buttons = (state, gate, busy = false) => {
    const tree = helpers.Flywheel({ t, lang: 'zh', state, gate, next: null, busy })
    return Object.fromEntries(collectButtons(tree).map((button) => {
      const props = button.args[1]
      return [props['data-action'], props]
    }))
  }

  const complete = buttons(releaseState, releaseGate)
  assert.deepEqual(Object.keys(complete).sort(), ['archive', 'audit', 'export', 'ledger', 'report'])
  assert.equal(complete.export.disabled, false)
  assert.equal(complete.ledger.disabled, false)
  assert.equal(complete.audit.disabled, false)
  assert.equal(complete.report.disabled, false)
  assert.equal(complete.archive.disabled, false)

  const paused = buttons(
    { ...releaseState, stage: 'hypothesis', gates: [], loop: { status: 'paused' }, loopPauses: [{ id: 'LP-0002', status: 'open', kind: 'needs_input', reason: 'waiting' }] },
    { stage: 'hypothesis', ok: false, blocking: ['hypothesis'], passed: 0, total: 1 },
  )
  assert.equal(paused.export.disabled, true)
  assert.match(paused.export.title, /暂停/)
  assert.equal(paused.ledger.disabled, false)
  assert.equal(paused.audit.disabled, false)
  assert.equal(paused.report.disabled, true)
  assert.match(paused.report.title, /写作阶段/)
  assert.equal(paused.archive.disabled, false)
  assert.equal(paused.export.onClick, undefined)

  const busy = buttons(releaseState, releaseGate, true)
  assert.equal(busy.export.disabled, true)
  assert.match(busy.export.title, /处理中/)
  assert.equal(busy.archive.disabled, true)
  assert.match(busy.archive.title, /处理中/)
  assert.equal(busy.report.disabled, false)
})

test('client error helper keeps the machine code and the portfolio view is registered', () => {
  const { plugin } = loadClientPlugin()
  const helpers = plugin.__test__
  const coded = new Error('export is blocked')
  coded.code = 'action_blocked'
  assert.equal(helpers.errorText(coded), '[action_blocked] export is blocked')
  assert.equal(helpers.errorText(new Error('plain failure')), 'plain failure')
  assert.equal(typeof helpers.Portfolio, 'function')
  assert.equal(helpers.TEXT.zh.portfolio, '组合')
  assert.equal(helpers.TEXT.en.portfolio, 'Portfolio')
})

test('client bundle has no node: imports', () => {
  assert.equal(/require\(["']node:/.test(SOURCE), false)
  assert.equal(SOURCE.includes('process.env'), false)
})
