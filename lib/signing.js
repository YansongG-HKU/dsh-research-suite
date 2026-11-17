/**
 * Local audit signing.
 *
 * The audit record lives inside `state.json`, which anyone with write access
 * to the data directory can edit. A hash alone cannot tell a legitimate audit
 * from a forged one: the forger can recompute it. This module keeps a local
 * HMAC key outside the campaign directory and signs the review decision, so a
 * changed finding, verdict, subject hash or timestamp fails verification at
 * the review gate.
 *
 * The key is deliberately local and never exported. `keyId` is a short,
 * non-secret fingerprint so an exported audit can say which key signed it.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, openSync, readFileSync, writeSync, closeSync } from 'node:fs'
import { join } from 'node:path'

import { canon, sha256Hex, utcnow } from './util.js'

export const AUDIT_SIGNATURE_VERSION = 'hmac-sha256-v1'
const KEY_FILE = 'signing-key.json'
const SECRET_BYTES = 32

function keyIdOf(secret) {
  return sha256Hex(`dsh-research-suite/audit-key/v1|${secret}`).slice(0, 16)
}

function validSecret(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value)
}

/**
 * Load the local signing key, creating it atomically on first use. The key
 * file is separate from campaign state and is never written to an export.
 */
export function loadSigningKey(dir) {
  const file = join(dir, KEY_FILE)
  if (existsSync(file)) {
    let data
    try {
      data = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      const corrupt = new Error(`signing key is unreadable: ${file}`)
      corrupt.code = 'signing_key_corrupt'
      corrupt.cause = error
      throw corrupt
    }
    if (data && validSecret(data.secret)) {
      return { secret: data.secret, keyId: typeof data.keyId === 'string' ? data.keyId : keyIdOf(data.secret), file }
    }
    const corrupt = new Error(`signing key is malformed: ${file}`)
    corrupt.code = 'signing_key_corrupt'
    throw corrupt
  }
  const secret = randomBytes(SECRET_BYTES).toString('hex')
  const record = { version: 1, algorithm: AUDIT_SIGNATURE_VERSION, keyId: keyIdOf(secret), secret, createdAt: utcnow() }
  // `wx` makes the creation race-safe: a second process reads the winner
  // instead of overwriting the key while an audit is being signed.
  try {
    const fd = openSync(file, 'wx', 0o600)
    try {
      writeSync(fd, JSON.stringify(record, null, 2))
    } finally {
      closeSync(fd)
    }
    return { secret, keyId: record.keyId, file }
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      if (data && validSecret(data.secret)) {
        return { secret: data.secret, keyId: typeof data.keyId === 'string' ? data.keyId : keyIdOf(data.secret), file }
      }
    }
    throw error
  }
}

/** Fields covered by the signature. Keep this stable across versions. */
export function auditSignaturePayload(audit) {
  return {
    version: AUDIT_SIGNATURE_VERSION,
    id: audit.id || null,
    ok: audit.ok === true,
    verdict: audit.verdict || null,
    findings: Array.isArray(audit.findings) ? audit.findings : [],
    counts: audit.counts || {},
    blocking: Array.isArray(audit.blocking) ? audit.blocking : [],
    subjectHash: audit.subjectHash || null,
    stateHash: audit.stateHash || null,
    ts: audit.ts || null,
  }
}

export function signAudit(audit, key) {
  const signature = createHmac('sha256', key.secret)
    .update(canon(auditSignaturePayload(audit)), 'utf8')
    .digest('hex')
  return { signature, keyId: key.keyId, signatureVersion: AUDIT_SIGNATURE_VERSION }
}

export function verifyAuditSignature(audit, key) {
  if (!audit || typeof audit !== 'object') {
    return { ok: false, keyId: key ? key.keyId : null, reason: 'missing_audit' }
  }
  if (audit.signatureVersion && audit.signatureVersion !== AUDIT_SIGNATURE_VERSION) {
    return { ok: false, keyId: audit.keyId || null, reason: 'unsupported_algorithm' }
  }
  if (typeof audit.signature !== 'string' || !/^[0-9a-f]{64}$/u.test(audit.signature)) {
    return { ok: false, keyId: audit.keyId || null, reason: 'unsigned' }
  }
  const expected = createHmac('sha256', key.secret)
    .update(canon(auditSignaturePayload(audit)), 'utf8')
    .digest()
  let actual
  try {
    actual = Buffer.from(audit.signature, 'hex')
  } catch {
    return { ok: false, keyId: audit.keyId || null, reason: 'malformed_signature' }
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, keyId: audit.keyId || null, reason: 'signature_mismatch' }
  }
  if (audit.keyId && audit.keyId !== key.keyId) {
    return { ok: false, keyId: audit.keyId, reason: 'key_mismatch' }
  }
  return { ok: true, keyId: key.keyId, reason: 'ok' }
}

export function signingKeyFile(dir) {
  return join(dir, KEY_FILE)
}
