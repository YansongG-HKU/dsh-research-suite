# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [1.1.0] - 2026-11-19

Operator-console release. 1.0 answered “is this project deliverable”; 1.1 answers “which project needs me now, and how do I shelve one without losing it”. The release adds a cross-campaign portfolio, makes archive a reversible lifecycle action, and removes a settings switch that never had an execution path. No new tool, gate or schema.

**DSH alignment:** `engines.dsh` is now `>=0.2.2-rc.5` and the README requirement line names 0.2.2-rc.5. The Host surface used by the suite (tools register, `systemPrompt.section`, `webServer.register`, `agents.list`, `slots`) is unchanged from 0.2.2-rc.3; 175/175 tests pass.

### Added

- **Portfolio API** (`GET /api/portfolio`): per campaign `releasePassed`, `attention`, `attentionReasons` (`stale_audit / audit_blocking / monitoring_alert / integrity / schema`), audit freshness/blocking, integrity, alerts, schema and score; totals gain `unmigrated`, `attention` and `archived`. `released` now counts a passed release gate instead of `stage === "release"`.
- **Portfolio panel view**: KPI row, title/ID/domain/stage search, 全部/需关注/进行中/已发布 filters, attention-first + updated-at sort, per-row open. The view is lazy: it calls `/api/portfolio` only when opened, so `/api/state` stays cheap.
- **Reversible archive**: `store.unarchive()`, `service.unarchive()`, `POST /api/campaign {action:"unarchive"}`, `rsx_campaign action:"unarchive"`, `state.archivedCampaigns` and `archivedCount`. Archive now refuses only archived/busy campaigns; export keeps the release-gate and pause rules. A paused campaign can be shelved, and its pause record survives restore.
- **Archived-project UI**: header count button, modal list with ID/stage/updated-at and a restore action; restoring closes the modal, returns to the overview and loads the campaign.
- **Actionable errors**: `apiGet` / `apiPost` preserve `code`, `status` and `detail`; the panel renders `[code] message` and no longer discards the server’s machine-readable reason.
- **Health issue details**: an issue cell is now `<details>` with `E/W/I` counts and severity/code/detail/ref per finding.
- **Refresh and race safety**: header refresh button with disabled/spinning state; monotonic request sequence for `/api/state`, campaign detail and domain; stale responses cannot overwrite a newer selection.
- **Accessibility**: modal focus trap, Escape close, focus restoration, `:focus-visible` for controls, horizontally scrollable tab bar, `prefers-reduced-motion` handling.

### Changed

- Version `1.1.0` in `package.json`, `lib/config.js`, `src/client/00-head.js`, the desktop panel and docs; bundle 182,223 B.
- Settings save now applies the selected language immediately (`onSaved(language)`), instead of only persisting it.
- `DEFAULT_SETTINGS.allowExec` and `resolveConfig().allowExec` removed; `rsx_run` remains record-only. Legacy `allowExec` keys in `settings.json` are ignored and dropped from the public settings view.
- `actionGate` no longer computes the release gate for `archive`; `unarchive` checks busy but not release/pause.
- `scripts/acceptance.mjs` writes `acceptance-${VERSION}.json` and prints the current version; `scripts/release-check.mjs` checks the current CHANGELOG entry, the 1.1 docs, and the portfolio bundle.

### Verification

- **Unit/integration**: `npm test` **175/175**. New assertions cover: archive before release and while paused, archive blocked only when archived/busy, `unarchive` changed/idempotent/busy, archived state counts, portfolio route + `totals.archived`, `allowExec` removal, client `errorText`/`Portfolio`, and the release-gated export still refusing archived/busy states.
- **Contract/static**: `npm run release:check` passes with schema 5, 16 tools, bundle 182,223 B; `npm run check` passes.
- **Acceptance**: `npm run acceptance` **27/27** in **1,944 ms**; report `_artifacts/acceptance-1.1.0.json`.
- **Live DSH GUI** (installed plugin, loopback): panel shows `1.1.0`; portfolio reports 9 active / 5 released / 8 attention / 5 archived; search `DOE` → 1 row, attention filter → 8 rows; opening a row loads that campaign’s overview; archived modal lists 5 projects; health expands to `schema 4 can be migrated to 5`; language switch en→zh and refresh path leave no console error. Screenshots: [`portfolio-1440`](_artifacts/live-1.1/portfolio-1440.png), [`portfolio-390`](_artifacts/live-1.1/portfolio-390.png), [`archived-1440`](_artifacts/live-1.1/archived-1440.png).
- **Stability**: `npm run rsi` 100/A/L4, `npm run rsi:suite` 5/5; devkit verify `20261119-034629-42fpnq` boundary/version/unit pass (175 tests, 14,646 ms); trend health **100 green**, pass rate 100%, change failure rate 0%, latest duration +10.3% versus the prior run and no regression/flaky flag. Absolute duration is above the 1.0 run because the host was under load; unchanged tests shifted uniformly.
- **Overhead**: fixed 12,560/12,532 cl100k/o200k, **+46/+46** over 1.0 (from the `unarchive` action and archive note only).

### Known limits

- Portfolio is read-only and does not batch-migrate, batch-archive or batch-export.
- `attention` is an operational hint, not a research-quality score and not a substitute for the release gate.
- Archive is not deletion: there is no purge, compaction or cross-device sync.
- Absolute verification duration is higher than the 1.0 baseline under current host load (unchanged tests slowed uniformly); the devkit trend is green with no regression or flaky flag.

## [1.0.0] - 2026-11-19

First stable release. The contract is now explicit: schema 5 adds FAIR/CRediT stewardship, a schema-5 release blocks without it, old schemas remain readable and advisory, and changing an old campaign's contract requires an explicit verified migration with a backup. A read-only doctor, index rebuild, reproducible acceptance harness and checksummed export manifest make the release inspectable instead of asserted.

### Added

- **`lib/stewardship.js`**: FAIR/CRediT record (`license`, `licenseUrl`, `dataAvailability`, `codeAvailability`, `funding`, `competingInterests`, `ethics`, `keywords`, `contributors`), strict merge validation, 14-role CRediT vocabulary, ORCID normalization, completeness scoring, standalone `STEWARDSHIP.md` and report section. No runtime dependency.
- **Schema 5**: `STEWARDSHIP_SCHEMA = 5`, `SCHEMA_VERSION = 5`; `emptyState` creates `stewardship` and `migrations`. Schema 1–4 remain readable; new checks are blocking only for schema ≥ 5.
- **Release gate `stewardship`**: schema-5 release is now **13/13**; missing license, data/code availability, competing interests, ethics or a contributor with a CRediT role blocks release. It is protected from waivers. Old schemas see the same check as advisory. Audit adds `stewardship_incomplete` (major).
- **`service.stewardship`**: `rsx_campaign action:"stewardship"` reads or sets fields, emits `stewardship.updated`, returns completeness and the release gate. Also accepted at create and at migration.
- **`service.migrate`**: explicit schema 1–4 → 5 migration with `dryRun`, integrity verification, a `backups/<campaign>/backup-*.zip` containing `manifest.json` + `state.json` + `events.jsonl`, `campaign.migrated` event, `migrations` history and idempotence. Schema < 4 dry-runs also report `program.missing`. Broken chains/state/artifacts raise `integrity_blocked` before a backup is written.
- **`service.doctor` / `service.reindex`**: read-only health scan (chain, state hash, artifacts, index vs directories, lock age, audit freshness/HMAC, schema, stewardship) and an index rebuild that reads state files but never modifies them. `doctor` never creates the signing key or deletes locks; it scans at most 200 campaigns.
- **Export manifest**: `MANIFEST.json` with plugin/schema/campaign hashes, release gate and per-file bytes + SHA-256, plus `STEWARDSHIP.md`; both are in `BUNDLE.zip`. The manifest omits its own and the ZIP's self-hash by format.
- **API/panel**: `apiVersion`, `pluginVersion`, `schemaVersion` in `/api/state`; `GET /api/doctor`, `GET /api/stewardship/:id`, `POST /api/reindex`, `POST /api/campaign action:"stewardship"|"migrate"`; a new **Health** view with global/project rows, reindex and explicit migration.
- **Release engineering**: `scripts/release-check.mjs`, `npm run release:check`, `scripts/acceptance.mjs`, `npm run acceptance`, `npm run verify`; `MIGRATION.md`, `SECURITY.md`, `docs/1.0.0-发布契约.md`, `docs/1.0.0-迁移与恢复.md`, `docs/1.0.0-验收.md`.

### Changed

- Version `1.0.0` in `package.json`, `lib/config.js` and `src/client/00-head.js`; `client.js` rebuilt at 165,036 B (161,561 characters).
- `publicState` exposes a normalized stewardship summary and `schemaVersion`; old states without the field read as empty rather than crashing.
- Report §12 gains §12.1 (FAIR/CRediT); RO-Crate root/campaign gain `license`, `conditionsOfAccess` and keywords.
- Tool count stays **16**; `rsx_campaign` adds four actions and two properties, and `rsx_write` adds the two export files.
- Fixed overhead **12,514/12,486** cl100k/o200k, **+283/+287** over 0.14.0 (about +2.3%), from the expanded `rsx_campaign` and `rsx_write` descriptions; the prompt section is unchanged.

### Verification

- **Unit/integration**: `npm test` **174/174**; new `stewardship.test.mjs` covers validation, completeness, schema-5 blocking, schema-4 advisory, migration dry-run/backup/idempotence/broken-chain refusal, doctor read-only/index/lock, and manifest hashes; tool/panel/client tests cover the new actions, routes, versions and health view.
- **Contract/static**: `npm run release:check` passes; `npm run check` passes with a 165,036 B / 161,561-character bundle; 16 tools and schema 5 agree across package/config/client.
- **Acceptance**: `npm run acceptance` **27/27** in 795 ms over a temporary directory: nine-gate release (13/13), export with 24 manifest files verified byte-for-byte, schema 4→5 migration with a real backup and idempotent second call, stale-index doctor → reindex → doctor over 3 campaigns. Report at `_artifacts/acceptance-1.0.0.json`.
- **Live after reload**: the installed DSH GUI reported `pluginVersion=1.0.0`, `schemaVersion=5`, `apiVersion=1`; `doctor` scanned 14 campaigns with 0 errors, 14/14 indexed and 5 warnings only on legacy campaigns (3 stale audits, 2 old audit signatures). The real released campaign `rs-f7edf967` was dry-run then migrated schema 4→5: backup `backup-2026-11-18T18-31-44-834-e8c0d8.zip` (112,949 B, SHA-256 `a7b25309…`), `migrations` recorded, gate **13/13**, `chainOk/stateOk=true`, 13 artifacts, stewardship 100%. Export produced 25 manifest files and a 39-entry / 265,037 B bundle; every manifest byte count and SHA-256 verified, `STEWARDSHIP.md` 1,120 chars and REPORT §12.1 present. `reindex` rebuilt 14/14 and `doctor` stayed green. Panel health view screenshot: `_artifacts/live-1.0/health-1440.png`.
- **Stability**: `npm run rsi` 100/A/L4, `npm run rsi:suite` 5/5; devkit `verify` run `20261118-185411-ga3bt3` boundary/version/unit pass (174 tests, 6,828 ms); `trend` health 100, pass rate 100%, change failure rate 0%, no regression or flaky; tests Δ+10 and the latest duration Δ-9.5% versus the prior baseline. Fixed overhead **12,514/12,486**, +283/+287 over 0.14.0.

### Known limits

- Stewardship completeness is a contract check, not legal or ethics approval. It does not replace institutional review.
- Migration backs up state + ledger, not artifacts; full snapshots still use `export`/`BUNDLE.zip`.
- Migrating schema 1–3 projects to 5 also activates the schema-2/3/4 checks (source rigor, search protocol, sensitivity, programme); dry-run reports stewardship and programme gaps but not every older check, so inspect the release gate before migrating a released project.
- No PDF retrieval/parsing, dual independent screening/kappa, static encryption or multi-user remote service.

## [0.14.0] - 2026-11-19

Candidate-level screening: the aggregate `hits/screened/included` counts now have a reviewable record behind them. Each candidate carries separate title, abstract and full-text decisions, a bounded exclusion reason, an optional duplicate pointer and an optional link to a ledger source. The same records deterministically produce PRISMA 2020 flow counts, a Mermaid diagram and a candidate CSV. Still 16 tools, schema 4, nine gates, no PDF parsing.

### Added

- **`lib/screening.js`**: candidate normalization, three-stage decision validation, exclusion-reason vocabulary, duplicate handling, PRISMA count/flow computation, Markdown/Mermaid and CSV renderers. No runtime dependency; the module never writes the ledger or reads a PDF.
- **`sourceScreen`** (`lib/service.js`): `rsx_source action:"screen"` creates or reuses a candidate (by explicit id, or by DOI/title), links a source, records one title/abstract/full-text decision, and emits `screening.decided` or `screening.duplicate`. `exclude` requires a reason; `not-retrieved` is full-text only. Duplicates are removed before screening and counted once.
- **`screeningPrisma`** (`lib/service.js`): `rsx_source action:"prisma"` returns the PRISMA object: identification, duplicate pairs, three-stage counts, per-reason exclusions, pending ids, included ids, `flow.nodes/edges`, warnings, `consistency` and the full candidate records. `complete` is true only when no candidate is pending and `consistency.ok` is true.
- **Exports**: `PRISMA.json` (machine-readable flow + records), `PRISMA.md` (counts, three-stage table, reasons, Mermaid flow, candidate table) and `PRISMA.csv` (candidate-level decisions) are written by `rsx_write action:"export"`, listed in `paths`, included in `BUNDLE.zip`, and summarised in `REPORT.md` §17.2. Existing `references.bib/.csl.json/.ris` exports are unchanged.
- **Panel**: `GET /api/prisma/:id?format=json|markdown|csv` and a matching `POST /api/campaign action:"screen"` loopback route; the review view downloads `PRISMA.json`.
- **Tests**: `test/unit/screening.test.mjs` (three stages, schema 4, reason validation, duplicates, pending/out-of-order warnings, downstream clearing, full-text eligibility, failed-write rollback, `consistency`/`complete`, CSV formula neutralization, counts, renderers, export bundle), plus tool schema/dispatch and panel route coverage. **164 tests** pass.

### Changed

- `emptyState` adds `screening: { candidates: [] }`; old state files normalize lazily, so the schema stays **4** and no migration is required.
- **Hardening**: a title/abstract decision other than `include` clears later-stage decisions and records the cleared fields in the event; a full-text decision requires title and abstract to be `include`; a failed `sourceScreen` restores the in-memory screening table instead of leaking a partially created candidate. PRISMA exposes `consistency.ok/codes` and treats malformed rows, out-of-order decisions, decisions after exclusion, decided duplicates, orphan duplicates and duplicate-of-duplicate chains as inconsistent; `complete` requires consistency as well as no pending candidates.
- `rsx_source` description and schema add `screen`, `prisma`, `candidate`, `source`, `stage`, `decision`, `reason`, `duplicateOf`, `reviewer`; tool count stays **16**. No gate, prompt-section or reference-format change.
- Version `0.14.0` in `package.json`, `lib/config.js` and the client bundle; `client.js` rebuilt at 150,779 B.
- Fixed overhead **12,231/12,199** cl100k/o200k, **+332/+332** over 0.13.0 (about +2.8%), entirely from the expanded `rsx_source` schema.

### Verification

- **Unit/static/gates**: `npm test` **164/164**, `npm run check` (client up to date), `npm run rsi` 100/A/L4/`rsiReady:true`, `npm run rsi:suite` 5/5; devkit `verify` run `20261118-180332-8ghv6g` boundary/version/unit pass (164 tests, 9,991 ms); devkit `trend` health **100**, pass rate 100%, latest duration Δ-7.6%; test count is **164** (+7 vs 0.13.0).
- **Live API after reload**: on existing campaign `rs-a874c2ae`, `POST /api/campaign action:"screen"` wrote 4 real candidates: 4 identified, 1 duplicate removed, 3 retained, 1 title/abstract exclusion (`wrong-outcome`), 2 reports sought, 1 not retrieved, 1 assessed, 1 included, 0 pending. `GET /api/prisma/rs-a874c2ae` returned `complete=true` with `consistency.ok=true`; `PRISMA.md` was 2,168 characters and `PRISMA.csv` 1,466 characters. The state has `schema=4`, 4 candidates and `chainOk=true` / `stateOk=true`; the export was inspected on disk, not inferred. Two rejected writes (missing reason; full text before title+abstract include) returned 400 without changing the candidate count or `R-0002.fullText`; see `_artifacts/live-prisma/rejections.json`.
- **Compatibility**: 0.13 `import/export/lookup` tests still pass; no PDF/parser dependency was added.

### Known limits

- PRISMA counts are only as good as the recorded decisions: no automatic relevance classifier, no dual independent reviewers, no full-text retrieval or PDF reading. `complete` means no pending record and no consistency warning, not methodological adequacy; `consistency` is diagnostic and not a release gate.
- Duplicate detection is explicit (`duplicateOf`); DOI/title matching only reuses a retained candidate, it does not infer duplicate pairs from arbitrary metadata.
- The panel write route exists for loopback parity/testing; the agent-facing path remains the two `rsx_source` actions.

## [0.13.0] - 2026-11-19

Reference interoperability: the ledger can now take the exports researchers actually have (CSL-JSON from Zotero, RIS from Zotero/EndNote/Rayyan, and the existing BibTeX), resolve a DOI into a ready-to-add source draft, and emit a formatted reference list plus `references.csl.json` and `references.ris` alongside `references.bib`. This is the first layer of the “collection → screening → submission” path; it deliberately does not add PDF parsing or a second tool.

### Added

- **`lib/references.js`**: dependency-free CSL-JSON and RIS parsers/renderers, format auto-detection, per-field bounds, HTML stripping, DOI normalization, source mapping (`sourceFromCslItem`, `sourceFromRisRecord`, `sourceDraftFromCandidate`), citation coverage and a Markdown reference list. CSL types map to the existing ledger kinds; unknown types become `other` and are recorded, never guessed as `paper`.
- **`sourceImport`** (`lib/service.js`): one import path for `format:"auto" | "bibtex" | "csl-json" | "ris"`, 100-record cap, DOI/title deduplication, `references.imported` event, and a per-record `imported/items/skipped` report. The legacy `sourceImportBibtex` remains for compatibility.
- **`sourceReferences`** (`lib/service.js`): `csl-json` and `ris` export next to BibTeX. `rsx_source action:"export"` and `GET /api/references/:id?format=...` expose the same content; the panel review view now also downloads CSL-JSON and RIS.
- **`lookupDoi`** (`lib/retrieval.js`): bounded, single-record Crossref lookup with DOI validation, exact-DOI mismatch rejection and `not_found` on HTTP 404. `rsx_source action:"lookup"` returns the candidate plus a `sourceDraft` for `action:"add"`, so a DOI is one call away from the ledger.
- **Report section 17**: formatted reference list with author/year/title/venue/DOI and a cited-vs-uncited count parsed from `[[src:S-0001]]`; uncited ledger sources stay visible and are marked, not silently dropped.
- **Tests**: `test/unit/references.test.mjs` (CSL array/`items` wrapper, RIS continuations, detection, render round-trip, dedupe, report markers, DOI lookup success/404), plus tool, panel and export coverage. **157 tests** pass.

### Changed

- Export writes `references.csl.json` and `references.ris`, adds them to `paths` and `BUNDLE.zip`, and lists them in `REPORT.md` §17.1.
- `rsx_source` description and schema add `export`, `lookup`, `data`, `format`; tool count stays **16**. No schema version, gate or state-shape change.
- Version `0.13.0` in `package.json`, `lib/config.js` and the client bundle; README current-version/test-count/token sections and the new design doc updated. Fixed overhead **11,899/11,867** cl100k/o200k, **+151/+149** over 0.12.0 (`rsx_source` schema grew by about 150 tokens); no new prompt section.

### Verification

- **Live API**: after disabling/enabling the bundle, `GET /api/references/rs-f7edf967?format=csl-json` returned **200** with 11 CSL items (before reload the same route was **404**); `POST /api/export/rs-f7edf967` returned **200**. The export wrote `references.csl.json` (4,480 B), `references.ris` (2,629 B), `references.bib` (2,693 B); `REPORT.md` §17 reported 11 ledger sources, 9 cited, 2 uncited; `BUNDLE.zip` contained all three reference files. The report text and bundle were inspected on disk, not inferred from the route response.
- **Gates**: `npm test` **157/157**, `npm run check` (`client.js` 6 fragments / 149,968 B), `npm run rsi` 100/A/L4/`rsiReady:true`, `npm run rsi:suite` 5/5; devkit `verify` boundary/version/unit pass (run `20261118-170629-7rro7p`, 157 tests, 6,277 ms); devkit `trend` health **100**, pass rate 100%, tests Δ+0, duration Δ-25.6%, no regression or flaky run.

### Known limits

- CSL-JSON/RIS are exchange formats, not full CSL processors: no style rendering, no citation disambiguation, no locale files. The report uses one built-in author-year style.
- DOI lookup covers Crossref only; DataCite, PubMed and publisher pages are not queried. A 404 means Crossref does not know the DOI, not that the work does not exist.
- Imported `notes` carry the abstract/note text; no separate `abstract` field is added to sources yet.
- Screening decisions and PRISMA exclusion reasons are still aggregate (0.14 roadmap), not candidate-level.
- `rsx_write action:"export"` still calls `service.write` directly and does not pass the HTTP action gate; the panel route remains the gated path.

## [0.12.0] - 2026-11-18

Visual iteration flywheel: the Overview now renders the nine research stages as a ring over the live ledger, keeps the current gate, open pause and next action in one ordered rail, and lists only the cycle rows that actually exist. A unified five-action rail derives the availability of export, ledger, audit, report and archive from real state instead of scattering them across the card and footer. No scoring, no synthetic progress and no new tool or token cost.

### Added

- **`Flywheel`** (`src/client/02-ui.js`): 340×340 SVG ring with nine stage nodes, done/current/blocked/pending states, progress arc, centre round/stage counter, live gate line, pause banner, four real KPIs (`gate.passed/total`, evidence count, source count, `state.seq`), and a next-action card with copyable call.
- **`FlyAction` + `flywheelActionAvailability`**: one canonical row for `导出研究包 / 查看台账 / 查看审查 / 查看报告 / 归档`. Export and archive require a passing release gate, no open pause, not archived and not busy; report requires `write` or later; ledger and audit are read-only and stay available during a pause. Native `disabled`, `aria-disabled`, contextual `title`/help text and no `onClick` when disabled; archive keeps its confirmation. The helper is exposed for tests so the rule stays pure and directly assertable.
- **Rendered action test**: loads the built client in a `vm`, renders `Flywheel` for complete, paused and busy states, finds five native buttons by `data-action`, and asserts enabled/disabled plus the exact reason instead of trusting the pure matrix alone.
- **`IterationTrail`** (`src/client/03-views.js`): the last four `state.cycles`, with decision tone, time, run, goal and observation; an explicit empty state explains `rsx_campaign action:"cycle"` when no cycle exists.
- **`OverviewFlywheel`**: campaign strip, project header, flywheel hero, then iteration trail, gate checks, campaign facts and research-loop score. The old linear overview is retained as `OverviewLinear`; rollback is one line in `Overview`.
- **i18n and tests**: bilingual flywheel/pause/trail labels; `flywheelModel` tests for real stages, blockers, rounds and the live-gate fallback.

### Changed

- **Server action gate**: `/api/export/:id` and the archive action now call `service.actionGate` (release gate, open pause, archived, busy) before mutating. The service `archive()` re-checks the same gate, so `rsx_campaign action:"archive"` cannot bypass it. Blocked calls return HTTP 409 with `code:"action_blocked"` and `detail.reason` in `paused | archived | release | busy`; the client rail and `flywheelActionAvailability` are unchanged.
- **`flywheelModel`** now uses the gate returned by the detail endpoint when the current stage has no persisted `state.gates` entry. A current blocking gate is therefore `blocked` (red, `!`) instead of an uninformative `current`; persisted gates still win and earlier stages stay `done`.
- **`01-styles.js`** adds the flywheel grid, centre, labels, KPI row, pause banner, next card, footer, five-action rail, action hint, trail and empty-state rules. At ≤980px the grid becomes one column; at ≤700px KPIs become two columns, the SVG caps at 270px, the centre at 96px and the action rail becomes three columns. The existing `.rsx-stepper` rules are untouched.
- Version `0.12.0` in `package.json`, `lib/config.js` and the client bundle; README current-version/test-count/token sections and the new design doc updated. No tool schema or system-prompt change.

### Verification

- **Real GUI, complete**: `rs-f7edf967` shows 第 2 圈, 9/9 stages, 12/12 gate, 4 evidence, 11 sources and all five actions enabled. Clicking `导出研究包` rendered `研究包已生成 · C:\Users\13645\.dsh\research-suite\campaigns\rs-f7edf967\exports\BUNDLE.zip`; clicking 查看台账, 查看审查 and 查看报告 switched views; clicking 归档 opened the custom confirmation, and cancelling left the project untouched. The campaign went from 79 to 82 events through the report/export renders, with no restart or crash.
- **Real GUI, paused**: `rs-a874c2ae` shows 假设, 2/9, 0/1 gate, `LP-0002`, 8 sources and 25 events. `导出研究包` and `归档` are disabled with `…：先处理当前暂停`, `查看报告` is disabled with `…：写作阶段后可查看报告`; `查看台账` and `查看审查` stay enabled, and clicking either switches views. The `假设` node is `blocked`, and the two real cycle rows `K-0002`/`K-0001` remain.
- **Action matrix**: complete -> all five enabled; paused -> export/archive/report disabled, ledger/audit enabled; hypothesis before write -> report disabled; release blocked `11/12` -> export/archive disabled; archived -> export/archive disabled; busy -> export/archive disabled with `处理中`. The rendered test asserts the same states from the built bundle.
- **Layout**: at a 1440px window the action rail uses 98–99px buttons in 521px of content width with no overflow; at the full 1938px window it is 974px with 190px buttons. At ≤700px the rail becomes three columns. Screenshots: `_artifacts/v012-flywheel-complete-1440.png`, `v012-flywheel-paused-1440.png`, `v012-actions-complete-1440.png`, `v012-actions-paused-1440.png`, `v012-flywheel-mobile-520.png`.
- **Server gate, live**: before the plugin reload, `POST /api/export/rs-a874c2ae` on a paused campaign still returned **200**, confirming the old process could bypass the button. After toggling the bundle, the same request returned **409** with `code:"action_blocked"` and `detail.reason:"paused"`, the archive action returned the same 409, and `rs-f7edf967` export still returned **200**. This probe added one export event to each campaign (25→26 and 82→83).
- **Gates**: `npm test` **147/147**; `npm run check`; `npm run rsi` 100/A/L4/rsiReady:true; `npm run rsi:suite` 5/5; devkit `verify` boundary/version/unit after the final build (run `20261118-162024-40bzap`, 147 tests, 7498ms); devkit `trend` health green 100, tests Δ+0 (147 vs the 146 baseline at 0.11), duration Δ+2%, no regression or flaky run.

### Known limits

- The rail is in-card, not a viewport-fixed overlay: it stays beside the ring while the card scrolls, which keeps the document flow intact and avoids covering the panel.
- The trail shows the latest four cycles only; the full list remains in the ledger.
- The DSH desktop enforces a minimum window width, so the narrow screenshot is a 600px-content capture (with a 520px CSS-viewport check); it is not a fabricated 390px device frame.
- The ring intentionally measures completed stages, not time or effort; a project with no cycles shows `预备` rather than inventing a round.
- Action availability is enforced on both sides for the panel routes: the client rail is still a UI guard, and `/api/export/:id` plus the archive action now return 409 `action_blocked` when the release gate, an open pause, the archive bit or a held `.write.lock` says no. The service `archive()` also checks, so the tool archive path is covered. `rsx_write action:"export"` still calls `service.write` directly and does not pass through the HTTP gate.
- Archive is logical, not physical: `store.archive` sets `archived:true` and writes an event, and there is no delete route. The GUI confirmation was exercised only up to the confirm dialog and cancelled; the confirm-then-delete path remains out of scope and unexecuted.
- Ledger and audit stay available during a pause by design, so a blocked project can be inspected without resuming it; only write actions are gated.
- On this machine export completes fast enough that the `处理中` disabled state is below normal UIA sampling latency; the busy rule is covered by the rendered test and the helper, not by a long-running screenshot.

## [0.11.0] - 2026-11-18

Host-loop checkpoint: `rsx_campaign action:"loop"` turns the 0.10 planner into a bounded, auditable loop. Before every iteration it verifies ledger integrity, stage budget, the current gate and the autonomy cycle budget, then returns `continue`, `pause`, `stop` or `ready`. A `needsInput`, human or unmapped primary action is recorded as an `LP-xxxx` row plus a `loop.paused` event; an explicit `resume:true` is refused while the blocking plan is unchanged and records `loop.resumed` only after the input changes the plan. It never executes the recommended tool or approves a checkpoint.

### Added

- **`lib/loop-control.js`**: pure `checkLoop(state, {gate, integrity})`; normalises `state.loop`, exposes `checks.integrity/budget/prereg/gate/cycles`, `iteration`, `maxCycles`, `planHash`, `pauseKind` and the plan. Stop precedence is inherited from `planNext`; pause classification only runs after integrity, pre-registration timing, budget, release-ready, terminal-cycle and cycle-budget checks.
- **`rsx_campaign action:"loop"`** and `service.loop()`: records one pause per blocking plan, keeps repeated checks idempotent, refuses an unchanged resume without writing, and records `loop.resumed` after the plan changes. `state.loop` and `state.loopPauses` are additive; old campaigns initialise them on first pause.
- **Planner metadata `unmapped:true`**: unknown gate and programme checks are now visibly unmapped instead of looking like ordinary placeholders; the loop pauses with `unmapped_gate` rather than guessing a fix.
- **Tests**: `test/unit/loop-control.test.mjs` (8 tests: continue/no mutation, needs_input, human and unmapped pauses, budget/integrity/cycle-budget stops, ready, idempotent pause + rejected resume + successful resume, real human-approval pause without an approval, tool schema/dispatch). 141 total.

### Changed

- Version `0.11.0` in `package.json`, `lib/config.js` and the client bundle; README, tool table, coverage list and token numbers updated.
- System prompt tells the host to call `action:"loop"` before each iteration, stop on a pause, and resume only after the missing input is supplied; `action:"next"` remains the read-only plan.
- Token overhead: **11,748 cl100k / 11,718 o200k** per request (16 schemas + prompt), +211/+213 from 0.10. The `rsx_campaign` schema grew by 146/147 and the prompt by 65/66; no new tool.

### Verification

- Record cleanup through the store (not hand-edited JSON): `Q-0002` is marked `measured:false` / `supersededBy:"Q-0003"` with an explicit UNMEASURED DRAFT note; `Q-0003` is marked `measured:true` / `supersedes:"Q-0002"`; `rs-e710b015` is archived with `quarantine.citable=false` and a `campaign.quarantined` event. Event chains verify at 25/20/77 events for `rs-a874c2ae` / `rs-e710b015` / `rs-f7edf967`.
- Real human-checkpoint acceptance on released `rs-f7edf967`: added a real review source `S-0011`, revised the manuscript, refreshed the audit to `A-0003` (`subjectHash 3a1cd91a…`), and invalidated `P-0001`. `loop` returned `pause / human_checkpoint` (`LP-0001`, blocking only `human_approval`); YG explicitly approved in the host conversation, then `P-0002` was written and `loop resume:true` returned `ready` with `loop.resumed` at event 76. No model-generated approval or pre-answer resume.
- The first loop check on the released campaign still returned `cycle_stop` because `K-0001` was terminal; a post-release revision cycle `K-0002` (`continue`) was required to surface the human checkpoint. This is documented as a use boundary, not bypassed.

### Known limits

- The loop controller is a gate, not an executor: the host still runs the recommended tool and writes its own evidence. The pause record describes the blocking plan, not the work that has not happened yet.
- Resume is intentionally strict: if the same plan fingerprint is still blocked, the request is rejected. A caller cannot use `resume:true` to waive a human checkpoint or a missing input.
- The pause ledger is per campaign and local; there is no notification, timeout, scheduler or cross-campaign arbitration.
- The stop list is inherited from 0.10; a new gate code needs both a planner mapping and a loop test. An unknown code pauses visibly, but the human still has to inspect it.

## [0.10.0] - 2026-11-18

Deterministic next-action planning: `rsx_campaign action:"next"` reads the current gate and the recorded research programme, then returns one primary tool call plus a few alternatives. It never executes, writes, approves or waives; human checkpoints are marked and integrity/budget/pre-registration-timing failures stop the plan.

### Added

- **`lib/planner.js`**: `planNext(state, {gate, integrity})`, a pure planner over the nine gates and the schema-4 programme. It returns `primary`, up to eight `steps` (tool, exact arguments, `why`, `unblocks`, `needsInput`, `human`, `risk`, `followUps`), `stop` and the current policy/budget.
- **Gate-to-tool mapping**: scoping fields, world question, survey search and source capture, hypothesis/falsifier/kill criterion, pre-registration, real runs and negative controls, traces and uncertainty, manuscript references, audit and reviews, declaration, dual-use, approval, waiver hygiene, reproduction package, and programme records (plan/perspective/autonomy/cycle/match/quality/contradiction).
- **Stop-first rules**: event-chain/state/artifact integrity failure, budget overrun, `prereg` locked after the first run, latest cycle `stop`/`escalate`, and exhausted `maxCycles` return a blocked plan instead of more work. A passing release gate outranks a terminal cycle `stop`, so a finished campaign is exported rather than reported as stopped.
- **`rsx_campaign action:"next"`** and `service.next()`; `service.get()` now includes the same plan for the panel. The panel overview renders a next-action card with the primary recommendation, human/stop badges, argument preview and a copy button.
- **Tests**: `test/unit/planner.test.mjs` (11 tests: fresh scoping, survey search, hypothesis record, review programme expansion, release export, terminal-stop release, budget stop, integrity stop, cycle stop/escalate/budget, pre-registration timing, invalid input); tool and panel assertions; 133 total.
- **Acceptance**: tool-layer `next` is read-only (events `1 → 1`); live host calls on `rs-79d63da4` (scoping), `rs-7bcc3f06` (survey) and `rs-f7edf967` (release) returned the expected primary actions; panel at 1440/390 px shows `0.10.0` and the “可交付 / 导出研究包” card, and “复制调用” changes to “已复制到剪贴板”.

### Changed

- Version `0.10.0` in `package.json`, `lib/config.js` and the client bundle; README, tool table, coverage list, acceptance section and token numbers updated.
- System prompt tells the agent to call `rsx_campaign action:"next"` between actions and to treat its stop conditions as real gates.
- Token overhead: **11,537 cl100k / 11,505 o200k** per request (16 schemas + prompt), +115/+115 from 0.9. The `rsx_campaign` schema grew by 57 tokens and the prompt by 57; no new tool.

### Known limits

- The planner recommends; the host executes. It does not call a model, run a search, write a cycle or approve a gate, so “autonomous” here means an auditable control loop, not an unattended scientist.
- Some recommendations contain explicit placeholders and are marked `needsInput`; executing them blindly would write fake evidence.
- The check-to-tool mapping is curated. Unmapped checks fall back to `rsx_gate action:"check"`; a new gate check needs a planner update and a test.
- No retrieval-quality estimator, multi-campaign scheduler, automatic waiver/approval, or retry/backoff policy.

## [0.9.0] - 2026-11-18

Live literature retrieval on the host: `rsx_search` queries OpenAlex and Crossref, normalizes the metadata, merges duplicates by DOI, and returns bounded candidates for the agent to inspect. It is read-only and does not write the ledger.

### Added

- **`lib/retrieval.js`**: key-free OpenAlex/Crossref clients, per-provider timeout via `AbortController`, injected `fetchImpl` for tests, provider-native year filters, structured `retrieval_timeout` / `retrieval_failed` / `invalid_input` errors, and single-source fallback warnings.
- **Normalization and merge**: DOI prefix/case cleanup; normalized-title+year fallback key; OpenAlex inverted-index abstracts and Crossref JATS abstracts; title/abstract/author bounds; `providers`/`providerIds` unions; one candidate per DOI. Provider bodies are capped at 4 MB and non-JSON is a structured failure.
- **`rsx_search` tool**: the 16th tool, `provider:"both"|"openalex"|"crossref"`, `limit` 1–20, `yearFrom`/`yearTo`, `timeoutMs` 1–15 s, 40 s overall tool timeout. Returns `counts`, `warnings`, `elapsedMs`; never fabricates candidates.
- **Tests**: `retrieval.test.mjs` (12 tests: success, merge, fallback, all-fail, timeout, malformed payload, invalid inputs, year params) and two tool-dispatch tests; 122 total.
- **Live acceptance**: real query `multi-agent research system` returned 6 OpenAlex + 6 Crossref and 6 merged candidates in 3,794 ms; Crossref-only fallback returned 3 in 340 ms; 12/12 checks passed. The real tool handler separately returned 4 + 4, 4 merged candidates, 0 warnings in 4,221 ms; after a bundle reload the live host `rsx_search` call returned 3 + 3 and 3 merged candidates in 2,606 ms with no ledger write, and a final reload check returned 2 + 2 in 3,442 ms.

### Changed

- Version `0.9.0` in `package.json`, `lib/config.js` and the client bundle; README, tool table, coverage list and token numbers updated.
- System prompt now tells the agent to use `rsx_search` for discovery, register only inspected candidates with `rsx_source`, and record the protocol with `searchLog`.
- Token overhead: **11,422 cl100k / 11,390 o200k** per request (16 schemas + prompt), +420/+421 from 0.8. The new schema costs 372/372; prompt +48/+49.

### Known limits

- Metadata only: no full-text download, PDF parsing or semantic relevance ranking. Preprint versions with different DOIs stay separate.
- The adapter does not write `rsx_source` or `searchLog`; those remain explicit agent actions after reading.
- Public API availability is upstream: one live run hit OpenAlex HTTP 429 and correctly returned a warning plus Crossref-only results; a later run recovered. There is no retry/backoff loop, so callers should respect rate limits and use `searchLog` for production protocols.
- Coverage, recall and precision are not measured; this is an engineering integration test, not a retrieval-quality benchmark.

## [0.8.0] - 2026-11-18

Research programme: a schema-4 campaign now records the plan and perspective coverage, an explicit autonomy policy and act→observe→decide cycles, a hypothesis tournament, a six-dimension quality rubric, and a contradiction ledger. The review gate refuses an incomplete programme; the loop grows to 13 dimensions. The design follows the external multi-agent research literature, but the suite still does not run searches, models or experiments.

### Added

- **Research programme (`lib/program.js`)**: `plan` (`G-` questions with priority/owner/coverage), `perspectives` (`O-` views with sources), `autonomy` (`maxCycles`, `stopCriteria`, `escalation`, `humanCheckpoints`), `cycles` (`K-` act→observe→decide, refused beyond `maxCycles`), `tournament.matches` (`T-` pairwise claim judgements), `quality.rows` (`Y-` six-dimension rubric), `contradictions` (`D-` open/resolved/explained). All refs resolve against the campaign; contradictions need two distinct resolving evidence refs.
- **`rsx_program` tool**: nine actions (`plan`, `perspective`, `autonomy`, `cycle`, `match`, `rank`, `quality`, `contradiction`, `list`). `match` returns the deterministic Elo ranking; `list` returns completeness checks. The 15th tool.
- **Review gate `program_complete`**: schema-4 campaigns need two covered high/medium questions, two sourced perspectives, a complete autonomy policy, at least one cycle, a hypothesis/competitor match, a full rubric with `overall ≥ 0.7`, and no open contradictions. Schema 1–3 see the check as advisory.
- **Audit `program_incomplete` (major)** lists every missing programme check; it does not block by itself, but the review gate does.
- **Elo ranking**: K=32, start 1000, draw = 0.5, deterministic over recorded match order. It is bookkeeping for pairwise judgements, not a truth or significance claim.
- **Quality rubric**: factual accuracy, citation accuracy, completeness, source quality, tool efficiency, limitations; each 0–1, `overall` is the mean, and the programme threshold is 0.7.
- **Contradiction ledger**: `open` rows block programme completion; `resolved`/`explained` rows need a resolution of at least 12 characters. `PaperQA2`'s contradiction-first framing is the design source; semantic detection is not implemented.
- **`PROGRAM.md` export** and report sections `3.2` (plan, perspectives, autonomy, cycles) and `4.2` (tournament, rubric, contradictions).
- **Loop dimension `program` (weight 8)**: 13 dimensions total; schema 1–3 return one advisory check so legacy scores do not change.
- **Tests**: new `program.test.mjs` (5 tests) plus updated full-flow/domain/tool/loop/panel fixtures; 108 total.

### Changed

- Version `0.8.0` in `package.json`, `lib/config.js` and the client bundle; panel adds a programme KPI and updates the loop copy to 13 dimensions.
- `SCHEMA_VERSION = 4`, `PROGRAM_SCHEMA = 4`; schema-4 checks are blocking, earlier schemas advisory.
- `auditSubject` version 3 when any programme field is non-empty; legacy subjects and hashes are unchanged.
- `nextId` reserves `G`, `O`, `T`, `Y`, `D`, `K`; `emptyState` carries `plan`, `perspectives`, `autonomy`, `cycles`, `tournament`, `quality`, `contradictions`; `summaryOf` exposes their counts.
- Real acceptance: new campaign `rs-f7edf967` (schema 4) with 10 sources, 3 plan questions, 3 perspectives, 1 cycle, 1 match, 1 rubric, 1 explained contradiction; `A-0001 accept` (0 blocking / 0 major / 2 minor), release 12/12, `L-0001 100/100, L4, rsiReady:true`; probe `blocked_cases=3`, schema-3 negative `legacy_missing_blocked=0`, `preregBeforeRun:true`.
- Token overhead: **11,002 cl100k / 10,969 o200k** per request (15 schemas + prompt), +1,464/+1,451 from 0.7. The 15th schema is the main increase; it buys a programme-level contract rather than more narrative.

### Fixed

- Tool/loop/panel counts and fixtures were updated together so schema-4 checks are exercised by the full-flow, domain and RSI suites.
- `rsi-suite` domain fixtures now seed a programme before role reviews; otherwise the new review check correctly blocks them.
- The acceptance negative control deliberately reports a different metric shape (`legacy_missing_blocked`, `blocked_cases`) so the audit cannot mistake it for an identical rerun.

### Known limits

- The suite does not run agents, searches, PDF parsing or experiments; all programme records are declarations by the external agent or human.
- `program_complete` proves record completeness, not scientific validity, novelty or truth.
- Elo is not a statistical ranking and a single match is weak evidence; the criterion is analyst-entered.
- The rubric is manually scored; the suite checks dimensions and threshold only.
- The contradiction ledger requires human/agent registration; no semantic contradiction detector is included.
- The probe is a deterministic engineering fixture (six cases), not an estimate of real research quality or recall.

## [0.7.0] - 2026-11-18

Search protocol and robustness: a schema-3 campaign now has to show what was searched and what happened when the analysis was deliberately changed; pre-registration timing is checked against the earliest run, and the lexical evidence screen distinguishes negation and numeric mismatches.

### Added

- **Search protocol (`lib/search.js`)**: `searchLog: Q-0001…` with `kind` (database/disconfirming/snowball/grey/other), `database`, `query`, date window, `hits`/`screened`/`included`, notes. `rsx_campaign action:"searchLog"`; the existing `action:"search"` still records the disconfirming search and now also appends a structured `Q-` row. Counts must be monotonic; a query is required. Survey gate `search_protocol` (schema 3), audit `search_protocol_missing` / `search_protocol_invalid` / `search_counts_missing`, export `SEARCH.md`, report `3.1`, reviewer packet table.
- **Sensitivity / robustness (`lib/sensitivity.js`)**: `sensitivity: Z-0001…` with claim, name, method, specification, result, direction (`consistent`/`attenuated`/`reversed`/`inconclusive`), optional `trace`, notes. `rsx_claim action:"sensitivity"`; analyze gate `sensitivity` and `sensitivity_traces` (schema 3); audit `sensitivity_missing` / `sensitivity_invalid` / `sensitivity_untraced` / `sensitivity_trace_unresolved`; export `SENSITIVITY.md`, report `4.1`, reviewer packet table.
- **Pre-registration timing**: execute gate `prereg_before_run` compares `prereg.lockedAt` with the earliest `runs[].ts` (schema 3); audit `prereg_after_run` (major). A missing lock remains the design gate's failure, not a duplicate execute failure.
- **Evidence polarity screen**: `checkEntailment` now flags `negation_mismatch` (claim and quote differ on negation) and `number_mismatch` (no shared number), exposed as `flagged` by `rsx_review action:"entailment"`; audit emits `claim_evidence_negation` (major) and `claim_evidence_number` (minor). The note that this is a lexical screen, not semantic entailment, is unchanged.
- **Schema 3**: `SCHEMA_VERSION = 3` for new campaigns, `FEATURE_SCHEMA = 3`; 0.7 checks are blocking for schema 3 and advisory for schema 1/2. `CORE_SCHEMA` stays 2 so 0.6 checks keep their old contract.
- **Tests**: new `search.test.mjs`, `sensitivity.test.mjs` and `review-flags.test.mjs`; 103 total.

### Changed

- Version `0.7.0` in `package.json`, `lib/config.js` and the client bundle.
- `auditSubject` includes `searchLog` / `sensitivity` only when non-empty and bumps the subject version to 2 in that case; legacy audits keep their subject hash.
- `nextId` reserves `Q` and `Z`; `emptyState` carries both arrays.
- Export/bundle now includes `SEARCH.md` and `SENSITIVITY.md`; report and reviewer packet render the new rows.
- Real acceptance: new schema-3 campaign `rs-5495250c` (5 probe sources + 3 docs) reached release with `A-0001 accept` (0 blocking / 0 major / 1 minor), release 12/12, `L-0001 100/100, L4, RSI prerequisites met`; legacy `rs-ad07b91f` kept `A-0004` fresh and release 16/16.
- Token overhead: **9,538 cl100k / 9,518 o200k** per request (14 schemas + prompt), +633/+630 from 0.6.

### Fixed

- `searchLog` with `disconfirming:true` also sets the legacy `state.search` flag so the release `disconfirming_missing` check does not disagree with the protocol row.
- `sensitivity` requires an explicit `direction`; omitting it no longer silently records `consistent`.

## [0.6.0] - 2026-11-18

Reasoning rigor and release governance: a claim now needs a warrant and a counter-evidence search, sources declare independence and bias, pre-registrations are lockable, approvals bind to the audit subject, and the export contains an executable reproduction package and a reviewer packet.

### Added

- **Claim rigor (`lib/rigor.js`)**: `warrant` (Toulmin), `counterEvidence` (including null results), `certainty` (high/moderate/low/very-low). `rsx_claim action:"update"` patches them; hypothesis/analyze gates block schema-2 campaigns when missing; audit emits `claim_warrant` / `claim_counter_evidence` / `claim_certainty` / `claim_contested_ignored`.
- **Source rigor**: `independence`, `design`, `riskOfBias`, `robNote`, `lineage` (`derivedFrom`/`relation`/`note`), `capturedAt`, `captureMethod`; `rsx_source action:"update"`. Survey gate requires two independent primary sources and a bias assessment on every primary source (schema 2); audit flags missing lineage targets, unassessed/high bias without a note, and missing capture receipts.
- **Pre-registration drift**: `prereg.lockedHash` + `prereg.hash`; a changed protocol needs `amend:true` + a reason of at least 12 characters, appended to `prereg.amendments`; `alpha/power/effectSize/test` are recorded. Audit flags unamended drift, amended protocols (info), and successful runs that predate the lock.
- **Review packet (`lib/review.js`)**: `rsx_review action:"packet"` returns claims with warrants/certainty, source independence, numbers, runs, audit/integrity and ten reviewer questions, rendered as `REVIEW_PACKET.md`. `action:"entailment"` runs a lexical quote-anchoring screen; it is explicitly not semantic entailment.
- **Reproduction package (`lib/repro.js`)**: `rsx_write action:"repro"` / export writes `REPRO.md`, `repro.json`, `checksums.txt` with exact commands, seeds, negative/primary runs, expected metrics, env lock, stdout artifacts and content checksums.
- **Human approval and structured waivers**: `rsx_gate action:"approve"` binds an approver/role/statement to `auditSubjectHash`; evidence changes make it stale. `action:"waive"` needs a 20+ character reason, an approver and an expiry date; integrity/signature/independence/declaration checks are protected. `action:"waivers"`/`"approvals"` list state, `waived` is included in gate results.
- **AI/human contribution matrix**: `declaration.contributions` defaults to one AI role plus the human reviewer and is exported as `AI_CONTRIBUTION.md`; release requires both actors (schema 2).
- **Standard lifecycle**: every domain standard carries `status` and `reviewedAt`; `profilePayload` exposes them and `DOMAIN.md` shows the review date next to applicability.
- **Portfolio and exploration graph**: `rsx_campaign action:"portfolio"` summarises score/level/audit freshness/alerts/integrity across campaigns; `action:"graph"` returns claim→source/run/number/figure edges with lineage.
- **Cross-domain RSI suite (`scripts/rsi-suite.mjs`, `npm run rsi:suite`)**: general + finance + ai + medicine + industrial campaigns each run all nine gates; 5/5 at 100/100, output `_artifacts/rsi-suite.{json,md}`.
- **Tests (`test/unit/rigor.test.mjs`)**: 11 new tests (92 total) covering schema 2 blocking vs schema 1 advisory, claim updates, protocol lock/amendment, protected/expired waivers, expired waiver as history, approval staleness, packet/entailment, repro export, portfolio/graph and new tool actions.

### Changed

- Version `0.6.0` in `package.json`, `lib/config.js` and the client bundle.
- `state.schema = 2` for new campaigns; legacy campaigns stay schema 1 and receive new checks as advisory (audit major/minor), so an upgrade does not retroactively block a released project.
- `gate results` now carry `waived`; `auditSubject` includes source rigor fields (changing them stales an audit).
- Token overhead: **8,905 cl100k / 8,888 o200k** per request (14 schemas + prompt), +1,141/+1,143 from 0.5.
- Real acceptance: `rs-ad07b91f` enriched (independence/bias/warrant/counter-search/certainty, prereg amendment, contribution matrix, approval) → `L-0006` **99.1/100**; fixing the `world.failure` vs `world.failures` lookup gave `L-0007` **100/100, L4, RSI prerequisites met**, `A-0004 accept` (0 blocking / 0 major), release 16/16. The campaign remains schema 1, so its new checks are advisory; that is recorded in the acceptance note.

### Fixed

- `world` stores the `failure` bucket singular while two checks looked for `failures`; both are accepted now, so a recorded competing explanation counts.
- Reproduction package no longer throws on legacy campaigns without a pre-registration (`prereg` self-reference bug).
- Entailment coverage now measures how much of the quote is anchored in the claim, not how much of a long conjunctive claim one quote covers; short quotes below three tokens are marked weak instead of passing.
- Approvals listing returns the latest row with its freshness flag.

### Known limits

- The entailment screen is lexical, not semantic; it cannot detect a quote that uses the same words to say something different.
- Human approvals and waiver approvers are declarations, not SSO-verified identities.
- Schema-1 campaigns keep new checks advisory; a 100 score there does not prove the new fields exist.
- The real welding campaign is a fixed-seed synthetic fixture for pipeline validation; its `riskOfBias:"high"` and `certainty:"low"` are deliberate, not an endorsement of welding physics.
- Waivers are expiring records, not a security control; protected checks remain blocking.

## [0.5.0] - 2026-11-17

Research-loop release: conditional applicability, monitoring with real observations/alerts, independent review envelopes, a 12-dimension closed-loop score and an RSI regression harness.

### Added

- **Conditional applicability (`lib/domains.js`)**: fields and standards accept `when: {field, in|notIn|equals|present|all|any}` plus `whenNote`. `fieldApplicability`/`fieldApplicable`/`standardApplicability` are exported; `domainMissing`, `domainCompleteness`, `domainChecks`, `domainGateSummary` and `renderDomainMarkdown` filter by the current state. Cross-field rules skip when either side is inapplicable. Medicine PRISMA/search/screening fields become conditional on systematic-review/meta-analysis; randomization/blinding on RCT; industrial DOE factors/levels/randomization on DOE designs; EU AI Act standard on limited/high risk.
- **Monitoring judgment (`lib/monitor.js`)**: `normalizeMonitoring`, `normalizeMetric`, `normalizeObservation`, `evaluateMonitoring`, `monitoringAssessment`, `withMetrics`, `withObservations`. Metrics carry `target/tolerance/direction/min/max/unit`; observations are evaluated against the latest value. Out-of-tolerance values produce alerts; missing metrics/observations and orphan observations produce coverage gaps. Status includes `alert`.
- **Monitor actions**: `rsx_campaign action:"monitor"` accepts `metrics`, `observations`, `reopen:true`, `reason`; alerts write `monitoring.alert`; reopening a released campaign moves it to `analyze` and writes `loop.reopened`. `REPORT.md` §18 and `DOMAIN.md` render metrics, observations, alerts and gaps.
- **Stdout backfill (`rsx_run action:"attach"`)**: attaches an existing stdout file to a recorded run, stores it as a `stdout` artifact, emits `run.stdout_attached`; command, seed and metrics are not altered. This closes the execution gap without inventing a second run.
- **Independent review envelope**: new reviews are `schema:2` with `affiliation`, `conflict`, `independent`, `qualification`. Domain role checks require a non-anonymous reviewer with affiliation, COI and independence; the same person cannot cover two roles (`domain_<profile>_review_independence`). Legacy reviews remain compatible.
- **12-dimension loop evaluation (`lib/loop.js`)**: `evaluateLoop` and `renderLoopMarkdown`; dimensions cover question, evidence survey, falsifiable hypothesis, pre-registration, execution, traceability, audit, independent review, domain applicability, monitoring, release declaration and ledger integrity. Score 0–100, grade, level (L0–L4), ranked gaps, next actions and RSI prerequisites. `rsx_campaign action:"evaluate"` persists `loopBaseline`, `loopEvaluation`, `loopEvaluations` (last 50), emits `loop.evaluated` and returns `previousScore`/`delta`; `rsx_write export` writes `LOOP.md` and `REPORT.md` §19; `BUNDLE.zip` includes it.
- **RSI harness (`scripts/rsi-eval.mjs`, `npm run rsi`)**: deterministic full campaign through the service API (extraction, stdout artifact, two independent reviews, signed audit, monitoring with metric + observation), evaluates it and compares with `_artifacts/rsi-baseline.json`; a lower score exits 1. `--update-baseline` is explicit. Current baseline **100/100, L4, RSI prerequisites met**.
- **Panel**: Overview shows the loop score/grade/level/delta/gaps with an evaluate button; `POST /api/campaign/:id/evaluate`; domain view keeps the monitoring form. Client bundle rebuilt.

### Changed

- Version is `0.5.0` in `package.json`, `lib/config.js` and the client bundle.
- `REPORT.md` is now 19 sections; export file list includes `LOOP.md`; system prompt and tool descriptions mention conditional fields, review envelopes, monitoring metrics and `evaluate`.
- Token overhead: **7,764 cl100k / 7,745 o200k** per request (14 schemas + prompt), +495/+497 from 0.4.
- Tests: **81** (`loop.test.mjs` adds 6, domains adds 2, panel/tools add evaluate and attach coverage). Real acceptance: `rs-ad07b91f` 93.2 → 95.8 (+2.6) → **100 (+4.2, +6.8 vs baseline)**; both runs carry stdout, 5 extraction rows, 5 monitoring metrics/observations, audit fresh, **RSI prerequisites met**.

### Fixed

- Loop citation parsing no longer prefixes `S-` twice (the 0.5 pre-release check falsely reported every citation as unknown).
- Monitoring no longer treats a plan/status record as a closed loop: metric coverage and observation freshness are part of the score, while release gates remain backward compatible.
- Review role coverage is no longer satisfied by a bare role string; identity/COI/independence are checked for new reviews.

### Known limits

- Monitoring is operator-recorded, not an automatic telemetry/SPC/alerting integration; `reopen` moves state but does not stop a production line.
- Real-project monitoring has coverage, not full inspection: the `defect_rate` observation is a normal-approximation estimate from Cpk=1.42, not X-ray inspection, and the extraction matrix covers 1/8 sources.
- Review affiliation/COI/independence are declarations, not identity verification or a COI investigation.
- The loop score checks engineering reviewability, not scientific/statistical/clinical/legal correctness.
- RSI readiness is a threshold for comparing candidate changes, not autonomous self-modification; no code generation/merge automation.
- Conditional applicability defaults to applicable when the controlling field is empty (fail-visible, not fail-open to skip checks).

## [0.4.0] - 2026-11-17

Domain-aware research loop: four protocol profiles become stage-mapped blocking checks, role-separated reviews, post-release monitoring and a domain section in every export.

### Added

- **Domain profiles (`lib/domains.js`)**: `finance` (24 fields), `ai` (26), `medicine` (35) and `industrial` (32), mapped to the nine stages. Fields, enums, numbers, dates, min/max, include-any and `N/A — reason` waivers are validated before storage. Cross-field rules: finance `in_sample_end < oos_start`; medicine `prisma_included <= prisma_identified`.
- **Stage-mapped gates**: `domainChecks(state, stage)` emits `domain_<profile>_<field>` and `domain_<profile>_<rule>` blocking checks; `gates.finish()` merges them, so a selected profile cannot advance with missing protocol fields. No profile selected keeps the 0.3 behaviour.
- **Role-separated reviews**: each profile declares two roles (`quant/risk`, `ml/safety`, `clinical/statistics`, `engineering/quality`); the review gate requires one `rsx_gate action:"review" role:"…"` per role.
- **Post-release monitoring**: `rsx_campaign action:"monitor"` records `status/plan/owner/cadence/signals/notes/reviewedAt`; release checks the plan, `REPORT.md` gains section 18, and `DOMAIN.md` renders the monitoring table. A triggered signal can use `rsx_gate action:"back"` and re-audit/re-release; the gate history keeps the path.
- **`rsx_domain` (14th tool)**: `list/get/check/set`; `create` accepts `domain`/`values`; `templateApply` propagates the template domain; the panel gets a domain tab, create-form selector, completeness, standards, role state and monitoring form.
- **Audit integration**: domain profile/values enter `auditSubject` (so edits invalidate an audit); `checkDomain` re-checks fields/rules/roles/monitoring for the current and earlier stages. Missing roles must be added before the audit, otherwise the audit is stale.
- **Export/provenance**: `DOMAIN.md` is written and bundled; `REPORT.md` gets domain section 1.1 and monitoring section 18; PROV-JSON campaign entity carries `dsh:domain`/monitoring attributes; RO-Crate campaign carries domain/monitoring keywords.
- **Templates**: `industrial-doe` (14th template, 11th task preset); `clinical-trials`/`health-trends` map to medicine, `ml-pipeline` to ai, `quant-backtest`/`due-diligence` to finance.
- **Tests**: 72 total. `test/unit/domains.test.mjs` covers the registry, validation/N/A/date normalisation, blocking fields, finance/medicine rules, review roles + monitoring, audit findings, `DOMAIN.md`/bundle/report/PROV export, template propagation, and a full AI nine-gate campaign with two role reviews and monitoring. Panel test covers `/api/domains`, profile switching and monitoring.

### Changed

- Version is `0.4.0` in `package.json`, `lib/config.js` and the client bundle (`client.js` rebuilt).
- System prompt and tool descriptions describe the four profiles, role reviews, monitoring and 11 task presets; tool count is 14.
- Token overhead: 7,269 cl100k / 7,248 o200k per request (14 schemas + prompt), up from 6,254/6,240 in 0.3.

### Known limits

- Every field is required unless explicitly waived with `N/A — reason`; there is no `when`-conditional field set yet.
- Monitoring is a plan/state record, not a live detector: no metrics ingestion, no automatic drift/SPC/AE alerting or auto-reopen.
- Reviewer roles are strings; identity, independence, COI and credentials are not verified.
- Standards are alignment references, not an applicability engine or certification. `N/A` waivers are not independently approved by the tool.
- The audit checks record consistency, not statistical/clinical/legal correctness.
- Domain coverage is four profiles; AI+medicine etc. combinations need a future composite profile.

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








