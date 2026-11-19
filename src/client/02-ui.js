/**
 * dsh-research-suite — 02-ui
 *
 * Framework-free presentation primitives (React.createElement only).
 */

    const ICON_PATHS = {
      doc: "M6 3h8l4 4v14H6z M14 3v4h4",
      flask: "M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3 M7.5 15h9",
      list: "M8 6h12 M8 12h12 M8 18h12 M3.5 6h.01 M3.5 12h.01 M3.5 18h.01",
      template: "M4 4h16v16H4z M4 9h16 M9 9v11",
      chart: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
      settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1L15 3h-4l-.9 2.6a7 7 0 0 0-1.7 1l-2.3-1-2 3.4L6.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1L11 21h4l.9-2.6a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z",
      plus: "M12 5v14 M5 12h14",
      refresh: "M20 11a8 8 0 1 0-2.3 6.3 M20 5v6h-6",
      download: "M12 3v12 M7 10l5 5 5-5 M4 21h16",
      copy: "M9 9h11v12H9z M5 15H3V3h12v2",
      check: "M4 12.5l5 5L20 6.5",
      x: "M6 6l12 12 M18 6L6 18",
      arrow: "M5 12h14 M13 6l6 6-6 6",
      archive: "M3 4h18v4H3z M5 8v12h14V8 M9 12h6",
      gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
      shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
      book: "M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2z M6 3v16",
      spark: "M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z",
      external: "M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6",
      alert: "M12 3l9 17H3z M12 9v5 M12 17h.01",
    }

    function Icon(props) {
      const p = props || {}
      const name = p.name || "doc"
      const size = p.size || 15
      const path = ICON_PATHS[name] || ICON_PATHS.doc
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.7,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
          style: { flex: "none", display: "block" },
        },
        h("path", { d: path }),
      )
    }

    function Mark(props) {
      const size = (props && props.size) || 20
      return h(
        "svg",
        { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
        h("path", { d: "M5 4h11a2 2 0 0 1 2 2v13a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1Z" }),
        h("path", { d: "M5 4v14a2 2 0 0 0 2 2" }),
        h("path", { d: "M8.5 8.5h6M8.5 11.5h6M8.5 14.5h4" }),
        h("circle", { cx: 18.5, cy: 6.5, r: 3.2, fill: "currentColor", stroke: "none", opacity: 0.9 }),
      )
    }

    function Badge(props) {
      const p = props || {}
      const tone = p.tone || "muted"
      return h("span", { className: "rsx-badge " + tone }, p.dot ? h("span", { className: "rsx-dot" }) : null, p.children)
    }

    function Card(props) {
      const p = props || {}
      return h(
        "section",
        { className: "rsx-card" + (p.className ? " " + p.className : "") },
        p.title || p.right
          ? h(
              "div",
              { className: "rsx-card-head" },
              h("div", { className: "rsx-card-title" }, p.title || ""),
              h("div", { className: "rsx-top-spacer" }),
              p.right || null,
            )
          : null,
        h("div", { className: p.flush ? "" : "rsx-card-body" }, p.children),
      )
    }

    function Empty(props) {
      const p = props || {}
      return h(
        "div",
        { className: "rsx-empty" },
        h("div", { style: { width: 44, height: 44, borderRadius: 12, background: "var(--rsx-sunken)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--rsx-accent)" } }, h(Icon, { name: p.icon || "flask", size: 22 })),
        h("h3", null, p.title || ""),
        p.body ? h("p", null, p.body) : null,
        p.action || null,
      )
    }

    function DataTable(props) {
      const p = props || {}
      const columns = safeArray(p.columns)
      const rows = safeArray(p.rows)
      if (rows.length === 0) {
        return h("div", { className: "rsx-empty", style: { padding: "26px 16px" } }, h("p", null, p.empty || "—"))
      }
      return h(
        "div",
        { className: "rsx-table-wrap" },
        h(
          "table",
          { className: "rsx-table" },
          h("thead", null, h("tr", null, columns.map((col, index) => h("th", { key: index, style: col.width ? { width: col.width } : undefined }, col.label)))),
          h(
            "tbody",
            null,
            rows.map((row, rowIndex) =>
              h(
                "tr",
                { key: rowIndex },
                safeArray(row).map((cell, cellIndex) =>
                  h("td", { key: cellIndex, className: columns[cellIndex] && columns[cellIndex].mono ? "rsx-mono" : undefined }, cell === null || cell === undefined || cell === "" ? "—" : cell),
                ),
              ),
            ),
          ),
        ),
      )
    }

    function Stepper(props) {
      const p = props || {}
      const state = p.state || {}
      const gates = p.gates || {}
      const lang = p.lang
      const currentIndex = STAGES.findIndex((item) => item.id === state.stage)
      return h(
        "div",
        { className: "rsx-stepper", role: "list", "aria-label": "pipeline" },
        STAGES.map((stage, index) => {
          const tone = stageTone(stage.id, state, gates)
          const gate = gates[stage.id]
          return h(
            "div",
            { key: stage.id, className: "rsx-step " + tone, role: "listitem", title: gate ? (gate.ok ? "pass" : "blocked: " + safeArray(gate.blocking).join(", ")) : "not run" },
            h("div", { className: "rsx-step-dot" }, tone === "ok" ? h(Icon, { name: "check", size: 11 }) : index + 1),
            h("div", { className: "rsx-step-label" }, stageLabel(stage.id, lang)),
            index === currentIndex ? h("div", { style: { fontSize: 9, color: "var(--rsx-accent)", fontWeight: 700 } }, "▲") : null,
          )
        }),
      )
    }

    function GateChecks(props) {
      const p = props || {}
      const t = p.t
      const gate = p.gate
      if (!gate) {
        return h("div", { className: "rsx-empty", style: { padding: "22px 14px" } }, h("p", null, t("noGate")), h("p", { className: "rsx-note" }, t("gateAdvice")))
      }
      return h(
        "div",
        null,
        h(
          "div",
          { className: "rsx-row", style: { marginBottom: 6 } },
          h(Badge, { tone: gate.ok ? "ok" : "bad", dot: true }, gate.ok ? t("passed") : t("blocked")),
          h("span", { className: "rsx-note" }, `${gate.passed}/${gate.total}`),
          h("span", { className: "rsx-note" }, fmtTime(gate.ts, p.lang)),
        ),
        safeArray(gate.checks).map((check) =>
          h(
            "div",
            { key: check.code, className: "rsx-check" },
            h("span", { className: "rsx-check-ico " + (check.ok ? "ok" : "bad") }, h(Icon, { name: check.ok ? "check" : "x", size: 9 })),
            h(
              "div",
              { style: { minWidth: 0 } },
              h("code", null, check.code),
              check.detail ? h("div", { className: "rsx-check-detail" }, check.detail) : null,
            ),
          ),
        ),
      )
    }

    function BudgetBar(props) {
      const p = props || {}
      const budget = p.budget || {}
      const ratio = Math.max(0, Math.min(1, Number(budget.ratio) || 0))
      const tone = ratio >= 1 ? "bad" : ratio >= 0.8 ? "warn" : ""
      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 5 } },
        h(
          "div",
          { className: "rsx-row", style: { justifyContent: "space-between" } },
          h("span", { className: "rsx-note" }, `${budget.tier || "M"} · ${fmtNum(budget.tokensUsed)} / ${fmtNum(budget.tokensLimit)} tokens`),
          h("span", { className: "rsx-note" }, `${Math.round(ratio * 100)}%`),
        ),
        h("div", { className: "rsx-bar" }, h("div", { className: "rsx-bar-fill " + tone, style: { width: (ratio * 100 || 0.5) + "%" } })),
      )
    }

    function FlyAction(props) {
      const p = props || {}
      const disabled = Boolean(p.disabled)
      const hint = disabled && p.reason ? `${p.label}：${p.reason}` : p.label || ""
      return h(
        "button",
        {
          type: "button",
          className: "rsx-fly-action" + (p.tone ? " " + p.tone : "") + (disabled ? " is-disabled" : ""),
          disabled: disabled,
          "aria-disabled": disabled ? "true" : undefined,
          title: hint,
          "data-action": p.actionId || undefined,
          onClick: disabled ? undefined : p.onClick,
        },
        h(Icon, { name: p.icon, size: 13 }),
        h("span", null, p.label),
      )
    }

    function Flywheel(props) {
      const p = props || {}
      const t = p.t
      const lang = p.lang
      const state = p.state || {}
      const gate = p.gate || null
      const next = p.next || null
      const model = flywheelModel(state, gate)
      const [copied, setCopied] = useState("")
      const busy = p.busy === true
      const loop = state.loop || {}
      const pauses = safeArray(state.loopPauses)
      const openPause = [...pauses].reverse().find((item) => item && item.status === "open") || null
      const paused = loop.status === "paused" || Boolean(openPause)
      const actionAvailability = flywheelActionAvailability(state, gate, { paused: paused, busy: busy })
      const loopStatus = paused ? "paused" : String(loop.status || "idle")
      const loopLabels = {
        idle: t("loopIdle"),
        running: t("loopRunning"),
        paused: t("loopPaused"),
        ready: t("loopReady"),
        stopped: t("loopStopped"),
      }
      const loopLabel = loopLabels[loopStatus] || loopLabels.idle
      const loopTone = loopStatus === "paused" ? "warn" : loopStatus === "running" ? "accent" : loopStatus === "ready" ? "ok" : loopStatus === "stopped" ? "bad" : "muted"
      const pauseLabels = {
        human_checkpoint: t("pauseHuman"),
        needs_input: t("pauseInput"),
        unmapped_gate: t("pauseUnmapped"),
      }
      const pauseLabel = openPause ? pauseLabels[openPause.kind] || t("openPause") : t("pauseMissing")
      const pauseReason = openPause ? String(openPause.reason || openPause.detail || "").trim() : t("pauseMissing")
      const primary = next && next.primary ? next.primary : null
      const stop = next && next.stop ? next.stop : {}
      const ready = stop.ready === true
      const blocked = stop.blocked === true
      const currentStage = stageLabel(state.stage, lang)
      const currentGate = gate
        ? gate.ok
          ? lang === "en" ? "All gate checks pass." : "当前闸门全部通过。"
          : `${lang === "en" ? "Blocking" : "阻断项"}: ${safeArray(gate.blocking).join(", ") || "—"}`
        : t("noGate")
      const nextTitle = ready
        ? t("readyExport")
        : blocked
          ? String(stop.reason || t("noNext"))
          : primary
            ? `${primary.label || primary.tool || "—"}${primary.tool ? " · " + primary.tool : ""}`
            : t("noNext")
      const roundLabel = model.hasCycles ? t("roundN", { n: model.round }) : t("preflight")
      const metrics = [
        { value: model.gateTotal ? `${model.gatePassed}/${model.gateTotal}` : "—", label: t("gateProgress") },
        { value: fmtNum(safeArray(state.evidence).length), label: t("evidence") },
        { value: fmtNum(safeArray(state.sources).length), label: t("sources") },
        { value: fmtNum(state.seq || 0), label: t("events") },
      ]
      const copy = (value, key) => {
        void copyText(value).then((ok) => setCopied(ok ? key : ""))
      }
      const go = (view) => {
        if (typeof p.onView === "function") p.onView(view)
      }
      const execute = () => {
        if (typeof p.onPrompt === "function") p.onPrompt(campaignPrompt(state, lang))
      }
      const actionReason = (id) => {
        const info = actionAvailability[id]
        if (!info || !info.reason) return ""
        const labels = {
          paused: t("actionPaused"),
          archived: t("actionArchived"),
          release: t("actionNeedRelease"),
          write: t("actionNeedWrite"),
          busy: t("working"),
        }
        return labels[info.reason] || t("working")
      }
      const actionDefs = [
        { id: "export", label: t("export"), icon: "download", tone: "primary", onClick: () => p.onExport && p.onExport(state.id) },
        { id: "ledger", label: t("viewLedger"), icon: "list", onClick: () => go("ledger") },
        { id: "audit", label: t("viewAudit"), icon: "shield", onClick: () => go("audit") },
        { id: "report", label: t("viewReport"), icon: "doc", onClick: () => go("report") },
        { id: "archive", label: t("archive"), icon: "archive", onClick: () => p.onArchive && p.onArchive(state.id) },
      ].map((action) => {
        const info = actionAvailability[action.id] || { enabled: false, reason: null }
        return { ...action, disabled: !info.enabled, reason: actionReason(action.id) }
      })

      const cx = 170
      const cy = 170
      const radius = 126
      const labelRadius = 92
      const circumference = 2 * Math.PI * radius
      const arc = Math.max(0, Math.min(1, model.progress)) * circumference
      const nodes = model.nodes.map((node, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / model.total
        const x = cx + radius * Math.cos(angle)
        const y = cy + radius * Math.sin(angle)
        const lx = cx + labelRadius * Math.cos(angle)
        const ly = cy + labelRadius * Math.sin(angle)
        const label = stageLabel(node.id, lang)
        const fill =
          node.status === "done"
            ? "var(--rsx-ok)"
            : node.status === "blocked"
              ? "var(--rsx-bad)"
              : node.status === "current"
                ? "var(--rsx-accent)"
                : "var(--rsx-sunken)"
        const ink =
          node.status === "pending"
            ? "var(--rsx-muted)"
            : node.status === "current"
              ? "var(--rsx-surface)"
              : "#fff"
        return h(
          "g",
          { key: node.id, className: "rsx-fly-node " + node.status },
          h("title", null, `${label} · ${node.status}`),
          index === model.currentIndex
            ? h("circle", { cx: x, cy: y, r: 13, fill: "none", stroke: "var(--rsx-accent)", strokeWidth: 1, strokeDasharray: "2 3", opacity: 0.7 })
            : null,
          h("circle", {
            cx: x,
            cy: y,
            r: node.status === "current" ? 9.5 : 7.5,
            fill: fill,
            stroke: node.status === "current" ? "var(--rsx-surface)" : fill,
            strokeWidth: node.status === "current" ? 3 : 1,
          }),
          node.status === "done"
            ? h("path", {
                d: `M${x - 3.1} ${y} l2.2 2.2 4.3-4.3`,
                fill: "none",
                stroke: "#fff",
                strokeWidth: 1.8,
                strokeLinecap: "round",
                strokeLinejoin: "round",
              })
            : h(
                "text",
                {
                  x: x,
                  y: y + 3.2,
                  textAnchor: "middle",
                  style: { fill: ink, fontSize: 8, fontWeight: 700, fontFamily: "ui-sans-serif, system-ui, sans-serif" },
                },
                node.status === "blocked" ? "!" : String(index + 1),
              ),
          h(
            "text",
            {
              x: lx,
              y: ly + 3.2,
              textAnchor: "middle",
              className: "rsx-fly-label" + (index === model.currentIndex ? " current" : ""),
            },
            label,
          ),
        )
      })

      return h(
        "section",
        { className: "rsx-flywheel", "aria-label": t("flywheel") },
        h(
          "div",
          { className: "rsx-fly-visual" },
          h(
            "svg",
            { viewBox: "0 0 340 340", role: "img", "aria-label": `${t("flywheel")}: ${currentStage}, ${t("stageDone", { done: model.done, total: model.total })}` },
            h("circle", { cx: cx, cy: cy, r: 146, fill: "none", stroke: "var(--rsx-line)", strokeWidth: 1, opacity: 0.55 }),
            h("circle", { cx: cx, cy: cy, r: radius, fill: "none", stroke: "var(--rsx-line)", strokeWidth: 1.4, strokeDasharray: "3 7" }),
            h("circle", {
              cx: cx,
              cy: cy,
              r: radius,
              fill: "none",
              stroke: "var(--rsx-accent)",
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeDasharray: `${arc} ${circumference}`,
              transform: `rotate(-90 ${cx} ${cy})`,
              opacity: model.progress > 0 ? 1 : 0,
            }),
            nodes,
          ),
          h(
            "div",
            { className: "rsx-fly-center" },
            h("span", { className: "rsx-fly-round" }, roundLabel),
            h("b", null, currentStage),
            h("span", { className: "rsx-fly-done" }, `${model.done}/${model.total}`),
            h("span", { className: "rsx-fly-done-label" }, t("stageProgress")),
          ),
        ),
        h(
          "div",
          { className: "rsx-fly-main" },
          h(
            "div",
            { className: "rsx-row" },
            h("span", { className: "rsx-eyebrow" }, t("flywheel")),
            h("span", { className: "rsx-note" }, roundLabel),
            h("div", { className: "rsx-top-spacer" }),
            h(Badge, { tone: loopTone, dot: true }, loopLabel),
          ),
          h(
            "div",
            { className: "rsx-fly-headline" },
            h("div", null, h("span", { className: "rsx-fly-current" }, t("current") + " · " + currentStage), h("span", { className: "rsx-note" }, model.hasCycles ? t("stageDone", { done: model.done, total: model.total }) : t("flywheelHint"))),
            h("div", { className: "rsx-fly-gate-line" }, currentGate),
          ),
          paused
            ? h(
                "div",
                { className: "rsx-fly-pause" },
                h("div", { className: "rsx-fly-pause-ico" }, h(Icon, { name: "alert", size: 15 })),
                h(
                  "div",
                  { style: { minWidth: 0, flex: 1 } },
                  h(
                    "div",
                    { className: "rsx-row" },
                    h("b", null, pauseLabel),
                    h(Badge, { tone: "warn" }, openPause ? openPause.id : t("openPause")),
                    openPause && openPause.blocking && openPause.blocking.length ? h("span", { className: "rsx-note" }, safeArray(openPause.blocking).join(" · ")) : null,
                  ),
                  h("div", { className: "rsx-note", style: { marginTop: 3 } }, pauseReason),
                  h("div", { className: "rsx-note", style: { marginTop: 3, opacity: 0.85 } }, t("pauseHint")),
                ),
              )
            : null,
          h(
            "div",
            { className: "rsx-fly-kpis" },
            metrics.map((metric) =>
              h(
                "div",
                { key: metric.label, className: "rsx-fly-kpi" },
                h("b", null, metric.value),
                h("span", null, metric.label),
              ),
            ),
          ),
          h(
            "div",
            { className: "rsx-next-card" + (blocked ? " bad" : ready ? " ready" : "") },
            h(
              "div",
              { className: "rsx-row" },
              h("span", { className: "rsx-eyebrow" }, t("nextAction")),
              ready ? h(Badge, { tone: "ok" }, t("loopReady")) : blocked ? h(Badge, { tone: "bad" }, t("loopStopped")) : primary && primary.human ? h(Badge, { tone: "warn" }, t("humanCheckpoint")) : h(Badge, { tone: "accent" }, next && next.stage ? stageLabel(next.stage, lang) : currentStage),
              primary && primary.needsInput ? h(Badge, { tone: "warn" }, t("pauseInput")) : null,
              h("div", { className: "rsx-top-spacer" }),
              next && next.stage ? h("span", { className: "rsx-note" }, stageLabel(next.stage, lang)) : null,
            ),
            h("div", { className: "rsx-next-title" }, nextTitle),
            primary
              ? h(
                  "code",
                  { className: "rsx-next-code", title: JSON.stringify({ tool: primary.tool, arguments: primary.args }) },
                  JSON.stringify({ tool: primary.tool, arguments: primary.args }),
                )
              : null,
            !ready || primary
              ? h(
                  "div",
                  { className: "rsx-actions" },
                  !ready
                    ? h(
                        "button",
                        { type: "button", className: "rsx-btn primary", onClick: execute },
                        h(Icon, { name: "arrow", size: 13 }),
                        t("continue"),
                      )
                    : null,
                  primary
                    ? h(
                        "button",
                        { type: "button", className: "rsx-btn ghost", onClick: () => copy(JSON.stringify({ tool: primary.tool, arguments: primary.args }), "next") },
                        copied === "next" ? t("copied") : lang === "en" ? "Copy call" : "复制调用",
                      )
                    : null,
                )
              : null,
          ),
          h(
            "div",
            { className: "rsx-fly-actions-wrap" },
            h(
              "div",
              { className: "rsx-fly-actions-head" },
              h("span", { className: "rsx-eyebrow" }, t("actions")),
              h("span", { className: "rsx-action-hint" }, t("actionsHint")),
            ),
            h(
              "div",
              { className: "rsx-fly-actions", role: "group", "aria-label": t("actions") },
              actionDefs.map((action) => h(FlyAction, {
                key: action.id,
                actionId: action.id,
                label: action.label,
                icon: action.icon,
                tone: action.tone,
                disabled: action.disabled,
                reason: action.reason,
                onClick: action.onClick,
              })),
            ),
          ),
          h(
            "div",
            { className: "rsx-fly-foot" },
            h("span", { className: "rsx-note" }, `${state.id || ""} · ${fmtTime(state.updatedAt, lang)}`),
            h("div", { className: "rsx-top-spacer" }),
            state.archived ? h("span", { className: "rsx-note" }, t("actionArchived")) : null,
          ),
        ),
      )
    }

    function Modal(props) {
      const p = props || {}
      const boxRef = useRef(null)
      const closeRef = useRef(p.onClose)
      closeRef.current = p.onClose
      useEffect(() => {
        const previous = document.activeElement
        const node = boxRef.current
        const focusables = node ? node.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") : []
        if (focusables.length) focusables[0].focus()
        const onKey = (event) => {
          if (event.key === "Escape") {
            if (typeof closeRef.current === "function") closeRef.current()
            return
          }
          if (event.key !== "Tab" || !node || focusables.length === 0) return
          const first = focusables[0]
          const last = focusables[focusables.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
        window.addEventListener("keydown", onKey)
        return () => {
          window.removeEventListener("keydown", onKey)
          if (previous && typeof previous.focus === "function") previous.focus()
        }
      }, [])
      return h(
        "div",
        { className: "rsx-modal-ov", onMouseDown: (event) => { if (event.target === event.currentTarget && p.onClose) p.onClose() } },
        h(
          "div",
          { className: "rsx-modal" + (p.wide ? " wide" : ""), role: "dialog", "aria-modal": "true", "aria-label": p.title || "", ref: boxRef, tabIndex: -1 },
          h("div", { className: "rsx-modal-head" }, p.title || "", h("div", { className: "rsx-top-spacer" }), h("button", { type: "button", className: "rsx-icon-btn", onClick: p.onClose, "aria-label": "close" }, h(Icon, { name: "x", size: 13 }))),
          h("div", { className: "rsx-modal-body" }, p.children),
          p.footer ? h("div", { className: "rsx-modal-foot" }, p.footer) : null,
        ),
      )
    }

    function Toast(props) {
      const p = props || {}
      useEffect(() => {
        if (!p.message) return undefined
        const timer = setTimeout(() => p.onDone && p.onDone(), 3200)
        return () => clearTimeout(timer)
      }, [p.message, p.onDone])
      if (!p.message) return null
      return h("div", { className: "rsx-toast" + (p.tone === "bad" ? " bad" : ""), role: "status" }, p.message)
    }

    function Field(props) {
      const p = props || {}
      return h("div", { className: "rsx-field" }, p.label ? h("label", null, p.label) : null, p.children)
    }

    function LinkButton(props) {
      const p = props || {}
      return h("button", { type: "button", className: "rsx-link", onClick: p.onClick }, p.children)
    }
