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

    function Modal(props) {
      const p = props || {}
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === "Escape") p.onClose && p.onClose()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
      }, [p.onClose])
      return h(
        "div",
        { className: "rsx-modal-ov", onMouseDown: (event) => { if (event.target === event.currentTarget && p.onClose) p.onClose() } },
        h(
          "div",
          { className: "rsx-modal" + (p.wide ? " wide" : ""), role: "dialog", "aria-modal": "true", "aria-label": p.title || "" },
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
