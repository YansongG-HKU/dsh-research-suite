/**
 * dsh-research-suite — 03-views
 *
 * The four panel pages plus the settings form. Views receive plain data and
 * callbacks; they never mutate the ledger directly.
 */

    /**
     * Pre-flywheel overview, kept intact as the rollback path. Set the wrapper
     * below to `h(OverviewLinear, props)` to return to the linear stepper.
     */
    function OverviewLinear(props) {
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
            searches: safeArray(state.searchLog).length,
            sensitivities: safeArray(state.sensitivity).length,
            program:
              safeArray(state.plan && state.plan.questions).length +
              safeArray(state.perspectives).length +
              safeArray(state.cycles).length +
              safeArray(state.tournament && state.tournament.matches).length +
              safeArray(state.quality && state.quality.rows).length +
              safeArray(state.contradictions).length,
            claims: safeArray(state.claims).length,
            numbers: safeArray(state.numbers).length,
            runs: safeArray(state.runs).length,
          }
        : { sources: 0, searches: 0, sensitivities: 0, claims: 0, numbers: 0, runs: 0 }

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
                detail.next
                  ? h(
                      "div",
                      { className: "rsx-row", style: { gap: 10, alignItems: "flex-start", flexWrap: "wrap" } },
                      h(
                        "div",
                        { style: { flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 4 } },
                        h(
                          "div",
                          { className: "rsx-row", style: { gap: 8 } },
                          h("span", { className: "rsx-note" }, lang === "en" ? "Next action" : "下一步"),
                          detail.next.stop && detail.next.stop.blocked
                            ? h(Badge, { tone: "bad" }, lang === "en" ? "stop" : "停止")
                            : detail.next.stop && detail.next.stop.ready
                              ? h(Badge, { tone: "ok" }, lang === "en" ? "ready" : "可交付")
                              : h(Badge, { tone: "accent" }, detail.next.stage),
                          detail.next.primary && detail.next.primary.human
                            ? h(Badge, { tone: "warn" }, lang === "en" ? "human" : "人工")
                            : null,
                        ),
                        h(
                          "div",
                          { style: { fontSize: 13, fontWeight: 600 } },
                          detail.next.stop && detail.next.stop.blocked
                            ? detail.next.stop.reason
                            : detail.next.stop && detail.next.stop.ready
                              ? (lang === "en" ? "Export the package and hand it to the human reviewer." : "导出研究包，交给人类复核者。")
                              : detail.next.primary
                                ? `${detail.next.primary.label} · ${detail.next.primary.tool}`
                                : (lang === "en" ? "No recommendation for this state." : "当前状态没有可执行建议。"),
                        ),
                        detail.next.primary
                          ? h(
                              "code",
                              { className: "rsx-mono", style: { fontSize: 11, opacity: 0.72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" } },
                              JSON.stringify(detail.next.primary.args),
                            )
                          : null,
                      ),
                      detail.next.primary
                        ? h(
                            "button",
                            { type: "button", className: "rsx-btn ghost", onClick: () => copy(JSON.stringify({ tool: detail.next.primary.tool, arguments: detail.next.primary.args }), "next") },
                            copied === "next" ? t("copied") : (lang === "en" ? "Copy call" : "复制调用"),
                          )
                        : null,
                    )
                  : null,
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
                    h("div", { className: "rsx-kpi" }, h("b", null, counts.searches), h("span", null, t("searches"))),
                    h("div", { className: "rsx-kpi" }, h("b", null, counts.sensitivities), h("span", null, t("sensitivities"))),
                    h("div", { className: "rsx-kpi" }, h("b", null, counts.program), h("span", null, t("program"))),
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
              h(
                Card,
                { title: lang === "en" ? "Research loop" : "研究闭环" },
                (() => {
                  const loop = state.loopEvaluation || null
                  if (!loop) {
                    return h(
                      "div",
                      { style: { display: "flex", flexDirection: "column", gap: 9 } },
                      h("p", { className: "rsx-note" }, lang === "en" ? "Not evaluated yet. Score the 13 engineering dimensions and persist a baseline." : "尚未评估。计算 13 个工程维度并写入基线。"),
                      h("button", { type: "button", className: "rsx-btn primary", onClick: () => p.onEvaluate(state.id) }, lang === "en" ? "Evaluate loop" : "运行闭环评估"),
                    )
                  }
                  const gaps = safeArray(loop.gaps).slice(0, 3)
                  return h(
                    "div",
                    { style: { display: "flex", flexDirection: "column", gap: 9 } },
                    h(
                      "div",
                      { className: "rsx-row" },
                      h("b", { style: { fontSize: 24 } }, `${loop.score}/100`),
                      h(Badge, { tone: loop.score >= 85 ? "ok" : loop.score >= 65 ? "warn" : "bad" }, loop.grade),
                      h("span", { className: "rsx-note" }, loop.level),
                      h("div", { className: "rsx-top-spacer" }),
                      loop.delta === null || loop.delta === undefined ? null : h(Badge, { tone: loop.delta >= 0 ? "ok" : "bad" }, `${loop.delta >= 0 ? "+" : ""}${loop.delta}`),
                    ),
                    h("div", { className: "rsx-note" }, loop.rsi && loop.rsi.ready ? (lang === "en" ? "RSI prerequisites met — compare the next candidate against this baseline." : "已具备自我改进前提；下一次候选改动与基线比较。") : (lang === "en" ? "Next: " + (safeArray(loop.nextActions)[0] ? safeArray(loop.nextActions)[0].action : "close the highest-weight gap") : "下一步：" + (safeArray(loop.nextActions)[0] ? safeArray(loop.nextActions)[0].action : "先补权重最高的缺口"))),
                    gaps.length
                      ? h("ul", { className: "rsx-note", style: { margin: 0, paddingLeft: 16 } }, gaps.map((gap) => h("li", { key: gap.dimension + gap.id }, gap.detail)))
                      : null,
                    h("button", { type: "button", className: "rsx-btn", onClick: () => p.onEvaluate(state.id) }, lang === "en" ? "Re-evaluate" : "重新评估"),
                  )
                })(),
              ),
            )
          : null,
      )
    }

    function IterationTrail(props) {
      const p = props || {}
      const t = p.t
      const lang = p.lang
      const cycles = safeArray(p.state && p.state.cycles)
      if (cycles.length === 0) {
        return h(
          "div",
          { className: "rsx-trail-empty" },
          h(Icon, { name: "spark", size: 16 }),
          h("div", null, h("b", null, t("iterationEmptyTitle")), h("div", null, t("iterationEmpty"))),
        )
      }
      return h(
        "div",
        { className: "rsx-trail" },
        cycles
          .slice(-4)
          .reverse()
          .map((cycle, index) => {
            const decision = String(cycle.decision || "continue")
            const tone = decision === "continue" ? "ok" : decision === "stop" || decision === "escalate" ? "bad" : "warn"
            return h(
              "div",
              { className: "rsx-trail-row", key: cycle.id || index },
              h("span", { className: "rsx-trail-dot " + tone }),
              h(
                "div",
                { className: "rsx-trail-main" },
                h(
                  "div",
                  { className: "rsx-trail-title" },
                  h("code", null, cycle.id || "—"),
                  h(Badge, { tone: tone }, decision),
                  h("span", { className: "rsx-note" }, fmtTime(cycle.at, lang)),
                  cycle.run ? h("span", { className: "rsx-note rsx-mono" }, cycle.run) : null,
                ),
                h("div", { className: "rsx-trail-goal" }, cycle.goal || cycle.action || "—"),
                cycle.observation ? h("div", { className: "rsx-trail-obs" }, cycle.observation) : null,
              ),
            )
          }),
      )
    }

    function OverviewFlywheel(props) {
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
      const go = (view) => {
        if (typeof p.onView === "function") p.onView(view)
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
      if (!state) {
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
                  "aria-current": data.current === campaign.id ? "true" : undefined,
                  onClick: () => p.onSelect(campaign.id),
                },
                h("span", { className: "rsx-camp-title" }, campaign.title),
                h("span", { className: "rsx-camp-meta" }, h(Badge, { tone: "accent" }, stageLabel(campaign.stage, lang)), h("span", null, campaign.tier)),
              ),
            ),
          ),
          h("div", { className: "rsx-loading" }, t("loading")),
        )
      }

      const gate = detail && detail.gate ? detail.gate : null
      const integrity = detail && detail.integrity ? detail.integrity : {}
      const counts = {
        sources: safeArray(state.sources).length,
        searches: safeArray(state.searchLog).length,
        sensitivities: safeArray(state.sensitivity).length,
        program:
          safeArray(state.plan && state.plan.questions).length +
          safeArray(state.perspectives).length +
          safeArray(state.cycles).length +
          safeArray(state.tournament && state.tournament.matches).length +
          safeArray(state.quality && state.quality.rows).length +
          safeArray(state.contradictions).length,
        claims: safeArray(state.claims).length,
        numbers: safeArray(state.numbers).length,
        runs: safeArray(state.runs).length,
      }
      const loop = state.loopEvaluation || null

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
                "aria-current": state.id === campaign.id ? "true" : undefined,
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
        h(
          "div",
          { className: "rsx-project-head" },
          h(
            "div",
            { style: { minWidth: 0, flex: 1 } },
            h("h2", { className: "rsx-h1" }, state.title),
            h("p", { className: "rsx-sub" }, state.question || t("unknown")),
            h(
              "div",
              { className: "rsx-project-meta" },
              h(Badge, { tone: "accent" }, `${t("tier")} ${state.tier}`),
              h(Badge, { tone: integrity.chainOk ? "ok" : "bad", dot: true }, integrity.chainOk ? t("chainOk") : t("chainBroken")),
              h(
                "button",
                { type: "button", className: "rsx-btn ghost", style: { padding: "1px 6px", fontSize: 11 }, onClick: () => copy(state.id, "id") },
                copied === "id" ? t("copied") : state.id,
              ),
              h("span", { className: "rsx-note" }, `${fmtNum(state.seq || 0)} ${t("events")} · ${fmtTime(state.updatedAt, lang)}`),
            ),
          ),
        ),
        h(Flywheel, {
          t: t,
          lang: lang,
          state: state,
          gate: gate,
          next: detail.next,
          onView: go,
          onPrompt: p.onPrompt,
          onExport: p.onExport,
          onArchive: p.onArchive,
          busy: p.busy === true,
        }),
        h(
          "div",
          { className: "rsx-grid" },
          h(
            Card,
            {
              title: t("iterationTrail"),
              right: h(LinkButton, { onClick: () => go("ledger") }, t("viewLedger")),
            },
            h(IterationTrail, { state: state, t: t, lang: lang }),
          ),
          h(
            Card,
            {
              title: t("gateChecks"),
              right: h(LinkButton, { onClick: () => go("audit") }, t("viewAudit")),
            },
            h(GateChecks, { gate: gate, t: t, lang: lang }),
          ),
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
                h("div", { className: "rsx-kpi" }, h("b", null, counts.searches), h("span", null, t("searches"))),
                h("div", { className: "rsx-kpi" }, h("b", null, counts.sensitivities), h("span", null, t("sensitivities"))),
                h("div", { className: "rsx-kpi" }, h("b", null, counts.program), h("span", null, t("program"))),
                h("div", { className: "rsx-kpi" }, h("b", null, counts.claims), h("span", null, t("claims"))),
                h("div", { className: "rsx-kpi" }, h("b", null, counts.numbers), h("span", null, t("numbers"))),
                h("div", { className: "rsx-kpi" }, h("b", null, counts.runs), h("span", null, t("runs"))),
              ),
              h(BudgetBar, { budget: detail.budget || state.budget }),
              h("div", { className: "rsx-sep" }),
              h("div", { className: "rsx-row" }, h("span", { className: "rsx-note" }, t("template") + ":"), h("span", null, state.templateId || t("blank"))),
              h("div", { className: "rsx-row" }, h("span", { className: "rsx-note" }, t("stage") + ":"), h("span", null, stageLabel(state.stage, lang)), h("span", { className: "rsx-note" }, `· ${state.seq || 0} events`)),
              h("div", { className: "rsx-row" }, h("span", { className: "rsx-note" }, t("integrity") + ":"), h("span", { className: "rsx-mono" }, `${integrity.artifacts || 0} artifacts`)),
            ),
          ),
          h(
            Card,
            { title: lang === "en" ? "Research loop" : "研究闭环" },
            loop
              ? h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: 9 } },
                  h(
                    "div",
                    { className: "rsx-row" },
                    h("b", { style: { fontSize: 24 } }, `${loop.score}/100`),
                    h(Badge, { tone: loop.score >= 85 ? "ok" : loop.score >= 65 ? "warn" : "bad" }, loop.grade),
                    h("span", { className: "rsx-note" }, loop.level),
                    h("div", { className: "rsx-top-spacer" }),
                    loop.delta === null || loop.delta === undefined ? null : h(Badge, { tone: loop.delta >= 0 ? "ok" : "bad" }, `${loop.delta >= 0 ? "+" : ""}${loop.delta}`),
                  ),
                  h("div", { className: "rsx-note" }, loop.rsi && loop.rsi.ready ? (lang === "en" ? "RSI prerequisites met — compare the next candidate against this baseline." : "已具备自我改进前提；下一次候选改动与基线比较。") : (lang === "en" ? "Next: " + (safeArray(loop.nextActions)[0] ? safeArray(loop.nextActions)[0].action : "close the highest-weight gap") : "下一步：" + (safeArray(loop.nextActions)[0] ? safeArray(loop.nextActions)[0].action : "先补权重最高的缺口"))),
                  safeArray(loop.gaps).length
                    ? h("ul", { className: "rsx-note", style: { margin: 0, paddingLeft: 16 } }, safeArray(loop.gaps).slice(0, 3).map((gap) => h("li", { key: gap.dimension + gap.id }, gap.detail)))
                    : null,
                  h("button", { type: "button", className: "rsx-btn", onClick: () => p.onEvaluate(state.id) }, lang === "en" ? "Re-evaluate" : "重新评估"),
                )
              : h(
                  "div",
                  { style: { display: "flex", flexDirection: "column", gap: 9 } },
                  h("p", { className: "rsx-note" }, lang === "en" ? "Not evaluated yet. Score the 13 engineering dimensions and persist a baseline." : "尚未评估。计算 13 个工程维度并写入基线。"),
                  h("button", { type: "button", className: "rsx-btn primary", onClick: () => p.onEvaluate(state.id) }, lang === "en" ? "Evaluate loop" : "运行闭环评估"),
                ),
          ),
        ),
      )
    }

    /**
     * Overview wrapper. The old linear overview stays one line away as a
     * rollback; swap this return for `h(OverviewLinear, props)` if needed.
     */
    function Overview(props) {
      return h(OverviewFlywheel, props)
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
          .catch((err) => setError(errorText(err, lang)))
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
          .catch((err) => setError(errorText(err, lang)))
          .finally(() => setRunning(false))
      }

      const downloadBib = () => {
        apiGet("/api/bibtex/" + campaignId)
          .then((payload) => {
            if (downloadFile(campaignId + "-references.bib", payload.bibtex, "application/x-bibtex")) p.onNotify && p.onNotify(t("bibtexDone"))
          })
          .catch((err) => setError(errorText(err, lang)))
      }

      const downloadFormat = (format, filename, type) => {
        apiGet("/api/references/" + campaignId + "?format=" + encodeURIComponent(format))
          .then((payload) => {
            const content = payload && (payload.content !== undefined ? payload.content : payload.bibtex)
            if (!content) throw new Error(t("error"))
            if (downloadFile(campaignId + "-" + filename, content, type)) p.onNotify && p.onNotify(t("referencesDone"))
          })
          .catch((err) => setError(errorText(err, lang)))
      }

      const downloadPrisma = () => {
        apiGet("/api/prisma/" + campaignId)
          .then((payload) => {
            const prisma = payload && payload.prisma
            if (!prisma) throw new Error(t("error"))
            const content = JSON.stringify(prisma, null, 2)
            if (downloadFile(campaignId + "-PRISMA.json", content, "application/json")) p.onNotify && p.onNotify(t("prismaDone"))
          })
          .catch((err) => setError(errorText(err, lang)))
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
          h("button", { type: "button", className: "rsx-btn", onClick: () => downloadFormat("csl-json", "references.csl.json", "application/json") }, h(Icon, { name: "download", size: 13 }), t("downloadCsl")),
          h("button", { type: "button", className: "rsx-btn", onClick: () => downloadFormat("ris", "references.ris", "application/x-research-info-systems") }, h(Icon, { name: "download", size: 13 }), t("downloadRis")),
          h("button", { type: "button", className: "rsx-btn", onClick: downloadPrisma }, h(Icon, { name: "download", size: 13 }), t("downloadPrisma")),
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
          .catch((err) => setError(errorText(err, lang)))
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
          setError(errorText(err, lang))
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
          .catch((err) => setError(errorText(err, lang)))
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
      const [metricsText, setMetricsText] = useState("")
      const [observationsText, setObservationsText] = useState("")
      const [monitorError, setMonitorError] = useState("")

      useEffect(() => {
        setStatus(monitoring.status || "planned")
        setPlan(monitoring.plan || "")
        setOwner(monitoring.owner || "")
        setCadence(monitoring.cadence || "")
        setSignals(safeArray(monitoring.signals).join(", "))
        setMetricsText("")
        setObservationsText("")
        setMonitorError("")
      }, [state && state.id, monitoring.updatedAt])

      if (!state) return h("div", { className: "rsx-loading" }, t("loading"))

      const selected = state.domain || "general"
      const reviews = safeArray(state.reviews)
      const roles = safeArray(profile && profile.reviewRoles)
      const missing = safeArray(completeness.missingFields)
      const percent = completeness.required ? Math.round((completeness.filled / completeness.required) * 100) : 100

      const save = () => {
        const payload = {
          status: status,
          plan: plan,
          owner: owner,
          cadence: cadence,
          signals: signals.split(/[,，\n]+/u).map((item) => item.trim()).filter(Boolean),
        }
        setMonitorError("")
        try {
          if (metricsText.trim()) {
            const metrics = JSON.parse(metricsText)
            if (!Array.isArray(metrics)) throw new Error(lang === "en" ? "metrics must be a JSON array" : "metrics 必须是 JSON 数组")
            payload.metrics = metrics
          }
          if (observationsText.trim()) {
            const observations = JSON.parse(observationsText)
            if (!Array.isArray(observations)) throw new Error(lang === "en" ? "observations must be a JSON array" : "observations 必须是 JSON 数组")
            payload.observations = observations
          }
        } catch (error) {
          setMonitorError(errorText(error, lang))
          return
        }
        p.onSaveMonitoring(payload)
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
                  ["none", "planned", "active", "paused", "alert", "closed"].map((item) => h("option", { key: item, value: item }, item)),
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
              h("span", { className: "rsx-note" }, `${lang === "en" ? "metrics" : "指标"} ${safeArray(monitoring.metrics).length}`),
              h("span", { className: "rsx-note" }, `${lang === "en" ? "observations" : "观测"} ${safeArray(monitoring.observations).length}`),
              safeArray(monitoring.metrics).length
                ? h("span", { className: "rsx-note rsx-mono" }, safeArray(monitoring.metrics).map((item) => item.name).join(", "))
                : null,
            ),
            h(Field, { label: lang === "en" ? "Add metrics (JSON array)" : "新增指标（JSON 数组）" },
              h("textarea", {
                className: "rsx-textarea rsx-mono",
                value: metricsText,
                placeholder: '[{"name":"accuracy","target":0.9,"tolerance":0.02,"direction":"higher"}]',
                onChange: (event) => setMetricsText(event.target.value),
              }),
            ),
            h(Field, { label: lang === "en" ? "Add observations (JSON array)" : "新增观测（JSON 数组）" },
              h("textarea", {
                className: "rsx-textarea rsx-mono",
                value: observationsText,
                placeholder: '[{"metric":"accuracy","value":0.95,"at":"2026-01-01T00:00:00Z"}]',
                onChange: (event) => setObservationsText(event.target.value),
              }),
            ),
            h("p", { className: "rsx-note" }, lang === "en" ? "Metrics replace by name; observations append. Leave a box empty to keep existing data." : "指标按 name 覆盖；观测追加。留空不改变已有数据。"),
            monitorError ? h("p", { className: "rsx-error" }, monitorError) : null,
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

    /**
     * Cross-campaign control room. The server computes the portfolio so the
     * panel does not re-verify every ledger on each render; the view only
     * filters, ranks and explains attention items.
     */
    function Portfolio(props) {
      const p = props || {}
      const t = p.t
      const lang = p.lang
      const [report, setReport] = useState(null)
      const [error, setError] = useState("")
      const [busy, setBusy] = useState(false)
      const [query, setQuery] = useState("")
      const [filter, setFilter] = useState("all")

      const load = () => {
        setBusy(true)
        setError("")
        apiGet("/api/portfolio")
          .then((payload) => setReport(payload))
          .catch((err) => setError(errorText(err, lang)))
          .finally(() => setBusy(false))
      }

      useEffect(() => {
        load()
      }, [])

      if (!report && busy) return h("div", { className: "rsx-loading" }, t("loading"))
      if (!report && error) {
        return h("div", { className: "rsx-error" }, h("span", null, `${t("error")}: ${error}`), h("button", { type: "button", className: "rsx-btn ghost", onClick: load }, t("retry")))
      }
      if (!report) return null

      const totals = report.totals || {}
      const reasonLabels = {
        stale_audit: t("reasonStaleAudit"),
        audit_blocking: t("reasonAuditBlocking"),
        monitoring_alert: t("reasonMonitoringAlert"),
        integrity: t("reasonIntegrity"),
        schema: t("reasonSchema"),
      }
      const all = safeArray(report.campaigns)
      const needle = query.trim().toLowerCase()
      const matches = all
        .filter((row) => {
          if (filter === "attention" && row.attention !== true) return false
          if (filter === "released" && row.releasePassed !== true) return false
          if (filter === "active" && row.releasePassed === true) return false
          if (!needle) return true
          return [row.id, row.title, row.domain, row.stage].some((value) => String(value || "").toLowerCase().indexOf(needle) >= 0)
        })
        .sort((a, b) => {
          const rank = (row) => (row.attention ? 1 : 0)
          if (rank(a) !== rank(b)) return rank(b) - rank(a)
          return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
        })

      const scoreText = (row) => (row.score === null || row.score === undefined ? "—" : `${row.score}/100`)
      const integrityText = (row) => {
        const integrity = row.integrity || {}
        return integrity.chainOk === true && integrity.stateOk !== false ? t("chainOk") : t("chainBroken")
      }
      const auditText = (row) => {
        if (!row.audit) return "—"
        const blocking = Number(row.audit.blocking) || 0
        return row.audit.fresh ? `${row.audit.verdict || "fresh"}${blocking ? ` · ${blocking}` : ""}` : t("auditStale")
      }

      const rows = matches.map((row) => [
        h(
          "div",
          { key: row.id + ":title", style: { minWidth: 0 } },
          h("div", { style: { fontWeight: 600 } }, row.title || row.id),
          h("div", { className: "rsx-note", style: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" } },
            h("span", { className: "rsx-mono" }, row.id),
            row.domain ? h(Badge, { tone: "muted" }, row.domain) : null,
          ),
          row.attention
            ? h("div", { className: "rsx-note", style: { color: "var(--rsx-warn)" } }, safeArray(row.attentionReasons).map((reason) => reasonLabels[reason] || reason).join(" · "))
            : null,
        ),
        h("div", { key: row.id + ":stage" }, h(Badge, { tone: row.stage === "release" ? "ok" : "accent" }, stageLabel(row.stage, lang))),
        h("div", { key: row.id + ":score", className: "rsx-mono" }, scoreText(row)),
        h("div", { key: row.id + ":audit" }, row.audit ? h(Badge, { tone: row.audit.fresh ? "ok" : "warn" }, auditText(row)) : h("span", { className: "rsx-note" }, "—")),
        h("div", { key: row.id + ":integrity" }, h(Badge, { tone: row.integrity && row.integrity.chainOk !== false && row.integrity.stateOk !== false ? "ok" : "bad", dot: true }, integrityText(row))),
        h("div", { key: row.id + ":alerts" }, row.alerts ? h(Badge, { tone: "warn" }, String(row.alerts)) : h("span", { className: "rsx-note" }, "0")),
        h("div", { key: row.id + ":updated", className: "rsx-note" }, fmtTime(row.updatedAt, lang)),
        h("button", { key: row.id + ":open", type: "button", className: "rsx-btn ghost", onClick: () => p.onOpen(row.id) }, t("openCampaign")),
      ])

      const filterButton = (id, label, count) =>
        h(
          "button",
          { key: id, type: "button", className: "rsx-chip" + (filter === id ? " on" : ""), "aria-pressed": filter === id ? "true" : "false", onClick: () => setFilter(id) },
          label,
          count === undefined ? null : h("span", { className: "rsx-count" }, count),
        )

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
                h("h2", { className: "rsx-h1" }, t("portfolio")),
                h("p", { className: "rsx-sub" }, t("portfolioHint")),
              ),
              h(Badge, { tone: totals.attention ? "warn" : "ok", dot: true }, totals.attention ? `${totals.attention} ${t("attention")}` : t("healthOk")),
            ),
            h(
              "div",
              { className: "rsx-kpis" },
              h("div", { className: "rsx-kpi" }, h("b", null, totals.campaigns || 0), h("span", null, t("activeCampaigns"))),
              h("div", { className: "rsx-kpi" }, h("b", null, totals.released || 0), h("span", null, t("released"))),
              h("div", { className: "rsx-kpi" }, h("b", null, totals.attention || 0), h("span", null, t("attention"))),
              h("div", { className: "rsx-kpi" }, h("b", null, totals.archived || 0), h("span", null, t("archivedProjects"))),
            ),
            h(
              "div",
              { className: "rsx-row rsx-toolbar" },
              h("input", { className: "rsx-input", style: { flex: 1, minWidth: 160 }, value: query, placeholder: t("searchCampaigns"), "aria-label": t("searchCampaigns"), onChange: (event) => setQuery(event.target.value) }),
              h(
                "div",
                { className: "rsx-chips" },
                filterButton("all", t("all"), all.length),
                filterButton("attention", t("needsAttention"), totals.attention || 0),
                filterButton("active", t("activeCampaigns"), all.filter((row) => row.releasePassed !== true).length),
                filterButton("released", t("released"), totals.released || 0),
              ),
              h("button", { type: "button", className: "rsx-btn ghost", onClick: load, disabled: busy }, busy ? t("working") : t("refresh")),
            ),
            error ? h("div", { className: "rsx-error" }, h("span", null, `${t("error")}: ${error}`), h("button", { type: "button", className: "rsx-btn ghost", onClick: load }, t("retry"))) : null,
          ),
        ),
        h(
          Card,
          { title: `${t("portfolio")} · ${matches.length}`, flush: true },
          h(DataTable, {
            columns: [
              { label: t("healthCampaign"), width: "30%" },
              { label: t("stage"), width: "10%" },
              { label: t("score"), width: "9%" },
              { label: t("healthAudit"), width: "16%" },
              { label: t("integrity"), width: "11%" },
              { label: t("alerts"), width: "7%" },
              { label: t("updated"), width: "10%" },
              { label: "", width: "7%" },
            ],
            rows,
            empty: needle ? t("noMatches") : filter === "attention" ? t("attentionEmpty") : t("emptyBody"),
          }),
        ),
      )
    }

    function Health(props) {
      const p = props || {}
      const t = p.t
      const lang = p.lang
      const [report, setReport] = useState(null)
      const [busy, setBusy] = useState(false)
      const [message, setMessage] = useState("")
      const [tone, setTone] = useState("muted")

      const load = () => {
        setBusy(true)
        setMessage("")
        apiGet("/api/doctor")
          .then((data) => setReport(data))
          .catch((error) => {
            setMessage(errorText(error, lang))
            setTone("bad")
          })
          .finally(() => setBusy(false))
      }

      useEffect(() => {
        load()
      }, [])

      const notify = (text, nextTone) => {
        setMessage(text)
        setTone(nextTone || "ok")
        if (p.onNotify) p.onNotify(text, nextTone || "ok")
      }

      const reindex = () => {
        setBusy(true)
        apiPost("/api/reindex", {})
          .then((result) => {
            if (result && result.ok === false) {
              const first = safeArray(result.skipped)[0]
              notify(first ? `${t("error")}: ${first.error || first.code}` : t("error"), "bad")
            } else {
              notify(t("reindexDone"), "ok")
            }
            load()
          })
          .catch((error) => notify(errorText(error, lang), "bad"))
          .finally(() => setBusy(false))
      }

      const migrate = (row) => {
        if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(t("migrateConfirm"))) return
        setBusy(true)
        apiPost("/api/campaign", { action: "migrate", campaign: row.id })
          .then((result) => {
            if (result && result.migrated) {
              notify(`${t("migrateDone")} · ${t("backup")}: ${result.backup ? result.backup.name : "—"}`, "ok")
            } else {
              notify(t("alreadyCurrent"), "muted")
            }
            load()
          })
          .catch((error) => notify(errorText(error, lang), "bad"))
          .finally(() => setBusy(false))
      }

      if (!report) {
        return h(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: 12 } },
          h("div", { className: "rsx-loading" }, busy ? t("healthRunning") : message || t("loading")),
          message ? h("div", { className: "rsx-error" }, h("span", null, message), h("button", { type: "button", className: "rsx-btn ghost", onClick: load }, t("retry"))) : null,
        )
      }

      const counts = report.counts || {}
      const rows = safeArray(report.campaigns).map((row) => [
        h("div", { key: row.id + ":id" }, h("div", { className: "rsx-mono" }, row.id), h("div", { className: "rsx-note" }, row.title || "—")),
        h("div", { key: row.id + ":schema" }, h(Badge, { tone: row.canMigrate ? "warn" : "ok" }, `schema ${row.schema || "?"}`), row.canMigrate ? h("span", { className: "rsx-note" }, ` → ${row.targetSchema}`) : null),
        h(Badge, { key: row.id + ":chain", tone: row.chainOk ? "ok" : "bad", dot: true }, row.chainOk ? t("healthChain") : `${t("healthChain")} !`),
        h("div", { key: row.id + ":audit" }, row.audit ? h(Badge, { tone: row.audit.fresh && row.audit.signed ? "ok" : "warn" }, row.audit.fresh ? (row.audit.verdict || "fresh") : t("auditStale")) : h("span", { className: "rsx-note" }, "—")),
        h("div", { key: row.id + ":steward" }, row.stewardship ? h(Badge, { tone: row.stewardship.ok ? "ok" : "warn" }, `${row.stewardship.percent}%`) : h("span", { className: "rsx-note" }, "—")),
        h(
          "div",
          { key: row.id + ":issues" },
          safeArray(row.issues).length
            ? h(
                "details",
                { className: "rsx-issues" },
                h("summary", null, h("span", { className: "rsx-issue-count" }, `E${row.errors || 0} W${row.warnings || 0} I${safeArray(row.issues).filter((issue) => issue.severity === "info").length}`)),
                h(
                  "ul",
                  null,
                  safeArray(row.issues).map((issue, index) => h("li", { key: issue.code + ":" + index }, h("code", { className: "rsx-issue-" + issue.severity }, issue.severity), " ", issue.detail || issue.code, issue.ref ? h("span", { className: "rsx-note" }, ` · ${issue.ref}`) : null)),
                ),
              )
            : h(Badge, { tone: "ok" }, "0"),
        ),
        row.canMigrate ? h("button", { key: row.id + ":migrate", type: "button", className: "rsx-btn ghost", disabled: busy, onClick: () => migrate(row) }, t("migrate")) : h("span", { key: row.id + ":current", className: "rsx-note" }, t("alreadyCurrent")),
      ])

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
                h("h2", { className: "rsx-h1" }, t("health")),
                h("p", { className: "rsx-sub" }, t("healthHint")),
              ),
              h(Badge, { tone: report.ok ? (report.healthy ? "ok" : "warn") : "bad", dot: true }, report.ok ? (report.healthy ? t("healthOk") : t("healthWarnings", { n: counts.warnings || 0 })) : t("healthErrors", { n: counts.errors || 0 })),
            ),
            h(
              "div",
              { className: "rsx-kpis" },
              h("div", { className: "rsx-kpi" }, h("b", null, `v${report.version || "—"}`), h("span", null, t("healthSchema"))),
              h("div", { className: "rsx-kpi" }, h("b", null, counts.campaigns || 0), h("span", null, t("healthCampaign"))),
              h("div", { className: "rsx-kpi" }, h("b", null, counts.errors || 0), h("span", null, lang === "en" ? "errors" : "错误")),
              h("div", { className: "rsx-kpi" }, h("b", null, counts.unmigrated || 0), h("span", null, t("healthUnmigrated"))),
            ),
            h(
              "div",
              { className: "rsx-row", style: { flexWrap: "wrap" } },
              h(Badge, { tone: report.index && report.index.ok ? "ok" : "bad", dot: true }, report.index && report.index.ok ? t("healthIndexOk") : t("healthIndexBad")),
              h("span", { className: "rsx-note" }, `schema ${report.schemaVersion || "—"} · ${counts.scanned || 0}/${counts.campaigns || 0}`),
              h("div", { className: "rsx-top-spacer" }),
              h("button", { type: "button", className: "rsx-btn", onClick: load, disabled: busy }, busy ? t("healthRunning") : t("runHealth")),
              h("button", { type: "button", className: "rsx-btn ghost", onClick: reindex, disabled: busy }, t("reindex")),
            ),
            message ? h("div", { className: message && tone === "bad" ? "rsx-error" : "rsx-note" }, message) : null,
          ),
        ),
        h(
          "div",
          { className: "rsx-grid" },
          h(
            Card,
            { title: t("doctorChecks") },
            h(DataTable, {
              columns: [{ label: "check" }, { label: "state" }, { label: "detail" }],
              rows: safeArray(report.checks).map((check) => [
                h("span", { key: check.code, className: "rsx-mono" }, check.code),
                h(Badge, { key: check.code + ":v", tone: check.ok ? (check.severity === "info" ? "muted" : "ok") : check.severity === "error" ? "bad" : "warn" }, check.ok ? "ok" : "fail"),
                check.detail || "—",
              ]),
              empty: t("healthNoCampaigns"),
            }),
          ),
          h(
            Card,
            { title: t("health") },
            h("p", { className: "rsx-note" }, lang === "en" ? "A migration is explicit and backed up; nothing is auto-repaired by the scan." : "迁移是显式动作并先写备份；体检不会自动修复。"),
            h("div", { className: "rsx-row" }, h(Badge, { tone: "ok" }, `v${report.version}`), h(Badge, { tone: "accent" }, `schema ${report.schemaVersion}`), h("span", { className: "rsx-note" }, `${report.ms || 0} ms`)),
          ),
        ),
        h(
          Card,
          { title: t("healthCampaign"), flush: true },
          h(DataTable, {
            columns: [
              { label: t("healthCampaign"), width: "22%" },
              { label: t("healthSchema"), width: "10%" },
              { label: t("healthChain"), width: "10%" },
              { label: t("healthAudit"), width: "14%" },
              { label: t("healthStewardship"), width: "10%" },
              { label: "issues", width: "16%" },
              { label: "", width: "18%" },
            ],
            rows: rows,
            empty: t("healthNoCampaigns"),
          }),
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
      const [saving, setSaving] = useState(false)
      const [integrity, setIntegrity] = useState(null)
      const [error, setError] = useState("")

      const save = () => {
        setSaving(true)
        setError("")
        apiPost("/api/settings", { patch: { defaultTier: tier, language: language } })
          .then(() => p.onSaved && p.onSaved(language))
          .catch((err) => setError(errorText(err, lang)))
          .finally(() => setSaving(false))
      }

      const check = () => {
        const id = data.current || (safeArray(data.campaigns)[0] || {}).id
        if (!id) return
        apiGet("/api/integrity/" + id)
          .then((payload) => setIntegrity(payload.integrity))
          .catch((err) => setError(errorText(err, lang)))
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
