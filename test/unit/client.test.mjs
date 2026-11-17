import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const SOURCE = readFileSync(new URL('../../client.js', import.meta.url), 'utf8')

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

test('client bundle has no node: imports', () => {
  assert.equal(/require\(["']node:/.test(SOURCE), false)
  assert.equal(SOURCE.includes('process.env'), false)
})
