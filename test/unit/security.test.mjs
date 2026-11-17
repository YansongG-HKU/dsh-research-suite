import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

import { ResearchStore } from '../../lib/ledger.js'
import { checkGate } from '../../lib/gates.js'
import { signingKeyFile } from '../../lib/signing.js'
import { createCampaign, makeService } from '../helpers.mjs'

test('audit records are signed and a tampered audit blocks the review gate', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const audit = service.audit(id).audit
    assert.match(audit.signature, /^[0-9a-f]{64}$/u)
    assert.equal(audit.signatureVersion, 'hmac-sha256-v1')
    assert.match(audit.keyId, /^[0-9a-f]{16}$/u)
    assert.match(audit.stateHash, /^[0-9a-f]{64}$/u)
    assert.equal(store.verifyAudit(audit).ok, true)
    assert.equal(service.auditView(id).signature.ok, true)
    assert.equal(existsSync(signingKeyFile(store.dir)), true)

    const state = store.get(id)
    state.audits[state.audits.length - 1].findings.push({
      code: 'forged',
      severity: 'info',
      title: 'forged finding',
      detail: 'edited after signing',
      ref: '',
    })
    store.save(state)

    const view = service.auditView(id)
    assert.equal(view.signature.ok, false)
    assert.equal(view.signature.reason, 'signature_mismatch')
    const gate = service.gate(id, { action: 'check', stage: 'review' })
    assert.ok(gate.gate.blocking.includes('automated_audit'))
  } finally {
    cleanup()
  }
})

test('state.json carries a verifiable stateHash and a mismatch blocks an audit', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const state = store.get(id)
    assert.match(state.stateHash, /^[0-9a-f]{64}$/u)
    assert.equal(state.stateHashVersion, 1)
    assert.equal(store.verify(id).stateOk, true)

    state.title = 'edited outside the event chain'
    const integrity = store.verify(id)
    assert.equal(integrity.stateOk, false)
    assert.ok(integrity.stateProblems.some((item) => item.problem === 'state_hash_mismatch'))
    const audit = service.audit(id, { record: false }).audit
    assert.equal(audit.ok, false)
    assert.ok(audit.blocking.includes('state_tampered'))

    const release = checkGate(state, 'release', { integrity })
    assert.equal(release.checks.find((item) => item.code === 'chain_integrity').ok, false)
  } finally {
    cleanup()
  }
})

test('a second store cannot write while the campaign lock is held, and stale state is rejected', () => {
  const { service, store, dir, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const other = new ResearchStore({ dir, lockTimeoutMs: 40 }).init()
    const held = other.get(id)

    const token = store.acquireLock(id)
    try {
      assert.throws(
        () => other.emit(held, 'test.concurrent', 'agent', { n: 1 }),
        (error) => error.code === 'locked',
      )
    } finally {
      store.releaseLock(id, token)
    }

    other.emit(held, 'test.after-lock', 'agent', { n: 2 })
    other.save(held)
    assert.equal(other.verify(id).chainOk, true)

    store.cache.delete(id)
    const left = store.get(id)
    const right = other.get(id)
    assert.notEqual(left, right)
    left.title = 'left wins'
    store.save(left)
    assert.throws(
      () => other.save(right),
      (error) => error.code === 'stale_state',
    )
  } finally {
    cleanup()
  }
})

function killChild(child) {
  if (!child || child.exitCode !== null) return
  try {
    child.kill('SIGKILL')
  } catch {
    /* already gone */
  }
}

test('a corrupted signing key fails closed instead of rotating silently', () => {
  const { service, store, dir, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const audit = service.audit(id).audit
    writeFileSync(signingKeyFile(store.dir), '{not-json', 'utf8')
    const restarted = new ResearchStore({ dir }).init()
    assert.throws(
      () => restarted.verifyAudit(audit),
      (error) => error.code === 'signing_key_corrupt',
    )
  } finally {
    cleanup()
  }
})

test('the write lock is visible to a separate process', async () => {
  const { service, store, dir, cleanup } = makeService()
  let child
  try {
    const id = createCampaign(service)
    const ledger = pathToFileURL(fileURLToPath(new URL('../../lib/ledger.js', import.meta.url))).href
    const script = `
      const { ResearchStore } = await import(${JSON.stringify(ledger)})
      const store = new ResearchStore({ dir: process.argv[1] }).init()
      const token = store.acquireLock(process.argv[2])
      process.stdout.write('LOCKED\\n')
      setTimeout(() => store.releaseLock(process.argv[2], token), 5000)
    `
    child = spawn(process.execPath, ['--input-type=module', '-e', script, dir, id], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('child did not acquire the lock')), 5000)
      let output = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        output += chunk
        if (output.includes('LOCKED')) {
          clearTimeout(timer)
          resolve()
        }
      })
      child.on('error', reject)
      child.on('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`child exited before locking: ${code}`))
      })
    })
    assert.throws(
      () => (store.lockTimeoutMs = 40) && store.emit(store.get(id), 'test.child-lock', 'agent', { n: 1 }),
      (error) => error.code === 'locked',
    )
  } finally {
    killChild(child)
    cleanup()
  }
})

test('artifact reads reject content changed after the handle is opened', () => {
  const { service, store, dir, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const added = service.artifactAdd(id, { content: 'original bytes', role: 'source', label: 'source.txt' })
    const artifact = added.artifact
    let changed = false
    const hooked = new ResearchStore({
      dir,
      hooks: {
        beforeArtifactRead(file) {
          if (changed) return
          changed = true
          // Windows refuses to rename over a file that is still open, so the
          // deterministic portable race is an in-place replacement. The read
          // handle is already open; the content/hash check is what catches it.
          writeFileSync(file, 'replacement bytes')
        },
      },
    }).init()

    assert.throws(
      () => hooked.artifactText(id, artifact.id),
      (error) => error.code === 'artifact_hash_mismatch',
    )
    const integrity = hooked.verify(id)
    assert.ok(integrity.artifactProblems.some((item) => item.problem === 'hash_mismatch'))
  } finally {
    cleanup()
  }
})
