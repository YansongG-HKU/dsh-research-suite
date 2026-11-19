/**
 * dsh-research-suite — 04-panel
 *
 * Panel root: one data flow over /api/state + /api/campaign/:id, view routing,
 * language persistence, the create/apply/prompt/settings modals and the toast.
 */
    function ResearchSuitePanel(props) {
      const outerT = typeof (props && props.t) === "function" ? props.t : null
      const [lang, setLangState] = useState(() => detectLang())
      const t = outerT || makeT(lang)
      const [view, setView] = useState("overview")
      const [data, setData] = useState(null)
      const [templates, setTemplates] = useState([])
      const [domains, setDomains] = useState([])
      const [domainInfo, setDomainInfo] = useState(null)
      const [selected, setSelected] = useState("")
      const [detail, setDetail] = useState(null)
      const [error, setError] = useState("")
      const [busy, setBusy] = useState(false)
      const [refreshing, setRefreshing] = useState(false)
      const [lastSync, setLastSync] = useState(0)
      const [toast, setToast] = useState(null)
      const [modal, setModal] = useState(null)
      const [form, setForm] = useState({ title: "", question: "", scope: "", success: "", tier: "M", domain: "general" })
      const [applyTopic, setApplyTopic] = useState("")
      const [promptText, setPromptText] = useState("")

      ensureStyles()

      const setLang = useCallback((next) => {
        setLangState(next)
        try {
          window.localStorage.setItem(LANG_KEY, next)
        } catch {
          /* private mode */
        }
      }, [])

      const notify = useCallback((message, tone) => {
        setToast({ message: message, tone: tone || "ok" })
      }, [])

      const clearToast = useCallback(() => setToast(null), [])

      const detailSeq = useRef(0)
      const domainSeq = useRef(0)
      const refreshSeq = useRef(0)

      const loadDetail = useCallback((id) => {
        const seq = ++detailSeq.current
        if (!id) {
          setDetail(null)
          return Promise.resolve(null)
        }
        return apiGet("/api/campaign/" + id)
          .then((payload) => {
            if (seq === detailSeq.current) setDetail(payload)
            return payload
          })
          .catch((err) => {
            if (seq === detailSeq.current) setError(errorText(err))
            return null
          })
      }, [])

      const loadDomainInfo = useCallback((id) => {
        const seq = ++domainSeq.current
        if (!id) {
          setDomainInfo(null)
          return Promise.resolve(null)
        }
        return apiGet("/api/campaign/" + id + "/domain")
          .then((payload) => {
            if (seq === domainSeq.current) setDomainInfo(payload)
            return payload
          })
          .catch(() => {
            if (seq === domainSeq.current) setDomainInfo(null)
            return null
          })
      }, [])

      const refresh = useCallback(
        (preferredId) => {
          const seq = ++refreshSeq.current
          setRefreshing(true)
          return apiGet("/api/state")
            .then((payload) => {
              if (seq !== refreshSeq.current) return null
              setData(payload)
              setError("")
              setLastSync(Date.now())
              const campaigns = safeArray(payload.campaigns)
              const requested = preferredId === undefined ? selected : preferredId
              const active = campaigns.some((campaign) => campaign.id === requested)
              const current = campaigns.some((campaign) => campaign.id === payload.current)
              const next = active ? requested : current ? payload.current : (campaigns[0] && campaigns[0].id) || ""
              setSelected(next)
              setDomainInfo(null)
              void loadDomainInfo(next)
              return loadDetail(next)
            })
            .catch((err) => {
              if (seq === refreshSeq.current) setError(errorText(err))
              return null
            })
            .finally(() => {
              if (seq === refreshSeq.current) setRefreshing(false)
            })
        },
        [selected, loadDetail, loadDomainInfo],
      )

      useEffect(() => {
        void refresh()
        apiGet("/api/templates")
          .then((payload) => setTemplates(safeArray(payload.templates)))
          .catch(() => setTemplates([]))
        apiGet("/api/domains")
          .then((payload) => setDomains(safeArray(payload.domains)))
          .catch(() => setDomains([]))
      }, [])

      const selectCampaign = (id) => {
        setSelected(id)
        setDomainInfo(null)
        setError("")
        setView("overview")
        void loadDetail(id)
        void loadDomainInfo(id)
        apiPost("/api/campaign", { action: "select", campaign: id }).catch(() => {
          /* selection is a convenience; reading still works */
        })
      }

      const submitCreate = () => {
        if (!form.question.trim()) {
          notify(lang === "en" ? "The research question is required" : "研究问题不能为空", "bad")
          return
        }
        setBusy(true)
        apiPost("/api/campaign", { action: "create", title: form.title, question: form.question, scope: form.scope, success: form.success, tier: form.tier, domain: form.domain })
          .then((payload) => {
            setModal(null)
            setForm({ title: "", question: "", scope: "", success: "", tier: "M", domain: "general" })
            setView("overview")
            return refresh(payload.campaign.id)
          })
          .catch((err) => notify(errorText(err), "bad"))
          .finally(() => setBusy(false))
      }

      const setDomain = (domain) => {
        if (!selected) return
        setBusy(true)
        apiPost("/api/campaign/" + selected + "/domain", { action: "set", domain: domain })
          .then(() => {
            notify(t("domain"))
            return Promise.all([loadDetail(selected), loadDomainInfo(selected)])
          })
          .catch((err) => notify(errorText(err), "bad"))
          .finally(() => setBusy(false))
      }

      const saveMonitoring = (patch) => {
        if (!selected) return
        setBusy(true)
        apiPost("/api/campaign/" + selected + "/monitor", patch)
          .then(() => {
            notify(t("monitorSaved"))
            return Promise.all([loadDetail(selected), loadDomainInfo(selected)])
          })
          .catch((err) => notify(errorText(err), "bad"))
          .finally(() => setBusy(false))
      }

      const submitApply = () => {
        if (!modal || !modal.template) return
        setBusy(true)
        apiPost("/api/template", { template: modal.template.id, topic: applyTopic, lang: lang })
          .then((payload) => {
            setModal({ type: "prompt", prompt: payload.prompt, title: payload.campaign.title })
            setApplyTopic("")
            return refresh(payload.campaign.id)
          })
          .catch((err) => notify(errorText(err), "bad"))
          .finally(() => setBusy(false))
      }

      const evaluateCampaign = (id) => {
        setBusy(true)
        apiPost("/api/campaign/" + id + "/evaluate", {})
          .then((payload) => {
            const evaluation = payload && payload.evaluation ? payload.evaluation : {}
            notify((lang === "en" ? "Loop score " : "闭环成熟度 ") + (evaluation.score ?? "—") + "/100")
            return loadDetail(id)
          })
          .catch((err) => notify(errorText(err), "bad"))
          .finally(() => setBusy(false))
      }

      const exportCampaign = (id) => {
        setBusy(true)
        apiPost("/api/export/" + id, {})
          .then((payload) => {
            notify(t("exportDone") + (payload.paths && payload.paths.bundle ? " · " + payload.paths.bundle : ""))
            return loadDetail(id)
          })
          .catch((err) => notify(errorText(err), "bad"))
          .finally(() => setBusy(false))
      }

      const archiveCampaign = (id) => {
        if (!window.confirm(t("confirmArchive"))) return
        setBusy(true)
        apiPost("/api/campaign", { action: "archive", campaign: id })
          .then(() => {
            notify(t("archiveDone"))
            setSelected("")
            return refresh("")
          })
          .catch((err) => notify(errorText(err), "bad"))
          .finally(() => setBusy(false))
      }

      const restoreCampaign = (id) => {
        setBusy(true)
        apiPost("/api/campaign", { action: "unarchive", campaign: id })
          .then(() => {
            notify(t("restoreDone"))
            setModal(null)
            setView("overview")
            return refresh(id)
          })
          .catch((err) => notify(errorText(err), "bad"))
          .finally(() => setBusy(false))
      }

      const copyPrompt = (text) => {
        void copyText(text).then((ok) => notify(ok ? t("copied") : t("error"), ok ? "ok" : "bad"))
      }

      const openPrompt = (text) => {
        setPromptText(text)
        setModal({ type: "prompt", prompt: text })
      }

      const campaigns = safeArray(data && data.campaigns)
      const archived = safeArray(data && data.archivedCampaigns)
      const current = selected || (data && data.current) || ""
      const navCount = detail && detail.state ? safeArray(detail.state.claims).length : 0
      const auditState = detail && detail.state ? detail.state : null
      const latestAudit = auditState && safeArray(auditState.audits).length ? safeArray(auditState.audits)[safeArray(auditState.audits).length - 1] : null
      const auditCount = latestAudit && latestAudit.ok === false ? safeArray(latestAudit.blocking).length : 0

      return h(
        "div",
        { className: "rsx-root" },
        h(
          "header",
          { className: "rsx-top" },
          h("div", { className: "rsx-brand" }, h("div", { className: "rsx-mark" }, h(Mark, { size: 17 })), h("div", { className: "rsx-title" }, t("panel")), h("span", { className: "rsx-version" }, VERSION)),
          campaigns.length
            ? h(
                "select",
                {
                  className: "rsx-select",
                  value: current,
                  "aria-label": t("selectCampaign"),
                  onChange: (event) => selectCampaign(event.target.value),
                },
                campaigns.map((campaign) => h("option", { key: campaign.id, value: campaign.id }, `${campaign.title} · ${stageLabel(campaign.stage, lang)}`)),
              )
            : null,
          data && data.archivedCount
            ? h(
                "button",
                { type: "button", className: "rsx-btn ghost", onClick: () => setModal({ type: "archived" }), title: t("archiveHint") },
                h(Icon, { name: "archive", size: 13 }),
                `${t("archivedProjects")} ${data.archivedCount}`,
              )
            : null,
          h("div", { className: "rsx-top-spacer" }),
          h(
            "button",
            { type: "button", className: "rsx-icon-btn" + (refreshing ? " is-spinning" : ""), onClick: () => refresh(), title: `${t("refresh")}${lastSync ? " · " + new Date(lastSync).toLocaleTimeString() : ""}`, "aria-label": t("refresh"), disabled: refreshing },
            h(Icon, { name: "refresh", size: 15 }),
          ),
          h("button", { type: "button", className: "rsx-btn primary", onClick: () => { setView("templates") } }, h(Icon, { name: "plus", size: 13 }), t("newCampaign")),
          h(
            "button",
            { type: "button", className: "rsx-icon-btn", onClick: () => setLang(lang === "zh" ? "en" : "zh"), title: t("language") },
            lang === "zh" ? "EN" : "中",
          ),
          h("button", { type: "button", className: "rsx-icon-btn", onClick: () => setModal({ type: "settings" }), title: t("settings") }, h(Icon, { name: "settings", size: 15 })),
        ),
        h(
          "nav",
          { className: "rsx-nav", role: "tablist" },
          [
            { id: "overview", label: t("overview"), icon: "flask" },
            { id: "portfolio", label: t("portfolio"), icon: "chart" },
            { id: "domain", label: t("domain"), icon: "shield", count: domainInfo && domainInfo.completeness ? domainInfo.completeness.missing : 0 },
            { id: "ledger", label: t("ledger"), icon: "list", count: navCount },
            { id: "audit", label: t("audit"), icon: "shield", count: auditCount },
            { id: "health", label: t("health"), icon: "shield" },
            { id: "templates", label: t("templates"), icon: "template" },
            { id: "report", label: t("report"), icon: "doc" },
          ].map((item) =>
            h(
              "button",
              { key: item.id, type: "button", className: "rsx-tab", role: "tab", "aria-selected": view === item.id ? "true" : "false", onClick: () => setView(item.id) },
              h(Icon, { name: item.icon, size: 13 }),
              item.label,
              item.count ? h("span", { className: "rsx-count" }, item.count) : null,
            ),
          ),
        ),
        h(
          "main",
          { className: "rsx-body" },
          h(
            "div",
            { className: "rsx-body-inner" },
            error ? h("div", { className: "rsx-error" }, h("span", null, `${t("error")}: ${error}`), h("button", { type: "button", className: "rsx-btn ghost", onClick: () => refresh() }, t("retry"))) : null,
            data && view === "portfolio" ? h(Portfolio, { t: t, lang: lang, onOpen: selectCampaign }) : null,
            !data ? h("div", { className: "rsx-loading" }, t("loading")) : null,
            data && view === "overview"
              ? h(Overview, {
                  t: t,
                  lang: lang,
                  data: data,
                  detail: detail,
                  onSelect: selectCampaign,
                  onNew: (kind) => (kind === "template" ? setView("templates") : setModal({ type: "new" })),
                  onPrompt: openPrompt,
                  onExport: exportCampaign,
                  onEvaluate: evaluateCampaign,
                  onArchive: archiveCampaign,
                  onView: setView,
                  busy: busy,
                })
              : null,
            data && view === "domain"
              ? h(DomainView, {
                  t: t,
                  lang: lang,
                  detail: detail,
                  domainInfo: domainInfo,
                  domains: domains,
                  busy: busy,
                  onSetDomain: setDomain,
                  onSaveMonitoring: saveMonitoring,
                })
              : null,
            data && view === "ledger" ? h(Ledger, { t: t, lang: lang, detail: detail }) : null,
            data && view === "audit" ? h(Audit, { t: t, lang: lang, detail: detail, onRefresh: () => refresh(selected), onNotify: notify }) : null,
            data && view === "health" ? h(Health, { t: t, lang: lang, onNotify: notify }) : null,
            data && view === "templates" ? h(Templates, { t: t, lang: lang, templates: templates, onApply: (template) => { setApplyTopic(""); setModal({ type: "apply", template: template }) } }) : null,
            data && view === "report" ? h(Report, { t: t, lang: lang, detail: detail, onExport: exportCampaign, onRefresh: () => loadDetail(selected) }) : null,
          ),
        ),

        modal && modal.type === "settings"
          ? h(
              Modal,
              { title: t("settings"), onClose: () => setModal(null), wide: true },
              h(SettingsForm, {
                t: t,
                lang: lang,
                data: data || {},
                onClose: () => setModal(null),
                onSaved: (nextLang) => {
                  setModal(null)
                  notify(t("save"))
                  if (nextLang === "zh" || nextLang === "en") setLang(nextLang)
                  void refresh()
                },
              }),
            )
          : null,

        modal && modal.type === "archived"
          ? h(
              Modal,
              { title: `${t("archivedProjects")} · ${archived.length}`, onClose: () => setModal(null), wide: true },
              h("p", { className: "rsx-note" }, t("archiveHint")),
              archived.length === 0
                ? h("div", { className: "rsx-empty", style: { padding: "22px 12px" } }, h("p", null, t("archivedEmpty")))
                : h(
                    "div",
                    { className: "rsx-arch-list" },
                    archived.map((campaign) =>
                      h(
                        "div",
                        { key: campaign.id, className: "rsx-arch-row" },
                        h(
                          "div",
                          { style: { minWidth: 0, flex: 1 } },
                          h("div", { style: { fontWeight: 600 } }, campaign.title || campaign.id),
                          h("div", { className: "rsx-note" }, h("span", { className: "rsx-mono" }, campaign.id), ` · ${stageLabel(campaign.stage, lang)} · ${fmtTime(campaign.updatedAt, lang)}`),
                        ),
                        h("button", { type: "button", className: "rsx-btn ghost", disabled: busy, onClick: () => restoreCampaign(campaign.id) }, h(Icon, { name: "refresh", size: 12 }), t("restore")),
                      ),
                    ),
                  ),
            )
          : null,

        modal && modal.type === "new"
          ? h(
              Modal,
              {
                title: t("newCampaign"),
                onClose: () => setModal(null),
                wide: true,
                footer: h(
                  "div",
                  { className: "rsx-row" },
                  h("button", { type: "button", className: "rsx-btn ghost", onClick: () => setModal(null) }, t("cancel")),
                  h("button", { type: "button", className: "rsx-btn primary", onClick: submitCreate, disabled: busy }, busy ? t("saving") : t("create")),
                ),
              },
              h(Field, { label: t("title") }, h("input", { className: "rsx-input", value: form.title, placeholder: lang === "en" ? "optional" : "可留空", onChange: (event) => setForm({ ...form, title: event.target.value }) })),
              h(Field, { label: t("question") }, h("textarea", { className: "rsx-textarea", value: form.question, onChange: (event) => setForm({ ...form, question: event.target.value }) })),
              h(Field, { label: t("scope") }, h("textarea", { className: "rsx-textarea", value: form.scope, onChange: (event) => setForm({ ...form, scope: event.target.value }) })),
              h(Field, { label: t("success") }, h("textarea", { className: "rsx-textarea", value: form.success, onChange: (event) => setForm({ ...form, success: event.target.value }) })),
              h(Field, { label: t("tier") + " · " + t("tierHint") },
                h("select", { className: "rsx-input", value: form.tier, onChange: (event) => setForm({ ...form, tier: event.target.value }) }, ["S", "M", "L", "XL"].map((item) => h("option", { key: item, value: item }, item))),
              ),
              h(Field, { label: t("domain") },
                h(
                  "select",
                  { className: "rsx-input", value: form.domain, onChange: (event) => setForm({ ...form, domain: event.target.value }) },
                  [h("option", { key: "general", value: "general" }, t("domainGeneral"))].concat(
                    safeArray(domains).map((item) => h("option", { key: item.id, value: item.id }, item.title[lang === "en" ? "en" : "zh"])),
                  ),
                ),
              ),
              h("p", { className: "rsx-note" }, t("domainHint")),
            )
          : null,

        modal && modal.type === "apply"
          ? h(
              Modal,
              {
                title: t("applyTitle") + " · " + modal.template.title[lang === "en" ? "en" : "zh"],
                onClose: () => setModal(null),
                footer: h(
                  "div",
                  { className: "rsx-row" },
                  h("button", { type: "button", className: "rsx-btn ghost", onClick: () => setModal(null) }, t("cancel")),
                  h("button", { type: "button", className: "rsx-btn primary", onClick: submitApply, disabled: busy }, busy ? t("saving") : t("apply")),
                ),
              },
              h("p", { className: "rsx-note" }, modal.template.summary[lang === "en" ? "en" : "zh"]),
              h(Field, { label: t("topicLabel") }, h("input", { className: "rsx-input", value: applyTopic, autoFocus: true, onChange: (event) => setApplyTopic(event.target.value) })),
              h("p", { className: "rsx-note" }, lang === "en" ? "Unfilled placeholders stay as [TOPIC]/[DATA]; the agent fills them with you." : "未填的占位符会保留为 [TOPIC]/[DATA]，agent 会在对话里和你补全。"),
            )
          : null,

        modal && modal.type === "prompt"
          ? h(
              Modal,
              {
                title: t("promptTitle"),
                onClose: () => setModal(null),
                wide: true,
                footer: h(
                  "div",
                  { className: "rsx-row" },
                  h("button", { type: "button", className: "rsx-btn ghost", onClick: () => setModal(null) }, t("close")),
                  h("button", { type: "button", className: "rsx-btn primary", onClick: () => copyPrompt(modal.prompt || promptText) }, h(Icon, { name: "copy", size: 13 }), t("copyPrompt")),
                ),
              },
              h("p", { className: "rsx-note" }, t("promptBody")),
              h("div", { className: "rsx-prompt" }, modal.prompt || promptText),
            )
          : null,

        h(Toast, { message: toast && toast.message, tone: toast && toast.tone, onDone: clearToast }),
      )
    }
