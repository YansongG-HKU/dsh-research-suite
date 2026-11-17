# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [0.3.0] - 2026-11-17

Hardening and interoperability release: standards-shaped provenance, signed audit decisions, a state digest anchored to the event tail, a cross-process write lock, and TOCTOU-safe artifact reads.

### Added

- **W3C PROV-JSON export**: `provenance.json` now uses only the PROV-JSON top-level keys (`prefix`, `entity`, `activity`, `agent`, `wasGeneratedBy`, `used`, `wasDerivedFrom`, `wasAttributedTo`, `wasAssociatedWith`). IDs are QNames (`dsh:source-S-0001`, `dsh:artifact-<hex>`, …) with `prov:` types and `dsh:` extension attributes; every relation target resolves to a declared entity, activity or agent. The previous compact "PROV-inspired" graph is now internal only.
- **RO-Crate figure→source edge**: `#figure-F-0001` carries an independent `about: { "@id": "#source-S-0001" }` edge, separate from `isBasedOn` (code/data) and `contentUrl` (image). Root `hasPart` includes figures, numbers and the manuscript; sources carry `contentUrl` when captured.
- **Audit signing (`lib/signing.js`)**: HMAC-SHA256 over `id/ok/verdict/findings/counts/blocking/subjectHash/stateHash/ts`, with a per-installation key at `signing-key.json` (created atomically, mode 0600, never exported), `keyId`, and `signatureVersion`. The review gate verifies the signature; unsigned, key-mismatched or edited audits are blocking. A corrupt key fails closed (`signing_key_corrupt`) instead of silently rotating and invalidating history.
- **State digest**: `stateHash` in `state.json` covers the materialised state including `seq`/`lastHash`, excluding `stateHash`/`stateHashVersion`. `integrity` reports `stateHash`, `stateOk` and `stateProblems`; a mismatch adds a blocking `state_tampered` audit finding. Legacy states without the field return `stateOk: null`.
- **Cross-process write lock**: `.write.lock` created with `open(..., "wx")`, released in `finally`, stale after 30s, `locked` after a 5s timeout. Before `save`/`emit` the store verifies the disk state is still a prefix of the in-memory event chain and rejects a newer writer with `stale_state`; sequential emit-then-save in one process remains supported.
- **TOCTOU-safe artifact reads**: both artifact ingestion and `readArtifactBytes()` use a single fd (`open` → `fstat` size cap → read → post-`fstat`), verify the content hash, and compare the path's inode/size after reading. In-place changes report `hash_mismatch`; replacement/disappearance reports `changed_during_read`; `verify()` maps these distinctly.
- **CI**: `actions/checkout@v5` and `actions/setup-node@v5` (Node 20 deprecation removed); matrix stays Node 22/24.
- **Tests**: 61 total. New `test/unit/provenance.test.mjs` checks PROV-JSON key set, QName/type/attribute shape, relation-target resolution, `wasGeneratedBy`/`wasDerivedFrom` edges and the RO-Crate figure→source edge. New `test/unit/security.test.mjs` checks signature verification and tamper blocking, state digest tamper, two-store and real child-process lock contention, stale-state rejection, corrupt-key fail-closed, and a read-handle content race.

### Changed

- Version is `0.3.0` in `package.json`, `lib/config.js` and the client bundle (`client.js` rebuilt).
- `audit().stateHash` records the pre-audit state digest as the audit anchor; the audit event itself advances the state digest. `auditList`/`auditView` expose per-audit `signature` verification; `renderAuditMarkdown` prints `HMAC-SHA256 / <keyId>` or `未签名`.
- `provenance.json` format string is now `dsh-research-suite/prov-json/1` (was `dsh-research-suite/provenance/1`); consumers of the old compact arrays must migrate to PROV-JSON.
- `gateRelease.chain_integrity` now also requires `stateOk !== false`; `renderReport` receives the same audit verifier so report gate summaries cannot show an unsigned audit as passing.

### Fixed

- `readArtifactBytes()` no longer stats a path and then reads it separately; the old sequence could return content that had changed between check and read.
- `verify()` distinguishes invalid artifact ids (`invalid_id`) from I/O failures (`unreadable`) and read races (`changed_during_read`).
- Legacy states without `seq`/`lastHash` still save and verify chain-only rather than being rejected by the new lock checks.

### Known limits

- The audit key is local HMAC, not a hardware/KMS or transparency-log root: it stops state/finding edits followed by hash recomputation, not an attacker who owns the data directory and key.
- `stateHash` is an unkeyed digest anchored to the event tail; it detects inconsistency, while non-repudiation comes from the audit signature.
- The write lock assumes one shared local data directory; NFS/SMB semantics are not claimed.
- The single-fd read closes the common `stat`→`read` window but cannot defeat a kernel/filesystem attacker racing inode contents between `fstat` calls; the content hash remains the final check.
- `rsx_run` still records, never executes; no literature search/PDF extraction.

## [0.2.0] - 2026-11-17

"集百家之长" release: an automated reviewer, a literature extraction matrix, BibTeX interoperability, figure/data/code provenance, and FAIR export, all wired into the same ledger and gates.

### Added

- Automated reviewer (`rsx_review`, `lib/audit.js`): checks citations resolve to captured sources, quotes occur in the captured text, evidence refs/claims exist, numbers match the run that produced them, figures carry figure+code+data, extractions are covered, the pre-registration still matches the executed analysis, and the negative control is real. Findings are `blocking/major/minor/info`; only blocking stops the review gate. Audits record `subjectHash`.
- Audit now treats a dangling source `contentHash` as `source_content_missing` (blocking) and accepts/validates artifact evidence refs (`sha256:…`) instead of misclassifying them as malformed.
- Audit freshness (`lib/subject.js`): `auditSubjectHash` covers research content but excludes stage/declaration/world/audits/gates/reviews, so release bookkeeping does not stale a review while substantive edits do. The review gate now requires a fresh passing audit, with repair hint `rsx_review action:"audit"`.
- BibTeX interoperability: `parseBibtex` (braces, quoted values, nested braces, `@comment/@string/@preamble` skipped), `rsx_source action:"import"` with DOI/title dedupe, and `references.bib` export for Zotero/Overleaf. Entry types map to ledger kinds (`article/inproceedings` → paper, `techreport` → report, `eprint` → preprint), and `primary/secondary/tertiary` reliability is inferred from the kind instead of silently downgrading every import to secondary; the import response echoes `items` with the mapped kind/reliability. Explicit duplicate keys are suffixed, and `note = {kind: …}` round-trips report/dataset/preprint kinds.
- Evidence extraction matrix (Elicit-style): `rsx_extract` rows of source × dimension with value/quote/locator/confidence; `MATRIX.md` + `matrix.csv` export; coverage counts; quote fidelity audited against the captured source. Markdown table headers escape `|`/newlines, and callers that omit `cells` do not crash.
- Artifact and figure provenance: `rsx_artifact` (roles file/source/dataset/code/figure/stdout/supplement/manuscript/environment) and `rsx_figure` (figure + code + data + optional environment/run/description). Missing provenance blocks the write gate; audit resolves every referenced artifact.
- FAIR/PROV export: `provenance.json` (PROV-inspired activity graph) and `ro-crate-metadata.json` (RO-Crate 1.1 JSON-LD with Dataset, campaign, artifacts, sources, claims, evidence, extraction, runs, numbers, figures, manuscript, audit). The RO-Crate software node uses `VERSION` rather than a frozen literal.
- Panel: new **审核 (Review)** tab with verdict/counts/findings/matrix, run-audit button and `references.bib` download; ledger gains an artifacts tab. API: `GET/POST /api/audit/:id`, `GET /api/matrix/:id`, `GET /api/bibtex/:id`, `GET /api/artifacts/:id`, `GET /api/figures/:id`.
- Four new agent tools: `rsx_extract`, `rsx_review`, `rsx_artifact`, `rsx_figure` (13 total), plus `rsx_source` actions `import`/`bibtex`. Tool descriptions and the system-prompt section describe the audit gate.
- Tests: 53 total, including audit blocking/freshness, retracted sources, quote mismatch, dangling source/artifact refs, artifact dedupe, figure provenance, BibTeX parse/round-trip/import dedupe/duplicate keys/kind fidelity/100-entry cap, matrix/CSV formula injection + header escaping, provenance/RO-Crate (claims/evidence/extraction nodes, dynamic version), new panel routes, and the new tool envelope.
- Export adds `references.bib`, `MATRIX.md`, `matrix.csv`, `AUDIT.md`, `provenance.json`, `ro-crate-metadata.json` to the folder and `BUNDLE.zip`.
- Report gains sections 15–17: automated audit, evidence matrix, and a file map for references/provenance/RO-Crate.

### Changed

- Version is `0.2.0` in `package.json`, `lib/config.js` and the client bundle.
- Review gate semantics are stricter by design: an audit must exist, be fresh, and pass. Existing campaigns released under 0.1 need a fresh audit before the review gate passes again.

### Fixed

- BibTeX citation refs in the audit no longer double the `S-` prefix.
- `artifactAdd` now reports `duplicate: true` only when the content address already existed; a new artifact emits `artifact.added` instead of `artifact.annotated`.
- `matrix.csv` neutralises spreadsheet formula injection (`=`, `+`, `-`, `@` prefixed cells) without dropping the value.
- Matrix Markdown escapes `|` and newlines in headers/titles and tolerates missing cell arrays.
- BibTeX explicit duplicate keys are suffixed instead of producing duplicate `@article` keys; `note = {kind: …}` restores dataset/report/preprint kinds on import.
- RO-Crate now emits `Assertion` (claims), `CreativeWork` (evidence) and `PropertyValue` (extractions) nodes, links them from the root `hasPart`, and uses the package `VERSION` in the software node.

### Known limits

- `rsx_run` records executions; it never runs a command itself.
- No built-in literature search or PDF extraction; BibTeX import is parsing, not retrieval.
- Audit freshness is content-based, not a signature; it detects edits, not malicious re-hashing.
- Token overhead grows with five new tool schemas (measured in README).

## [0.1.0] - 2026-11-17

First release. Built as a DSH host plugin + web client panel, with a real end-to-end campaign used as acceptance evidence.

### Added

- Nine-stage research pipeline: scoping → survey → hypothesis → design → execute → analyze → write → review → release.
- Nine machine-checkable gates with structured `{stage, ok, checks, blocking}`, append-only gate history, and `advance` that refuses on blocking checks.
- Evidence ledger: sources (content-addressed capture), claims/hypotheses, evidence rows with `supports/refutes/context`, runs (command/seed/exit code/metrics/stdout artifact/negative control), numbers with `run:R-…` or `source:S-…` traces and 1e-6 value verification.
- SHA-256 hash-chained event log with genesis, restart continuity, tamper/truncation detection (tail anchored to `state.seq`/`state.lastHash`) and artifact hash/size/id checks.
- Artifact store: content addressing with 64 MB hard limit checked before read, valid-duplicate no-rewrite, corrupted-address repair, `invalid_input` for malformed ids, and `invalid_id`/`unreadable` reported by `verify` instead of thrown. `verify` also reconciles `artifacts/` against `state.artifacts`: unregistered address files are `missing_entry`, stray names/directories are `orphan_file`, while a registered entry without a file stays `missing`.
- Pre-registration, disconfirming-search record, world model (entities/facts/questions/failures/coverage/novelty/safety), dual-use pass gate.
- AI-assistance declaration (model, human reviewer, watermark) enforced by the release gate.
- Export: `REPORT.md` (14 sections), `campaign.json`, `ledger.jsonl`, `declaration.md`, `BUNDLE.zip` (store-only ZIP, ≤2 MB artifacts, skipped list).
- Ten task templates (lit review, clinical trials, ML pipeline, health trends, paper slides, interview synthesis, OSS evaluation, quant backtest, academic site, due diligence) and three method protocols (replication, ablation, adversarial review), zh/en.
- Nine agent tools: `rsx_campaign`, `rsx_template`, `rsx_source`, `rsx_claim`, `rsx_evidence`, `rsx_run`, `rsx_number`, `rsx_gate`, `rsx_write`; every error carries `code`, `error`, `repair` and optional `detail`.
- Sidebar panel (order 26): overview with stepper/budget/integrity, six-tab ledger, template browser, rendered report, settings, zh/en, light/dark, responsive down to 375 px.
- Loopback-only panel API with `x-dsh-research-suite` header, same-origin check, 2 MB body cap, strict id validation, no auth cookie.
- Tier budgets S/M/L/XL with per-stage shares, charge and overrun detection.
- 42 tests: ledger (including artifact limits, dedup/repair, chain truncation, orphan/missing-entry reconciliation), gates, full flow, templates, tools, panel HTTP, client helpers.
- Reproducible token measurement scripts (`measure-overhead.mjs`, `measure_tokens.py`).

### Known limits

- `rsx_run` records executions; it never runs a command itself.
- No built-in literature search or PDF extraction.
- Token overhead is ~4.4k per request while the bundle is enabled.
- The acceptance campaign uses a fixed-seed synthetic cohort; it validates the pipeline, not a sleep-science claim.
