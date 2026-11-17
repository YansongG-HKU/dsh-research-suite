import assert from 'node:assert/strict'
import { readFileSync, rmSync, statSync, truncateSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { LIMITS } from '../../lib/config.js'
import { canon, sha256Hex } from '../../lib/util.js'
import { makeService } from '../helpers.mjs'

function makeStore() {
  return makeService()
}

test('ledger: create emits a genesis-linked event and verifies', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't', question: 'q'.repeat(20), scope: 's'.repeat(20), success: 'ok'.repeat(6) })
    assert.match(state.id, /^rs-[0-9a-f]{8}$/u)
    const verify = store.verify(state.id)
    assert.equal(verify.chainOk, true)
    assert.equal(verify.events, 1)
    const events = store.events(state)
    assert.equal(events[0].prev, '0'.repeat(64))
    assert.equal(events[0].seq, 1)
  } finally {
    cleanup()
  }
})

test('ledger: tampering with an event breaks the chain', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't', question: 'q'.repeat(20), scope: 's'.repeat(20), success: 'ok'.repeat(6) })
    const events = store.events(state)
    const line = JSON.stringify({ ...events[0], payload: { ...events[0].payload, title: 'tampered' } })
    writeFileSync(store.eventsFile(state.id), `${line}\n`, 'utf8')
    const verify = store.verify(state.id)
    assert.equal(verify.chainOk, false)
    assert.equal(verify.brokenSeq, 1)
  } finally {
    cleanup()
  }
})

test('ledger: artifacts are content addressed and deduplicated', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't' })
    const first = store.addArtifact(state, Buffer.from('hello'), 'source')
    const second = store.addArtifact(state, Buffer.from('hello'), 'source')
    assert.equal(first.id, second.id)
    assert.equal(state.artifacts.length, 1)
    assert.equal(store.verify(state.id).artifactProblems.length, 0)
  } finally {
    cleanup()
  }
})

test('ledger: deleting an artifact is reported, not thrown', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't' })
    const info = store.addArtifact(state, Buffer.from('data'), 'source')
    rmSync(store.artifactPath(state.id, info.id))
    const verify = store.verify(state.id)
    assert.equal(verify.chainOk, true)
    assert.deepEqual(verify.artifactProblems, [{ id: info.id, problem: 'missing' }])
  } finally {
    cleanup()
  }
})

test('artifact: an oversized source fails with too_large before it is stored', () => {
  const { store, dir, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't' })
    const tooBig = Buffer.alloc(LIMITS.maxArtifactBytes + 1)
    assert.throws(
      () => store.addArtifact(state, tooBig, 'stdout'),
      (error) => error.code === 'too_large',
    )
    assert.equal(state.artifacts.length, 0)

    const file = join(dir, 'oversized.bin')
    writeFileSync(file, '')
    truncateSync(file, LIMITS.maxArtifactBytes + 1)
    assert.throws(
      () => store.addArtifact(state, file, 'stdout'),
      (error) => error.code === 'too_large',
    )
    assert.equal(state.artifacts.length, 0)
  } finally {
    cleanup()
  }
})

test('artifact: malformed ids are rejected as invalid_input', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't' })
    const valid = `sha256:${'a'.repeat(64)}`
    const invalid = [
      'sha256:../../escape',
      'sha256:abcd',
      `sha256:${'A'.repeat(64)}`,
      `sha256:${'a'.repeat(63)}`,
      'sha256:',
      '',
      null,
      undefined,
      42,
    ]
    for (const id of invalid) {
      assert.throws(
        () => store.artifactPath(state.id, id),
        (error) => error.code === 'invalid_input',
        `expected invalid_input for ${String(id)}`,
      )
    }
    assert.equal(store.artifactPath(state.id, valid), join(store.artifactsDir(state.id), 'a'.repeat(64)))
    assert.equal(store.artifactPath(state.id, 'a'.repeat(64)), join(store.artifactsDir(state.id), 'a'.repeat(64)))
  } finally {
    cleanup()
  }
})

test('artifact: a valid duplicate is not rewritten or appended', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't' })
    const first = store.addArtifact(state, Buffer.from('hello'), 'source')
    const target = store.artifactPath(state.id, first.id)
    const old = new Date('2000-01-01T00:00:00.000Z')
    utimesSync(target, old, old)

    const second = store.addArtifact(state, Buffer.from('hello'), 'stdout')
    assert.equal(second.id, first.id)
    assert.equal(state.artifacts.length, 1)
    assert.equal(state.artifacts[0].role, 'source')
    assert.equal(statSync(target).mtimeMs, old.getTime())
    assert.equal(readFileSync(target, 'utf8'), 'hello')
  } finally {
    cleanup()
  }
})

test('artifact: a tampered file at a known address is repaired, not duplicated', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't' })
    const first = store.addArtifact(state, Buffer.from('hello'), 'source')
    const target = store.artifactPath(state.id, first.id)
    writeFileSync(target, 'tampered')

    const second = store.addArtifact(state, Buffer.from('hello'), 'out')
    assert.equal(second.id, first.id)
    assert.equal(state.artifacts.length, 1)
    assert.equal(readFileSync(target, 'utf8'), 'hello')
    assert.deepEqual(store.verify(state.id).artifactProblems, [])
  } finally {
    cleanup()
  }
})

test('artifact: a legacy state without an artifacts array is normalised', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't' })
    const legacy = { ...state, artifacts: undefined }
    store.addArtifact(legacy, Buffer.from('legacy'), 'stdout')
    assert.equal(Array.isArray(legacy.artifacts), true)
    assert.equal(legacy.artifacts.length, 1)
  } finally {
    cleanup()
  }
})

test('verify: a truncated or appended event tail breaks the chain', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't' })
    store.emit(state, 'test.one', 'agent', { n: 1 })
    store.emit(state, 'test.two', 'agent', { n: 2 })
    store.save(state)
    const file = store.eventsFile(state.id)
    const lines = readFileSync(file, 'utf8').split(/\r?\n/u).filter(Boolean)
    writeFileSync(file, `${lines[0]}\n`, 'utf8')
    const truncated = store.verify(state.id)
    assert.equal(truncated.chainOk, false)
    assert.equal(truncated.brokenSeq, 2)

    const last = JSON.parse(lines[lines.length - 1])
    const ts = '2030-01-01T00:00:00.000Z'
    const payload = { n: 3 }
    const hash = sha256Hex(`${last.hash}|${ts}|test.three|agent|${canon(payload)}`)
    const tail = { seq: 4, ts, kind: 'test.three', actor: 'agent', payload, prev: last.hash, hash }
    writeFileSync(file, `${lines.join('\n')}\n${JSON.stringify(tail)}\n`, 'utf8')
    const appended = store.verify(state.id)
    assert.equal(appended.chainOk, false)
    assert.equal(appended.brokenSeq, 4)
  } finally {
    cleanup()
  }
})

test('verify: a stray file in artifacts/ is reported as orphan_file', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't' })
    store.addArtifact(state, Buffer.from('registered'), 'source')
    writeFileSync(join(store.artifactsDir(state.id), 'orphan.txt'), 'not registered')
    assert.deepEqual(store.verify(state.id).artifactProblems, [{ id: 'orphan.txt', problem: 'orphan_file' }])
  } finally {
    cleanup()
  }
})

test('verify: a deleted state entry is reported as missing_entry, not missing', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't' })
    const info = store.addArtifact(state, Buffer.from('entry was deleted'), 'source')
    state.artifacts = []
    assert.deepEqual(store.verify(state.id).artifactProblems, [{ id: info.id, problem: 'missing_entry' }])
  } finally {
    cleanup()
  }
})

test('verify: a valid unregistered content file is a missing entry, a stray name is an orphan', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't' })
    const hex = 'b'.repeat(64)
    writeFileSync(join(store.artifactsDir(state.id), hex), 'unregistered content')
    assert.deepEqual(store.verify(state.id).artifactProblems, [{ id: `sha256:${hex}`, problem: 'missing_entry' }])

    writeFileSync(join(store.artifactsDir(state.id), 'scratch.tmp'), 'tmp')
    const problems = store.verify(state.id).artifactProblems
    assert.equal(problems.length, 2)
    assert.ok(problems.some((item) => item.id === `sha256:${hex}` && item.problem === 'missing_entry'))
    assert.ok(problems.some((item) => item.id === 'scratch.tmp' && item.problem === 'orphan_file'))
  } finally {
    cleanup()
  }
})

test('verify: a state without tail anchors falls back to chain-only verification', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't' })
    state.seq = undefined
    state.lastHash = undefined
    store.save(state)
    const result = store.verify(state.id)
    assert.equal(result.chainOk, true)
    assert.equal(result.brokenSeq, null)
    assert.equal(result.events, 1)
  } finally {
    cleanup()
  }
})

test('verify: artifact hash, size and id problems are reported, not thrown', () => {
  const { store, cleanup } = makeStore()
  try {
    const state = store.create({ title: 't' })
    const info = store.addArtifact(state, Buffer.from('hello'), 'source')
    const target = store.artifactPath(state.id, info.id)
    writeFileSync(target, 'HELLO')
    assert.deepEqual(store.verify(state.id).artifactProblems, [{ id: info.id, problem: 'hash_mismatch' }])

    writeFileSync(target, 'hello')
    state.artifacts[0].bytes = 4
    store.save(state)
    assert.deepEqual(store.verify(state.id).artifactProblems, [{ id: info.id, problem: 'size_mismatch' }])

    state.artifacts.push({ id: 'sha256:not-a-hash', bytes: 1 })
    assert.deepEqual(store.verify(state.id).artifactProblems, [
      { id: info.id, problem: 'size_mismatch' },
      { id: 'sha256:not-a-hash', problem: 'invalid_id' },
    ])
  } finally {
    cleanup()
  }
})

test('store rejects path traversal ids', () => {
  const { store, cleanup } = makeStore()
  try {
    assert.throws(() => store.dirFor('../evil'), /invalid campaign id/u)
  } finally {
    cleanup()
  }
})
