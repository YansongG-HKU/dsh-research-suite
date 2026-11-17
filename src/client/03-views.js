/**
 * dsh-research-suite — 03-views
 *
 * The four panel pages plus the settings form. Views receive plain data and
 * callbacks; they never mutate the ledger directly.
 */

    function Overview(props) {
      const p = props || {}
      const t = p.t
      const lang = p.lang
      const data = p.data || {}
      const campaigns = safeArray(data.campaigns)
      const detail = p.detail
      const [copied, setCopied] = useState("")

      const copy = (value, key) => {
        void copyText(value).then((ok) => setCopied(ok ? key : ""))
      }

      if (campaigns.length === 0) {
        return h(
          Empty,
          {
            title: t("emptyTitle"),
            body: t("emptyBody"),
            action: h(
              "div",
              { className: "rsx-actions" },
              h("button", { type: "button", className: "rsx-btn primary", onClick: () => p.onNew("template") }, h(Icon, { name: "template", size: 14 }), t("startTemplate")),
              h("button", { type: "button", className: "rsx-btn", onClick: () => p.onNew("blank") }, h(Icon, { name: "plus", size: 14 }), t("blank")),
            ),
          },
        )
      }

      const state = detail && detail.state ? detail.state : null
      const gates = state ? latestGates(state) : {}
      const gate = detail && detail.gate ? detail.gate : null
      const counts = state
        ? {
            sources: safeArray(state.sources).length,
            claims: safeArray(state.claims).length,
            numbers: safeArray(state.numbers).length,
            runs: safeArray(state.runs).length,
          }
        : { sources: 0, claims: 0, numbers: 0, runs: 0 }

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 14 } },
        h(
          "div",
          { className: "rsx-camps", role: "list" },
          campaigns.map((campaign) =>
            h(
              "button",
              {
                key: campaign.id,
                type: "button",
                className: "rsx-camp",
                "aria-current": state && state.id === campaign.id ? "true" : undefined,
                onClick: () => p.onSelect(campaign.id),
              },
              h("span", { className: "rsx-camp-title" }, campaign.title),
              h(
                "span",
                { className: "rsx-camp-meta" },
                h(Badge, { tone: "accent" }, stageLabel(campaign.stage, lang)),
                h("span", null, campaign.tier),
                h("span", null, `${campaign.counts.sources} ${t("sources")}`),
                h("span", { style: { marginLeft: "auto" } }, fmtTime(campaign.updatedAt, lang)),
              ),
            ),
          ),
        ),

        state
          ? h(
              "div",
              { className: "rsx-card" },
              h(
                "div",
                { className: "rsx-card-body", style: { display: "flex", flexDirection: "column", gap: 13 } },
                h(
                  "div",
                  { className: "rsx-row", style: { alignItems: "flex-start" } },
                  h(
                    "div",
                    { style: { minWidth: 0, flex: 1 } },
                    h("h2", { className: "rsx-h1" }, state.title),
                    h("p", { className: "rsx-sub" }, state.question || t("unknown")),
                  ),
                  h("div", { className: "rsx-actions" },
                    h(Badge, { tone: "accent" }, `${t("tier")} ${state.tier}`),
                    h(Badge, { tone: detail.integrity && detail.integrity.chainOk ? "ok" : "bad", dot: true }, detail.integrity && detail.integrity.chainOk ? t("chainOk") : t("chainBroken")),
                  ),
                ),
                h(Stepper, { state: state, gates: gates, lang: lang }),
                h(
                  "div",
                  { className: "rsx-stage-banner" + (gate && !gate.ok ? " bad" : "") },
                  h("div", { style: { flex: 1, minWidth: 0 } },
                    h("div", { className: "rsx-stage-name" }, stageLabel(state.stage, lang)),
                    h("div", { className: "rsx-stage-sub" }, gate
                      ? gate.ok
                        ? state.releasedAt || state.stage === "release"
                          ? lang === "en" ? "Released — every gate passed; export the bundle." : "项目已发布：全部闸门通过，可导出研究包。"
                          : lang === "en" ? "All checks pass — advance with rsx_gate." : "闸门已通过，可以用 rsx_gate advance 推进。"
                        : `${gate.blocking.length} ${lang === "en" ? "blocking checks" : "项阻断"}: ${gate.blocking.join(", ")}`
                      : t("noGate")),
                  ),
                  gate && !gate.ok ? h(Icon, { name: "alert", size: 20 }) : h(Icon, { name: "check", size: 20 }),
                ),
                h(
                  "div",
                  { className: "rsx-actions" },
                  h("button", { type: "button", className: "rsx-btn primary", onClick: () => p.onPrompt(campaignPrompt(state, lang)) }, h(Icon, { name: "copy", size: 13 }), t("continue")),
                  h("button", { type: "button", className: "rsx-btn", onClick: () => p.onExport(state.id) }, h(Icon, { name: "download", size: 13 }), t("export")),
                  h("button", { type: "button", className: "rsx-btn ghost", onClick: () => copy(state.id, "id") }, copied === "id" ? t("copied") : state.id),
                  h("div", { className: "rsx-top-spacer" }),
                  h("button", { type: "button", className: "rsx-btn ghost", onClick: () => p.onArchive(state.id) }, h(Icon, { name: "archive", size: 13 }), t("archive")),
                ),
              ),
            )
          : h("div", { className: "rsx-loading" }, t("loading")),

        state
          ? h(
              "div",
              { className: "rsx-grid" },
              h(Card, { title: t("gateChecks") }, h(GateChecks, { gate: gate, t: t, lang: lang })),
              h(
                Card,
                { title: lang === "en" ? "Campaign facts" : "项目事实" },
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: 11 } },
                  h(
                    "div",
                    { className: "rsx-kpis" },
                    h("div", { className: "rsx-kpi" }, h("b", null, counts.sources), h("span", null, t("sources"))),
                    h("div", { className: "rsx-kpi" }, h("b", null, counts.claims), h("span", null, t("claims"))),
                    h("div", { className: "rsx-kpi" }, h("b", null, counts.numbers), h("span", null, t("numbers"))),
                    h("div", { className: "rsx-kpi" }, h("b", null, counts.runs), h("span", null, t("runs"))),
                  ),
                  h(BudgetBar, { budget: detail.budget || state.budget }),
                  h("div", { className: "rsx-sep" }),
                  h("div", { className: "rsx-row" }, h("span", { className: "rsx-note" }, t("template") + ":"), h("span", null, state.templateId || t("blank"))),
                  h("div", { className: "rsx-row" }, h("span", { className: "rsx-note" }, t("stage") + ":"), h("span", null, stageLabel(state.stage, lang)), h("span", { className: "rsx-note" }, `· ${state.seq || 0} events`)),
                  h("div", { className: "rsx-row" }, h("span", { className: "rsx-note" }, t("integrity") + ":"), h("span", { className: "rsx-mono" }, `${detail.integrity.artifacts} artifacts`)),
                ),
              ),
            )
          : null,
      )
    }

    function Ledger(props) {
      const p = props || {}
      const t = p.t
      const lang = p.lang
      const detail = p.detail
      const [tab, setTab] = useState("claims")
      const state = detail && detail.state ? detail.state : null
      if (!state) return h("div", { className: "rsx-loading" }, t("loading"))

      const evidenceCount = (claimId) => safeArray(state.evidence).filter((item) => item.claim === claimId).length
      const tabs = [
        { id: "claims", label: t("claimTab"), count: safeArray(state.claims).length },
        { id: "sources", label: t("sourceTab"), count: safeArray(state.sources).length },
        { id: "numbers", label: t("numberTab"), count: safeArray(state.numbers).length },
        { id: "runs", label: t("runTab"), count: safeArray(state.runs).length },
        { id: "evidence", label: t("evidenceTab"), count: safeArray(state.evidence).length },
        { id: "figures", label: t("figures"), count: safeArray(state.figures).length },
        { id: "artifacts", label: t("artifacts"), count: safeArray(state.artifacts).length },
      ]

      let columns = []
      let rows = []
      if (tab === "claims") {
        columns = [{ label: "ID", width: 66, mono: true }, { label: t("claims") }, { label: t("stage") }, { label: t("evidence"), width: 60 }, { label: lang === "en" ? "Confidence" : "置信度", width: 70 }]
        rows = safeArray(state.claims).map((claim) => [
          claim.id,
          h("div", { className: "rsx-prewrap" }, claim.statement),
          h(Badge, { tone: claim.status === "supported" ? "ok" : claim.status === "contested" ? "warn" : claim.status === "refuted" ? "bad" : "muted" }, claim.status),
          evidenceCount(claim.id),
          claim.confidence === null || claim.confidence === undefined ? "—" : fmtNum(claim.confidence),
        ])
      } else if (tab === "sources") {
        columns = [{ label: "ID", width: 66, mono: true }, { label: lang === "en" ? "Title" : "标题" }, { label: lang === "en" ? "Year" : "年份", width: 56 }, { label: lang === "en" ? "Reliability" : "可信度", width: 86 }, { label: lang === "en" ? "Kind" : "类型", width: 80 }, { label: "Hash", width: 130, mono: true }]
        rows = safeArray(state.sources).map((source) => [
          source.id,
          h("div", null, h("div", { className: "rsx-trunc", title: source.title }, source.title), source.url ? h("div", { className: "rsx-mono", style: { color: "var(--rsx-muted)" } }, source.url) : null),
          source.year || "—",
          h(Badge, { tone: source.reliability === "primary" ? "ok" : source.reliability === "tertiary" ? "muted" : "accent" }, source.reliability),
          source.kind,
          source.contentHash ? shortHash(source.contentHash) : "—",
        ])
      } else if (tab === "numbers") {
        columns = [{ label: "ID", width: 66, mono: true }, { label: lang === "en" ? "Name" : "名称" }, { label: lang === "en" ? "Value" : "值", width: 120 }, { label: lang === "en" ? "Uncertainty" : "不确定性", width: 150 }, { label: "Trace", width: 200, mono: true }]
        rows = safeArray(state.numbers).map((number) => [
          number.id,
          number.name,
          h("strong", null, fmtNum(number.value) + (number.unit ? " " + number.unit : "")),
          number.uncertainty || "—",
          h("div", { className: "rsx-mono" }, number.trace),
        ])
      } else if (tab === "runs") {
        columns = [{ label: "ID", width: 112, mono: true }, { label: lang === "en" ? "Status" : "状态", width: 80 }, { label: lang === "en" ? "Seed" : "种子", width: 56 }, { label: lang === "en" ? "Control" : "对照", width: 70 }, { label: lang === "en" ? "Metrics" : "指标" }, { label: lang === "en" ? "Command" : "命令", width: 220, mono: true }]
        rows = safeArray(state.runs).map((run) => [
          run.id,
          h(Badge, { tone: run.status === "success" ? "ok" : run.status === "failed" ? "bad" : "muted" }, run.status),
          run.seed === null ? "—" : run.seed,
          run.control || "—",
          h("div", { className: "rsx-mono rsx-prewrap" }, JSON.stringify(run.metrics || {})),
          h("div", { className: "rsx-trunc rsx-mono" }, run.command || "—"),
        ])
      } else if (tab === "evidence") {
        columns = [{ label: "ID", width: 60, mono: true }, { label: t("claims"), width: 80, mono: true }, { label: lang === "en" ? "Relation" : "关系", width: 78 }, { label: "Ref", width: 130, mono: true }, { label: lang === "en" ? "Quote" : "摘录" }]
        rows = safeArray(state.evidence).map((item) => [
          item.id,
          item.claim,
          h(Badge, { tone: item.relation === "supports" ? "ok" : item.relation === "refutes" ? "bad" : "muted" }, item.relation),
          item.ref,
          h("div", { className: "rsx-prewrap" }, item.quote || item.locator || "—"),
        ])
      } else if (tab === "figures") {
        columns = [{ label: "ID", width: 60, mono: true }, { label: lang === "en" ? "Title" : "标题" }, { label: lang === "en" ? "Provenance" : "溯源", width: 190 }, { label: lang === "en" ? "Caption" : "说明" }]
        rows = safeArray(state.figures).map((figure) => [
          figure.id,
          figure.title,
          h("div", { className: "rsx-mono", style: { fontSize: 10 } }, `art ${shortHash(figure.artifact)}` + (figure.codeArtifact ? " · code" : "") + (figure.dataArtifact ? " · data" : "") + (figure.run ? " · run" : "")),
          h("div", { className: "rsx-prewrap" }, figure.caption || "—"),
        ])
      } else {
        columns = [{ label: "ID", width: 130, mono: true }, { label: lang === "en" ? "Role" : "角色", width: 92 }, { label: lang === "en" ? "Label" : "标签" }, { label: lang === "en" ? "Bytes" : "字节", width: 80 }, { label: lang === "en" ? "Description" : "说明" }]
        rows = safeArray(state.artifacts).map((artifact) => [
          artifact.id,
          h(Badge, { tone: artifact.role === "dataset" || artifact.role === "code" ? "accent" : "muted" }, artifact.role || "file"),
          artifact.label || "—",
          artifact.bytes === undefined ? "—" : fmtNum(artifact.bytes),
          h("div", { className: "rsx-prewrap" }, artifact.description || "—"),
        ])
      }

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 11 } },
        h(
          "div",
          { className: "rsx-nav", style: { padding: 0, borderBottom: "1px solid var(--rsx-line)", background: "transparent" } },
          tabs.map((item) =>
            h(
              "button",
              { key: item.id, type: "button", className: "rsx-tab", "aria-selected": tab === item.id ? "true" : "false", onClick: () => setTab(item.id) },
              item.label,
              h("span", { className: "rsx-count" }, item.count),
            ),
          ),
        ),
        a11yTable(columns, rows, t("emptyLedger")),
      )
    }

    function a11yTable(columns, rows, empty) {
      return h(DataTable, { columns: columns, rows: rows, empty: empty })
    }

    function downloadFile(name, text, type) {
      try {
        const blob = new Blob([String(text || "")], { type: (type || "text/plain") + ";charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = name
        document.body.appendChild(anchor)
        anchor.click()
        document.body.removeChild(anchor)
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        return true
      } catch {
        return false
      }
    }

    function Audit(props) {
      const p = props || {}
      const t = p.t
      const lang = p.lang
      const detail = p.detail
      const state = detail && detail.state ? detail.state : null
      const campaignId = state ? state.id : ""
      const [data, setData] = useState(null)
      const [loading, setLoading] = useState(false)
      const [running, setRunning] = useState(false)
      const [error, setError] = useState("")

      const load = useCallback(() => {
        if (!campaignId) return
        setLoading(true)
        setError("")
        apiGet("/api/audit/" + campaignId)
          .then((payload) => setData(payload))
          .catch((err) => setError(err.message || String(err)))
          .finally(() => setLoading(false))
      }, [campaignId])

      useEffect(() => {
        load()
      }, [load])

      if (!state) return h("div", { className: "rsx-loading" }, t("loading"))

      const run = () => {
        setRunning(true)
        setError("")
        apiPost("/api/audit/" + campaignId, {})
          .then((payload) => {
            setData({ audit: payload.audit, fresh: true, matrix: payload.matrix })
            p.onRefresh && p.onRefresh()
          })
          .catch((err) => setError(err.message || String(err)))
          .finally(() => setRunning(false))
      }

      const downloadBib = () => {
        apiGet("/api/bibtex/" + campaignId)
          .then((payload) => {
            if (downloadFile(campaignId + "-references.bib", payload.bibtex, "application/x-bibtex")) p.onNotify && p.onNotify(t("bibtexDone"))
          })
          .catch((err) => setError(err.message || String(err)))
      }

      const audit = data && data.audit ? data.audit : null
      const fresh = data && data.fresh === true
      const matrix = data && data.matrix ? data.matrix : null
      const counts = (audit && audit.counts) || {}
      const findings = audit && Array.isArray(audit.findings) ? audit.findings : []
      const severityTone = { blocking: "bad", major: "warn", minor: "accent", info: "muted" }

      const findingColumns = [
        { label: lang === "en" ? "Severity" : "级别", width: 78 },
        { label: "Code", width: 190, mono: true },
        { label: lang === "en" ? "Issue" : "问题" },
        { label: lang === "en" ? "Detail" : "详情" },
        { label: "Ref", width: 80, mono: true },
      ]
      const findingRows = findings.map((item) => [
        h(Badge, { tone: severityTone[item.severity] || "muted" }, item.severity),
        item.code,
        item.title,
        h("div", { className: "rsx-prewrap" }, item.detail || "—"),
        item.ref || "—",
      ])

      const matrixColumns = matrix && matrix.dimensions && matrix.dimensions.length
        ? [
            { label: lang === "en" ? "Source" : "来源" },
            { label: lang === "en" ? "Year" : "年份", width: 56 },
            ...matrix.dimensions.map((dimension) => ({ label: dimension })),
          ]
        : []
      const matrixRows = matrix && matrix.rows
        ? matrix.rows.map((row) => [
            h("div", null, h("span", { className: "rsx-mono" }, row.source), " ", row.title),
            row.year || "—",
            ...matrix.dimensions.map((dimension) => {
              const cells = safeArray(row.cells && row.cells[dimension])
              const text = cells.map((cell) => cell.value).filter(Boolean).join("; ")
              return text || "—"
            }),
          ])
        : []

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 12 } },
        h(
          "div",
          { className: "rsx-row", style: { flexWrap: "wrap" } },
          h("button", { type: "button", className: "rsx-btn primary", onClick: run, disabled: running || loading }, h(Icon, { name: "shield", size: 13 }), running ? t("auditRunning") : t("auditRun")),
          h("button", { type: "button", className: "rsx-btn", onClick: load, disabled: loading }, h(Icon, { name: "refresh", size: 13 }), t("refresh")),
          h("button", { type: "button", className: "rsx-btn", onClick: downloadBib }, h(Icon, { name: "download", size: 13 }), t("downloadBibtex")),
          h("div", { className: "rsx-top-spacer" }),
          audit
            ? h(Badge, { tone: fresh ? "ok" : "warn", dot: true }, fresh ? t("auditFresh") : t("auditStale"))
            : h(Badge, { tone: "muted" }, t("auditNone")),
        ),
        error ? h("div", { className: "rsx-error" }, h("span", null, error), h("button", { type: "button", className: "rsx-btn ghost", onClick: load }, t("retry"))) : null,
        audit
          ? h(
              "div",
              { className: "rsx-kpis" },
              h("div", { className: "rsx-kpi" }, h("b", null, audit.verdict || "—"), h("span", null, t("auditVerdict"))),
              h("div", { className: "rsx-kpi" }, h("b", null, counts.blocking || 0), h("span", null, t("auditBlocking"))),
              h("div", { className: "rsx-kpi" }, h("b", null, counts.major || 0), h("span", null, t("auditMajor"))),
              h("div", { className: "rsx-kpi" }, h("b", null, counts.minor || 0), h("span", null, t("auditMinor"))),
            )
          : null,
        h(Card, { title: t("auditFindings") }, audit
          ? h(DataTable, { columns: findingColumns, rows: findingRows, empty: lang === "en" ? "No findings." : "没有发现问题。" })
          : h("div", { className: "rsx-empty" }, h("p", null, loading ? t("loading") : t("auditNone")))),
        h(Card, { title: t("auditMatrix") }, matrixColumns.length
          ? h(DataTable, { columns: matrixColumns, rows: matrixRows, empty: t("matrixEmpty") })
          : h("div", { className: "rsx-empty" }, h("p", null, t("matrixEmpty")))),
      )
    }

    function Templates(props) {
      const p = props || {}
      const t = p.t
      const lang = p.lang
      const templates = safeArray(p.templates)
      const [filter, setFilter] = useState("all")
      const filtered = templates.filter((item) => filter === "all" || item.kind === filter)
      const filters = [
        { id: "all", label: t("all") },
        { id: "task", label: t("task") },
        { id: "method", label: t("method") },
      ]
      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 12 } },
        h(
          "div",
          { className: "rsx-row", style: { justifyContent: "space-between" } },
          h(
            "div",
            { className: "rsx-row" },
            filters.map((item) =>
              h("button", { key: item.id, type: "button", className: "rsx-btn" + (filter === item.id ? " primary" : ""), onClick: () => setFilter(item.id) }, item.label),
            ),
          ),
          h("span", { className: "rsx-note" }, templates.length + " templates"),
        ),
        h(
          "div",
          { className: "rsx-tpl-grid" },
          filtered.map((template) =>
            h(
              "article",
              { key: template.id, className: "rsx-tpl" },
              h(
                "div",
                { className: "rsx-tpl-title" },
                template.title[lang === "en" ? "en" : "zh"],
                h(Badge, { tone: template.kind === "method" ? "warn" : "accent" }, template.kind),
                h("span", { className: "rsx-top-spacer" }),
                h(Badge, { tone: "muted" }, template.tier),
              ),
              h("div", { className: "rsx-tpl-sum" }, template.summary[lang === "en" ? "en" : "zh"]),
              h(
                "div",
                { className: "rsx-chips" },
                safeArray(template.deliverables).slice(0, 4).map((item, index) => h("span", { key: index, className: "rsx-chip" }, item)),
              ),
              h(
                "div",
                { className: "rsx-tpl-foot" },
                h("span", { className: "rsx-note rsx-mono" }, template.id),
                h("button", { type: "button", className: "rsx-btn primary", onClick: () => p.onApply(template) }, h(Icon, { name: "plus", size: 12 }), t("apply")),
              ),
            ),
          ),
        ),
      )
    }

    function Report(props) {
      const p = props || {}
      const t = p.t
      const lang = p.lang
      const detail = p.detail
      const state = detail && detail.state ? detail.state : null
      const [markdown, setMarkdown] = useState("")
      const [loading, setLoading] = useState(false)
      const [error, setError] = useState("")
      const [showDeclaration, setShowDeclaration] = useState(false)
      const [reviewer, setReviewer] = useState("")
      const [model, setModel] = useState("DeepSeek Harness · dsh-research-suite")
      const [saving, setSaving] = useState(false)

      const load = useCallback(() => {
        if (!state) return
        setLoading(true)
        setError("")
        apiGet("/api/report/" + state.id)
          .then((payload) => setMarkdown(payload.markdown || ""))
          .catch((err) => setError(err.message || String(err)))
          .finally(() => setLoading(false))
      }, [state && state.id])

      useEffect(() => {
        load()
      }, [load])

      if (!state) return h("div", { className: "rsx-loading" }, t("loading"))

      const download = () => {
        try {
          const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement("a")
          anchor.href = url
          anchor.download = `${state.id}-REPORT.md`
          document.body.appendChild(anchor)
          anchor.click()
          document.body.removeChild(anchor)
          setTimeout(() => URL.revokeObjectURL(url), 2000)
        } catch (err) {
          setError(err.message || String(err))
        }
      }

      const saveDeclaration = () => {
        setSaving(true)
        apiPost("/api/declaration/" + state.id, { model: model, humanReviewer: reviewer })
          .then(() => {
            setShowDeclaration(false)
            p.onRefresh && p.onRefresh()
            load()
          })
          .catch((err) => setError(err.message || String(err)))
          .finally(() => setSaving(false))
      }

      const declaration = state.declaration
      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 10 } },
        h(
          "div",
          { className: "rsx-row" },
          h("button", { type: "button", className: "rsx-btn", onClick: load, disabled: loading }, h(Icon, { name: "refresh", size: 13 }), loading ? t("generating") : t("refresh")),
          h("button", { type: "button", className: "rsx-btn", onClick: download, disabled: !markdown }, h(Icon, { name: "download", size: 13 }), t("download")),
          h("button", { type: "button", className: "rsx-btn", onClick: () => p.onExport(state.id) }, h(Icon, { name: "archive", size: 13 }), t("export")),
          h("button", { type: "button", className: "rsx-btn", onClick: () => setShowDeclaration(true) }, h(Icon, { name: "shield", size: 13 }), t("declaration")),
          h("div", { className: "rsx-top-spacer" }),
          declaration
            ? h(Badge, { tone: declaration.ai && declaration.watermark ? "ok" : "warn", dot: true }, `${declaration.model || "AI"}${declaration.humanReviewer ? " · " + declaration.humanReviewer : ""}`)
            : h(Badge, { tone: "muted" }, lang === "en" ? "no declaration" : "未声明"),
        ),
        h("p", { className: "rsx-note" }, t("reportHint")),
        error ? h("div", { className: "rsx-error" }, h("span", null, error), h("button", { type: "button", className: "rsx-btn ghost", onClick: load }, t("retry"))) : null,
        markdown
          ? h("pre", { className: "rsx-md" }, markdown)
          : h("div", { className: "rsx-empty" }, h("p", null, loading ? t("generating") : t("markdownEmpty"))),
        showDeclaration
          ? h(
              Modal,
              {
                title: t("declaration"),
                onClose: () => setShowDeclaration(false),
                footer: h(
                  "div",
                  { className: "rsx-row" },
                  h("button", { type: "button", className: "rsx-btn ghost", onClick: () => setShowDeclaration(false) }, t("cancel")),
                  h("button", { type: "button", className: "rsx-btn primary", onClick: saveDeclaration, disabled: saving || !reviewer.trim() }, saving ? t("saving") : t("save")),
                ),
              },
              h(Field, { label: t("model") }, h("input", { className: "rsx-input", value: model, onChange: (event) => setModel(event.target.value) })),
              h(Field, { label: t("reviewer") }, h("input", { className: "rsx-input", value: reviewer, placeholder: "YG", onChange: (event) => setReviewer(event.target.value) })),
              h("p", { className: "rsx-note" }, lang === "en" ? "Records AI involvement + watermark; the release gate requires both plus a named human reviewer." : "记录 AI 参与与水印；发布闸门要求两者齐全，并署名人工复核人。"),
            )
          : null,
      )
    }

    function DomainView(props) {
      const p = props || {}
      const t = p.t
      const lang = p.lang
      const detail = p.detail
      const state = detail && detail.state ? detail.state : null
      const info = p.domainInfo || {}
      const profile = info.domain || null
      const completeness = info.completeness || { required: 0, filled: 0, missing: 0, missingFields: [] }
      const monitoring = state && state.monitoring ? state.monitoring : {}
      const [status, setStatus] = useState(monitoring.status || "planned")
      const [plan, setPlan] = useState(monitoring.plan || "")
      const [owner, setOwner] = useState(monitoring.owner || "")
      const [cadence, setCadence] = useState(monitoring.cadence || "")
      const [signals, setSignals] = useState(safeArray(monitoring.signals).join(", "))

      useEffect(() => {
        setStatus(monitoring.status || "planned")
        setPlan(monitoring.plan || "")
        setOwner(monitoring.owner || "")
        setCadence(monitoring.cadence || "")
        setSignals(safeArray(monitoring.signals).join(", "))
      }, [state && state.id, monitoring.updatedAt])

      if (!state) return h("div", { className: "rsx-loading" }, t("loading"))

      const selected = state.domain || "general"
      const reviews = safeArray(state.reviews)
      const roles = safeArray(profile && profile.reviewRoles)
      const missing = safeArray(completeness.missingFields)
      const percent = completeness.required ? Math.round((completeness.filled / completeness.required) * 100) : 100

      const save = () => {
        p.onSaveMonitoring({
          status: status,
          plan: plan,
          owner: owner,
          cadence: cadence,
          signals: signals.split(/[,，\n]+/u).map((item) => item.trim()).filter(Boolean),
        })
      }

      const options = [
        { id: "general", label: t("domainGeneral") },
      ].concat(safeArray(p.domains).map((item) => ({ id: item.id, label: item.title[lang === "en" ? "en" : "zh"] })))

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 14 } },
        h(
          "div",
          { className: "rsx-card" },
          h(
            "div",
            { className: "rsx-card-body", style: { display: "flex", flexDirection: "column", gap: 12 } },
            h(
              "div",
              { className: "rsx-row", style: { alignItems: "flex-start" } },
              h(
                "div",
                { style: { flex: 1, minWidth: 0 } },
                h("h2", { className: "rsx-h1" }, profile ? profile.title[lang === "en" ? "en" : "zh"] : t("domain")),
                h("p", { className: "rsx-sub" }, profile ? profile.summary[lang === "en" ? "en" : "zh"] : t("domainNoProfile")),
              ),
              h(
                "select",
                { className: "rsx-select", value: selected, disabled: p.busy, "aria-label": t("domainSelect"), onChange: (event) => p.onSetDomain(event.target.value) },
                options.map((item) => h("option", { key: item.id, value: item.id }, item.label)),
              ),
            ),
            h("p", { className: "rsx-note" }, t("domainHint")),
            h(
              "div",
              { className: "rsx-row" },
              h("span", { className: "rsx-note" }, t("domainCompleteness")),
              h("b", null, `${completeness.filled}/${completeness.required}`),
              h("div", { style: { flex: 1, height: 8, background: "var(--rsx-sunken)", borderRadius: 99, overflow: "hidden" } },
                h("div", { style: { width: `${percent}%`, height: "100%", background: percent === 100 ? "var(--rsx-ok)" : "var(--rsx-ochre)" } }),
              ),
              h(Badge, { tone: completeness.missing ? "warn" : "ok", dot: true }, `${percent}%`),
            ),
          ),
        ),
        profile
          ? h(
              "div",
              { className: "rsx-grid" },
              h(
                Card,
                { title: t("domainStandards") },
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: 7 } },
                  safeArray(profile.standards).map((item) =>
                    h(
                      "a",
                      { key: item.id, href: item.url, target: "_blank", rel: "noreferrer", className: "rsx-note" },
                      `${item.title} · ${item.kind}`,
                    ),
                  ),
                ),
              ),
              h(
                Card,
                { title: t("domainRoles") },
                h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: 8 } },
                  roles.length
                    ? roles.map((role) => {
                        const met = reviews.some((review) => review.role === role.id)
                        return h(
                          "div",
                          { key: role.id, className: "rsx-row" },
                          h("span", null, role.label[lang === "en" ? "en" : "zh"]),
                          h(Badge, { tone: met ? "ok" : "warn", dot: true }, met ? t("domainRoleMet") : t("domainRoleMissing")),
                        )
                      })
                    : h("p", { className: "rsx-note" }, t("unknown")),
                ),
              ),
            )
          : null,
        profile && missing.length
          ? h(
              Card,
              { title: `${t("domainMissing")} · ${missing.length}` },
              h(
                "div",
                { className: "rsx-table-wrap" },
                h(
                  "table",
                  { className: "rsx-table" },
                  h("thead", null, h("tr", null, h("th", null, t("stage")), h("th", null, "ID"), h("th", null, lang === "en" ? "Issue" : "问题"))),
                  h(
                    "tbody",
                    null,
                    missing.slice(0, 30).map((item) =>
                      h("tr", { key: item.id }, h("td", null, stageLabel(item.stage, lang)), h("td", { className: "rsx-mono" }, item.id), h("td", null, item.problem)),
                    ),
                  ),
                ),
              ),
            )
          : null,
        h(
          Card,
          { title: t("monitoring") },
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: 10 } },
            h("p", { className: "rsx-note" }, t("monitorHint")),
            h(
              "div",
              { className: "rsx-row" },
              h(Field, { label: t("monitorStatus") },
                h(
                  "select",
                  { className: "rsx-input", value: status, onChange: (event) => setStatus(event.target.value) },
                  ["none", "planned", "active", "paused", "closed"].map((item) => h("option", { key: item, value: item }, item)),
                ),
              ),
              h(Field, { label: t("monitorOwner") }, h("input", { className: "rsx-input", value: owner, onChange: (event) => setOwner(event.target.value) })),
              h(Field, { label: t("monitorCadence") }, h("input", { className: "rsx-input", value: cadence, onChange: (event) => setCadence(event.target.value) })),
            ),
            h(Field, { label: t("monitorPlan") }, h("textarea", { className: "rsx-textarea", value: plan, onChange: (event) => setPlan(event.target.value) })),
            h(Field, { label: t("monitorSignals") }, h("input", { className: "rsx-input", value: signals, onChange: (event) => setSignals(event.target.value) })),
            h(
              "div",
              { className: "rsx-row" },
              h("div", { className: "rsx-top-spacer" }),
              h("button", { type: "button", className: "rsx-btn primary", onClick: save, disabled: p.busy }, p.busy ? t("saving") : t("save")),
            ),
          ),
        ),
      )
    }

    function SettingsForm(props) {
      const p = props || {}
      const t = p.t
      const lang = p.lang
      const data = p.data || {}
      const settings = data.settings || {}
      const defaults = data.defaults || {}
      const [tier, setTier] = useState(settings.defaultTier || defaults.tier || "M")
      const [language, setLanguage] = useState(settings.language || lang)
      const [allowExec, setAllowExec] = useState(settings.allowExec === true)
      const [saving, setSaving] = useState(false)
      const [integrity, setIntegrity] = useState(null)
      const [error, setError] = useState("")

      const save = () => {
        setSaving(true)
        setError("")
        apiPost("/api/settings", { patch: { defaultTier: tier, language: language, allowExec: allowExec } })
          .then(() => p.onSaved && p.onSaved())
          .catch((err) => setError(err.message || String(err)))
          .finally(() => setSaving(false))
      }

      const check = () => {
        const id = data.current || (safeArray(data.campaigns)[0] || {}).id
        if (!id) return
        apiGet("/api/integrity/" + id)
          .then((payload) => setIntegrity(payload.integrity))
          .catch((err) => setError(err.message || String(err)))
      }

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 11 } },
        h(Field, { label: t("tier") + " · " + t("tierHint") },
          h("select", { className: "rsx-input", value: tier, onChange: (event) => setTier(event.target.value) },
            ["S", "M", "L", "XL"].map((item) => h("option", { key: item, value: item }, item)),
          ),
        ),
        h(Field, { label: t("language") },
          h("select", { className: "rsx-input", value: language, onChange: (event) => setLanguage(event.target.value) },
            h("option", { value: "zh" }, "中文"),
            h("option", { value: "en" }, "English"),
          ),
        ),
        h("label", { className: "rsx-row", style: { gap: 7, fontSize: 12 } },
          h("input", { type: "checkbox", checked: allowExec, onChange: (event) => setAllowExec(event.target.checked) }),
          lang === "en" ? "Allow rsx_run to execute commands (off by default)" : "允许 rsx_run 直接执行命令（默认关闭）",
        ),
        h(Field, { label: t("dataDir") }, h("div", { className: "rsx-mono", style: { wordBreak: "break-all" } }, data.dataDir || "—")),
        h(
          "div",
          { className: "rsx-row" },
          h("button", { type: "button", className: "rsx-btn", onClick: check }, h(Icon, { name: "shield", size: 13 }), t("checkIntegrity")),
          integrity
            ? h(Badge, { tone: integrity.chainOk ? "ok" : "bad", dot: true }, integrity.chainOk ? `${t("chainOk")} · ${integrity.events}` : `${t("chainBroken")} @ ${integrity.brokenSeq}`)
            : null,
        ),
        error ? h("div", { className: "rsx-error" }, h("span", null, error)) : null,
        h(
          "div",
          { className: "rsx-row", style: { justifyContent: "flex-end" } },
          h("button", { type: "button", className: "rsx-btn ghost", onClick: p.onClose }, t("cancel")),
          h("button", { type: "button", className: "rsx-btn primary", onClick: save, disabled: saving }, saving ? t("saving") : t("save")),
        ),
      )
    }
