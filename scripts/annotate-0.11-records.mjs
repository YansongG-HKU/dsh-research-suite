#!/usr/bin/env node
/**
 * Clean up the two 0.11.0 record defects through the same append-only store the
 * plugin uses. No JSON is hand-edited; every annotation appends an event and
 * the state hash is recomputed by the store.
 *
 * Usage:
 *   node scripts/annotate-0.11-records.mjs <data-dir> [out-file]
 *
 * The script is idempotent: a second run reports changed:false and writes no
 * event. It never deletes sources or rewrites a measured count.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { ResearchStore } from '../lib/ledger.js'
import { utcnow } from '../lib/util.js'

const dir = process.argv[2]
const outFile = process.argv[3] ? resolve(process.argv[3]) : null
if (!dir) {
  console.error('usage: node scripts/annotate-0.11-records.mjs <data-dir> [out-file]')
  process.exit(2)
}

const cleanId = 'rs-a874c2ae'
const fixtureId = 'rs-e710b015'
const q2Note =
  'UNMEASURED PROTOCOL DRAFT — the 3/3/0 counts are placeholders from a pre-search protocol, not an executed query. Superseded by Q-0003 (measured: OpenAlex 10 + Crossref 10, 20/20/0). Do not cite Q-0002 as a search result.'
const q3Note =
  'MEASURED disconfirming search: actual rsx_search returned OpenAlex 10 + Crossref 10, merged 10 candidates; none supports skipping a human checkpoint. Q-0002 is an unmeasured draft retained only as the correction object; this row is the measured record.'
const quarantineReason =
  'Mechanics fixture used synthetic bibliographic entries with the reserved DOI prefix 10.0000/; it is not research evidence and must not be cited. Archived and excluded from the 0.11 acceptance.'

const store = new ResearchStore({ dir }).init()
const changed = []

function annotateClean() {
  const state = store.get(cleanId)
  const q2 = state.searchLog.find((row) => row.id === 'Q-0002')
  const q3 = state.searchLog.find((row) => row.id === 'Q-0003')
  if (!q2 || !q3) {
    throw new Error(`${cleanId}: Q-0002 and Q-0003 must both exist`)
  }
  const already =
    q2.measured === false &&
    q2.supersededBy === 'Q-0003' &&
    q2.notes === q2Note &&
    q3.measured === true &&
    q3.supersedes === 'Q-0002' &&
    q3.notes === q3Note
  if (already) return { changed: false, seq: state.seq }

  q2.measured = false
  q2.supersededBy = 'Q-0003'
  q2.notes = q2Note
  q3.measured = true
  q3.supersedes = 'Q-0002'
  q3.notes = q3Note
  const event = store.emit(state, 'search.annotated', 'agent', {
    q: 'Q-0002',
    measured: false,
    supersededBy: 'Q-0003',
    correction: 'Q-0003',
    measuredHits: q3.hits,
    measuredScreened: q3.screened,
    measuredIncluded: q3.included,
  })
  store.save(state)
  changed.push({ campaign: cleanId, event: event.seq })
  return { changed: true, seq: state.seq, event: event.seq }
}

function annotateFixture() {
  const state = store.get(fixtureId)
  const current = state.quarantine && typeof state.quarantine === 'object' ? state.quarantine : null
  const already =
    state.archived === true &&
    current &&
    current.citable === false &&
    current.reason === quarantineReason
  if (already) return { changed: false, seq: state.seq }

  state.archived = true
  state.quarantine = {
    citable: false,
    reason: quarantineReason,
    by: 'YG',
    at: utcnow(),
    evidence: 'synthetic DOIs under 10.0000/',
    scope: 'campaign',
  }
  const event = store.emit(state, 'campaign.quarantined', 'agent', {
    citable: false,
    archived: true,
    reason: quarantineReason,
    by: 'YG',
  })
  store.save(state)
  changed.push({ campaign: fixtureId, event: event.seq })
  return { changed: true, seq: state.seq, event: event.seq }
}

const clean = annotateClean()
const fixture = annotateFixture()
const cleanIntegrity = store.verify(cleanId)
const fixtureIntegrity = store.verify(fixtureId)
const cleanState = store.get(cleanId)
const fixtureState = store.get(fixtureId)

const result = {
  ok:
    cleanIntegrity.chainOk === true &&
    cleanIntegrity.stateOk === true &&
    fixtureIntegrity.chainOk === true &&
    fixtureIntegrity.stateOk === true,
  generatedAt: utcnow(),
  dataDir: resolve(dir),
  changed,
  clean: {
    id: cleanId,
    seq: cleanState.seq,
    events: cleanIntegrity.events,
    chainOk: cleanIntegrity.chainOk,
    stateOk: cleanIntegrity.stateOk,
    Q0002: cleanState.searchLog.find((row) => row.id === 'Q-0002'),
    Q0003: cleanState.searchLog.find((row) => row.id === 'Q-0003'),
  },
  fixture: {
    id: fixtureId,
    seq: fixtureState.seq,
    events: fixtureIntegrity.events,
    archived: fixtureState.archived,
    quarantine: fixtureState.quarantine,
    chainOk: fixtureIntegrity.chainOk,
    stateOk: fixtureIntegrity.stateOk,
  },
}

if (outFile) {
  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
}
console.log(JSON.stringify(result, null, 2))
