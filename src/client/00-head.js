/**
 * dsh-research-suite — 00-head
 *
 * Loader wrapper, identity, i18n dictionary, small framework-free helpers and
 * the HTTP client for the loopback panel API.
 */
window.__ModuleLoader__.load({
  id: "dsh-research-suite",
  factory: (require) => {
    const react = require("react")
    const h = react.createElement
    const { useState, useEffect, useRef, useCallback, useMemo } = react

    const NS = "dsh-research-suite"
    const API_BASE = "/dsh-research-suite"
    const REQ_HEADER = "x-dsh-research-suite"
    const VERSION = "1.1.0"
    const LANG_KEY = "dsh-research-suite.lang"

    const STAGES = [
      { id: "scoping", zh: "定题", en: "Scope" },
      { id: "survey", zh: "测绘", en: "Survey" },
      { id: "hypothesis", zh: "假设", en: "Hypothesis" },
      { id: "design", zh: "设计", en: "Design" },
      { id: "execute", zh: "执行", en: "Execute" },
      { id: "analyze", zh: "分析", en: "Analyze" },
      { id: "write", zh: "写作", en: "Write" },
      { id: "review", zh: "评审", en: "Review" },
      { id: "release", zh: "发布", en: "Release" },
    ]

    const TIER_LABEL = { S: "S", M: "M", L: "L", XL: "XL" }

    const TEXT = {
      zh: {
        panel: "科研套件",
        overview: "总览",
        flywheel: "研究飞轮",
        flywheelHint: "每一圈都从当前闸门的阻断项开始；把动作与观察写回台账，再决定下一圈。",
        roundN: "第 {n} 圈",
        preflight: "预备",
        loopStatus: "循环状态",
        loopIdle: "未启动",
        loopRunning: "运行中",
        loopPaused: "已暂停",
        loopReady: "可交付",
        loopStopped: "已停止",
        loopLastCheck: "上次检查",
        stageDone: "已完成 {done}/{total} 阶段",
        stageProgress: "阶段",
        gateProgress: "闸门",
        iterationTrail: "迭代轨迹",
        iterationEmptyTitle: "还没有循环记录",
        iterationEmpty: "在对话里用 rsx_campaign action:\"cycle\" 把这一圈的目标、观察与决策写回台账；飞轮会从真实轮次里长出来。",
        nextAction: "下一步动作",
        noNext: "当前状态没有可执行建议。",
        readyExport: "全部闸门通过，可导出研究包。",
        openPause: "待处理暂停",
        pauseHuman: "等待人工批准",
        pauseInput: "等待输入",
        pauseUnmapped: "需要人工判断",
        pauseMissing: "循环已暂停，但没有找到开放的暂停记录。",
        pauseHint: "处理完再在对话里调用 rsx_campaign action:\"loop\" resume:true；未变化的阻断会被拒绝。",
        viewLedger: "查看台账",
        viewAudit: "查看审查",
        viewReport: "查看报告",
        events: "事件",
        humanCheckpoint: "人工检查点",
        ledger: "台账",
        templates: "模板",
        report: "报告",
        audit: "审查",
        auditTitle: "自动化审查",
        auditRun: "运行审查",
        auditRunning: "审查中…",
        auditFresh: "审查与当前台账一致",
        auditStale: "审查已过期，台账有改动",
        auditNone: "还没有审查记录。先运行一次自动化审查，检查引用、数字、图与预注册。",
        auditFindings: "发现",
        auditMatrix: "证据矩阵",
        auditVerdict: "结论",
        auditBlocking: "阻断",
        auditMajor: "主要",
        auditMinor: "次要",
        downloadBibtex: "下载 references.bib",
        downloadCsl: "下载 CSL-JSON",
        downloadRis: "下载 RIS",
        downloadPrisma: "下载 PRISMA",
        portfolio: "组合",
        score: "评分",
        alerts: "告警",
        portfolioHint: "跨项目总览：先处理完整性、过期审计、监控告警与待迁移，再进入项目。",
        attention: "需关注",
        needsAttention: "需关注",
        released: "已发布",
        activeCampaigns: "进行中",
        openCampaign: "打开",
        openPortfolio: "查看组合",
        attentionEmpty: "没有需要关注的项目。",
        noMatches: "没有匹配的项目。",
        searchCampaigns: "搜索标题、ID 或领域",
        lastSync: "同步于",
        updated: "更新",
        archivedProjects: "归档项目",
        archivedEmpty: "还没有归档项目。",
        archiveHint: "归档保留完整台账，可随时恢复。",
        restore: "恢复",
        restoreDone: "已恢复",
        reasonStaleAudit: "审计过期",
        reasonAuditBlocking: "审计阻断",
        reasonMonitoringAlert: "监控告警",
        reasonIntegrity: "完整性异常",
        reasonSchema: "待迁移",
        bibtexDone: "BibTeX 已生成",
        referencesDone: "参考文献已生成",
        prismaDone: "PRISMA 流程图数据已生成",
        artifacts: "工件",
        matrixEmpty: "还没有抽取行。用 rsx_extract 把论文按维度抽成矩阵。",
        provenance: "溯源",
        settings: "设置",
        newCampaign: "新建项目",
        emptyTitle: "还没有研究项目",
        emptyBody: "从模板开始，插件会建好九阶段流水线、台账与闸门。",
        startTemplate: "从模板开始",
        blank: "空白项目",
        question: "研究问题",
        scope: "边界",
        success: "成功判据",
        title: "标题",
        tier: "档位",
        create: "创建",
        cancel: "取消",
        save: "保存",
        saving: "保存中…",
        current: "当前阶段",
        next: "下一步",
        gateChecks: "闸门检查",
        blocked: "被阻断",
        passed: "已通过",
        notRun: "未运行",
        sources: "来源",
        searches: "检索",
        sensitivities: "敏感性",
        program: "研究程序",
        claims: "断言",
        evidence: "证据",
        numbers: "数字",
        runs: "运行",
        figures: "图",
        reviews: "评审",
        budget: "预算",
        integrity: "完整性",
        chainOk: "事件链完整",
        chainBroken: "事件链断裂",
        export: "导出研究包",
        exportDone: "研究包已生成",
        actions: "研究动作",
        actionsHint: "台账、审查随时可查；报告从写作阶段开放；导出需发布闸门通过且无暂停；归档是随时可恢复的收尾动作。",
        working: "处理中…",
        actionNeedRelease: "发布闸门通过后才能导出",
        actionPaused: "先处理当前暂停",
        actionNeedWrite: "写作阶段后可查看报告",
        actionArchived: "项目已归档",
        continue: "继续研究",
        copied: "已复制到剪贴板",
        copyPrompt: "复制启动提示词",
        apply: "应用",
        applyTitle: "应用模板",
        topicLabel: "主题 / 对象（可留空，之后在对话里补）",
        templateList: "任务模板",
        methodList: "方法协议",
        all: "全部",
        task: "任务",
        method: "方法",
        deliverables: "交付物",
        reportHint: "报告由台账渲染；先过 write 闸门再导出。",
        refresh: "刷新",
        download: "下载 Markdown",
        declaration: "AI 声明",
        reviewer: "人工复核人",
        model: "模型 / 工具",
        watermark: "添加水印",
        generating: "生成中…",
        markdownEmpty: "报告还没生成。",
        claimTab: "断言",
        sourceTab: "来源",
        numberTab: "数字",
        runTab: "运行",
        evidenceTab: "证据",
        emptyLedger: "这个分类还没有记录。",
        archive: "归档",
        archiveDone: "已归档",
        selectCampaign: "选择项目",
        language: "语言",
        dataDir: "数据目录",
        checkIntegrity: "校验事件链",
        health: "健康",
        healthHint: "体检只读：检查事件链、state 哈希、工件、索引、写锁、审计与 schema；修复动作需要单独点击。",
        runHealth: "运行体检",
        healthRunning: "体检中…",
        healthOk: "全部通过",
        healthErrors: "{n} 个错误",
        healthWarnings: "{n} 个提醒",
        healthIndex: "索引",
        healthIndexOk: "索引一致",
        healthIndexBad: "索引需重建",
        healthUnmigrated: "待迁移",
        healthSchema: "schema",
        healthChain: "事件链",
        healthArtifacts: "工件",
        healthAudit: "审计",
        healthStewardship: "治理",
        healthLock: "写锁",
        healthCampaign: "项目",
        healthNoCampaigns: "还没有项目。",
        reindex: "重建索引",
        reindexDone: "索引已重建",
        migrate: "迁移到 schema 5",
        migrateConfirm: "显式迁移会先创建 state+ledger 备份，再改变项目契约。继续？",
        migrateDone: "已迁移，请补齐治理字段",
        alreadyCurrent: "已是当前 schema",
        backup: "备份",
        doctorChecks: "全局检查",
        healthPaused: "体检失败",
        tierHint: "S 60k · M 400k · L 2M · XL 12M tokens",
        noGate: "尚未运行",
        gateAdvice: "在对话里调用 rsx_gate action:\"advance\"，通过后阶段才会前进。",
        loading: "加载中…",
        error: "加载失败",
        retry: "重试",
        promptTitle: "启动提示词",
        promptBody: "把下面这段贴进对话，agent 会从当前项目继续。",
        close: "关闭",
        confirmArchive: "归档这个项目？归档后不在列表显示，数据保留。",
        deleteNever: "数据只增不删。",
        stage: "阶段",
        domain: "领域",
        domainHint: "领域档案把行业协议映射成阻断检查；这是对齐清单，不是认证。",
        domainGeneral: "通用流程",
        domainCompleteness: "领域字段完成度",
        domainMissing: "待补必填字段",
        domainStandards: "标准与清单",
        domainRoles: "领域审查角色",
        domainRoleMet: "已登记",
        domainRoleMissing: "缺少评审",
        domainNoProfile: "当前项目未选择领域档案。",
        domainSelect: "选择领域档案",
        monitoring: "发布后监测",
        monitorHint: "发布闸门要求 planned/active 的监测计划、负责人和频率；每次变更写入事件链。",
        monitorStatus: "状态",
        monitorPlan: "监测计划",
        monitorOwner: "负责人",
        monitorCadence: "复查频率",
        monitorSignals: "信号（逗号分隔）",
        monitorSaved: "监测计划已保存",
        unknown: "—",
      },
      en: {
        panel: "Research Suite",
        overview: "Overview",
        flywheel: "Research flywheel",
        flywheelHint: "Each round starts from the current gate's blocker; write the action and observation back to the ledger before deciding the next round.",
        roundN: "Round {n}",
        preflight: "Preflight",
        loopStatus: "Loop status",
        loopIdle: "Not started",
        loopRunning: "Running",
        loopPaused: "Paused",
        loopReady: "Ready",
        loopStopped: "Stopped",
        loopLastCheck: "Last check",
        stageDone: "{done}/{total} stages done",
        stageProgress: "stages",
        gateProgress: "gate",
        iterationTrail: "Iteration trail",
        iterationEmptyTitle: "No cycle recorded yet",
        iterationEmpty: "Use rsx_campaign action:\"cycle\" in the conversation to write this round's goal, observation and decision back to the ledger; the flywheel is built from real rounds, not estimates.",
        nextAction: "Next action",
        noNext: "No recommendation for this state.",
        readyExport: "Every gate passed — export the research bundle.",
        openPause: "Open pause",
        pauseHuman: "Waiting for a human approval",
        pauseInput: "Waiting for input",
        pauseUnmapped: "Needs a human decision",
        pauseMissing: "The loop is paused but no open pause record was found.",
        pauseHint: "Resolve it, then call rsx_campaign action:\"loop\" resume:true in the conversation; an unchanged blocker is rejected.",
        viewLedger: "Open ledger",
        viewAudit: "Open review",
        viewReport: "Open report",
        events: "Events",
        humanCheckpoint: "Human checkpoint",
        ledger: "Ledger",
        templates: "Templates",
        report: "Report",
        audit: "Review",
        auditTitle: "Automated review",
        auditRun: "Run audit",
        auditRunning: "Auditing…",
        auditFresh: "Audit matches the current ledger",
        auditStale: "Audit is stale — the ledger changed",
        auditNone: "No audit yet. Run the automated reviewer to check citations, numbers, figures and pre-registration.",
        auditFindings: "Findings",
        auditMatrix: "Evidence matrix",
        auditVerdict: "Verdict",
        auditBlocking: "Blocking",
        auditMajor: "Major",
        auditMinor: "Minor",
        downloadBibtex: "Download references.bib",
        downloadCsl: "Download CSL-JSON",
        downloadRis: "Download RIS",
        downloadPrisma: "Download PRISMA",
        portfolio: "Portfolio",
        score: "Score",
        alerts: "Alerts",
        portfolioHint: "Cross-campaign control room: clear integrity, stale audit, monitoring alerts and migrations before entering a campaign.",
        attention: "Needs attention",
        needsAttention: "Needs attention",
        released: "Released",
        activeCampaigns: "Active",
        openCampaign: "Open",
        openPortfolio: "Open portfolio",
        attentionEmpty: "Nothing needs attention.",
        noMatches: "No matching campaigns.",
        searchCampaigns: "Search title, ID or domain",
        lastSync: "Synced",
        updated: "Updated",
        archivedProjects: "Archived campaigns",
        archivedEmpty: "No archived campaigns yet.",
        archiveHint: "Archiving keeps the full ledger and can be restored at any time.",
        restore: "Restore",
        restoreDone: "Restored",
        reasonStaleAudit: "stale audit",
        reasonAuditBlocking: "audit blocking",
        reasonMonitoringAlert: "monitoring alert",
        reasonIntegrity: "integrity",
        reasonSchema: "migration",
        bibtexDone: "BibTeX ready",
        referencesDone: "References ready",
        prismaDone: "PRISMA flow data ready",
        artifacts: "Artifacts",
        matrixEmpty: "No extraction rows yet. Use rsx_extract to build the matrix.",
        provenance: "Provenance",
        settings: "Settings",
        newCampaign: "New campaign",
        emptyTitle: "No research campaign yet",
        emptyBody: "Start from a template: the plugin sets up the nine-stage pipeline, ledger and gates.",
        startTemplate: "Start from a template",
        blank: "Blank campaign",
        question: "Research question",
        scope: "Scope",
        success: "Success criteria",
        title: "Title",
        tier: "Tier",
        create: "Create",
        cancel: "Cancel",
        save: "Save",
        saving: "Saving…",
        current: "Current stage",
        next: "Next",
        gateChecks: "Gate checks",
        blocked: "blocked",
        passed: "passed",
        notRun: "not run",
        sources: "Sources",
        searches: "Searches",
        sensitivities: "Sensitivity",
        program: "Program",
        claims: "Claims",
        evidence: "Evidence",
        numbers: "Numbers",
        runs: "Runs",
        figures: "Figures",
        reviews: "Reviews",
        budget: "Budget",
        integrity: "Integrity",
        chainOk: "event chain intact",
        chainBroken: "event chain broken",
        export: "Export package",
        exportDone: "Research package written",
        actions: "Research actions",
        actionsHint: "Ledger and review are always available; report opens at the write stage; export needs a passed release gate and no open pause; archive is reversible and always available.",
        working: "Working…",
        actionNeedRelease: "Export opens after the release gate passes",
        actionPaused: "Resolve the open pause first",
        actionNeedWrite: "Report opens at the write stage",
        actionArchived: "Campaign archived",
        continue: "Continue research",
        copied: "Copied",
        copyPrompt: "Copy launch prompt",
        apply: "Apply",
        applyTitle: "Apply template",
        topicLabel: "Topic / subject (optional; fill later in chat)",
        templateList: "Task presets",
        methodList: "Method protocols",
        all: "All",
        task: "Task",
        method: "Method",
        deliverables: "Deliverables",
        reportHint: "The report is rendered from the ledger; pass the write gate before exporting.",
        refresh: "Refresh",
        download: "Download Markdown",
        declaration: "AI declaration",
        reviewer: "Human reviewer",
        model: "Model / tool",
        watermark: "Add watermark",
        generating: "Rendering…",
        markdownEmpty: "No report rendered yet.",
        claimTab: "Claims",
        sourceTab: "Sources",
        numberTab: "Numbers",
        runTab: "Runs",
        evidenceTab: "Evidence",
        emptyLedger: "Nothing recorded in this category yet.",
        archive: "Archive",
        archiveDone: "Archived",
        selectCampaign: "Select campaign",
        language: "Language",
        dataDir: "Data directory",
        checkIntegrity: "Verify event chain",
        health: "Health",
        healthHint: "The scan is read-only: chain, state hash, artifacts, index, write locks, audits and schema; repairs are separate clicks.",
        runHealth: "Run health scan",
        healthRunning: "Scanning…",
        healthOk: "All clear",
        healthErrors: "{n} error(s)",
        healthWarnings: "{n} warning(s)",
        healthIndex: "Index",
        healthIndexOk: "index is consistent",
        healthIndexBad: "index needs rebuilding",
        healthUnmigrated: "unmigrated",
        healthSchema: "schema",
        healthChain: "Chain",
        healthArtifacts: "Artifacts",
        healthAudit: "Audit",
        healthStewardship: "Stewardship",
        healthLock: "Write lock",
        healthCampaign: "Campaign",
        healthNoCampaigns: "No campaigns yet.",
        reindex: "Reindex",
        reindexDone: "Index rebuilt",
        migrate: "Migrate to schema 5",
        migrateConfirm: "An explicit migration writes a state+ledger backup first, then changes the campaign contract. Continue?",
        migrateDone: "Migrated — complete the stewardship fields",
        alreadyCurrent: "Already current",
        backup: "Backup",
        doctorChecks: "Global checks",
        healthPaused: "Health scan failed",
        tierHint: "S 60k · M 400k · L 2M · XL 12M tokens",
        noGate: "not run yet",
        gateAdvice: "Call rsx_gate action:\"advance\" in the conversation; the stage only moves on a pass.",
        loading: "Loading…",
        error: "Could not load",
        retry: "Retry",
        promptTitle: "Launch prompt",
        promptBody: "Paste this into the conversation; the agent continues from this campaign.",
        close: "Close",
        confirmArchive: "Archive this campaign? It disappears from the list; the data stays.",
        deleteNever: "Data is append-only.",
        stage: "Stage",
        domain: "Domain",
        domainHint: "A domain profile maps sector protocols to blocking checks; it is an alignment checklist, not a certification.",
        domainGeneral: "General pipeline",
        domainCompleteness: "Domain field completeness",
        domainMissing: "Missing required fields",
        domainStandards: "Standards and checklists",
        domainRoles: "Domain review roles",
        domainRoleMet: "recorded",
        domainRoleMissing: "review missing",
        domainNoProfile: "No domain profile is selected for this campaign.",
        domainSelect: "Select a domain profile",
        monitoring: "Post-release monitoring",
        monitorHint: "The release gate needs a planned/active monitoring plan, an owner and a cadence; every change is appended to the event chain.",
        monitorStatus: "Status",
        monitorPlan: "Monitoring plan",
        monitorOwner: "Owner",
        monitorCadence: "Cadence",
        monitorSignals: "Signals (comma separated)",
        monitorSaved: "Monitoring plan saved",
        unknown: "—",
      },
    }

    function detectLang() {
      try {
        const saved = window.localStorage.getItem(LANG_KEY)
        if (saved === "zh" || saved === "en") return saved
      } catch {
        /* private mode */
      }
      const nav = String((typeof navigator !== "undefined" && navigator.language) || "zh")
      return nav.toLowerCase().indexOf("zh") === 0 ? "zh" : "en"
    }

    function makeT(lang) {
      const dict = TEXT[lang] || TEXT.zh
      return function t(key, vars) {
        let text = dict[key] !== undefined ? dict[key] : TEXT.zh[key] !== undefined ? TEXT.zh[key] : key
        if (vars && typeof vars === "object") {
          text = String(text).replace(/\{([a-z0-9_]+)\}/gi, (whole, name) => (vars[name] !== undefined ? String(vars[name]) : whole))
        }
        return text
      }
    }

    function stageLabel(stage, lang) {
      const found = STAGES.find((item) => item.id === stage)
      return found ? found[lang === "en" ? "en" : "zh"] : stage || "—"
    }

    function safeArray(value) {
      return Array.isArray(value) ? value : []
    }

    function fmtNum(value) {
      const num = Number(value)
      if (!Number.isFinite(num)) return "—"
      if (Math.abs(num) >= 1000) return num.toLocaleString("en-US")
      return String(Math.round(num * 1000) / 1000)
    }

    function fmtTime(value, lang) {
      if (!value) return "—"
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      const now = Date.now()
      const diff = Math.max(0, now - date.getTime())
      const min = Math.floor(diff / 60000)
      if (min < 1) return lang === "en" ? "just now" : "刚刚"
      if (min < 60) return lang === "en" ? `${min} min ago` : `${min} 分钟前`
      const hours = Math.floor(min / 60)
      if (hours < 24) return lang === "en" ? `${hours} h ago` : `${hours} 小时前`
      const days = Math.floor(hours / 24)
      if (days < 30) return lang === "en" ? `${days} d ago` : `${days} 天前`
      return date.toISOString().slice(0, 10)
    }

    function shortHash(value) {
      const text = String(value || "")
      return text.length > 18 ? `${text.slice(0, 12)}…${text.slice(-4)}` : text || "—"
    }

    function copyText(text) {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          return navigator.clipboard.writeText(String(text)).then(() => true).catch(() => fallbackCopy(text))
        }
      } catch {
        /* fall through */
      }
      return Promise.resolve(fallbackCopy(text))
    }

    function fallbackCopy(text) {
      try {
        const area = document.createElement("textarea")
        area.value = String(text)
        area.setAttribute("readonly", "readonly")
        area.style.position = "fixed"
        area.style.opacity = "0"
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand("copy")
        document.body.removeChild(area)
        return ok
      } catch {
        return false
      }
    }

    function apiFailure(response, payload) {
      const error = new Error(payload && payload.error ? payload.error : `HTTP ${response.status}`)
      if (payload && payload.code) error.code = payload.code
      if (payload && payload.detail) error.detail = payload.detail
      error.status = response.status
      return error
    }

    /** Keep the machine code visible so an operator can act on a refusal. */
    function errorText(error, lang) {
      if (!error) return ""
      const message = error.message || String(error)
      return error.code ? `[${error.code}] ${message}` : message
    }

    async function apiGet(path) {
      const response = await fetch(API_BASE + path, { headers: { accept: "application/json" } })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload || payload.ok !== true) throw apiFailure(response, payload)
      return payload.data
    }

    async function apiPost(path, body) {
      const response = await fetch(API_BASE + path, {
        method: "POST",
        headers: { "content-type": "application/json", [REQ_HEADER]: "1" },
        body: JSON.stringify(body || {}),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload || payload.ok !== true) throw apiFailure(response, payload)
      return payload.data
    }

    function latestGates(state) {
      const map = {}
      for (const gate of safeArray(state && state.gates)) {
        map[gate.stage] = gate
      }
      return map
    }

    function stageTone(stage, state, gates) {
      const index = STAGES.findIndex((item) => item.id === stage)
      const currentIndex = STAGES.findIndex((item) => item.id === state.stage)
      const gate = gates[stage]
      if (gate && !gate.ok) return "bad"
      if (index < currentIndex) return "ok"
      if (index === currentIndex) return gate && gate.ok ? "ok" : "current"
      return "idle"
    }

    /**
     * The flywheel is a view over real ledger state, never a separate score.
     * A stage is:
     *   blocked — its latest gate check failed (only up to the current stage),
     *   done    — it is behind the current stage, or its current gate passed,
     *   current — the campaign is sitting on it with no passing gate,
     *   pending — not reached yet.
     */
    function flywheelModel(state, gate) {
      const currentRaw = STAGES.findIndex((item) => item.id === (state && state.stage))
      const currentIndex = currentRaw < 0 ? 0 : currentRaw
      const gates = latestGates(state)
      const liveGate = gate && STAGES[currentIndex] && gate.stage === STAGES[currentIndex].id ? gate : null
      const nodes = STAGES.map((stage, index) => {
        const stageGate = gates[stage.id]
        const gateOk = stageGate ? stageGate.ok === true : index === currentIndex && liveGate ? liveGate.ok === true : null
        let status = "pending"
        if (index <= currentIndex && gateOk === false) status = "blocked"
        else if (index < currentIndex) status = "done"
        else if (index === currentIndex) status = gateOk === true ? "done" : "current"
        return { id: stage.id, index: index, status: status, gateOk: gateOk }
      })
      const done = nodes.filter((node) => node.status === "done").length
      const blocked = nodes.filter((node) => node.status === "blocked")
      const cycles = safeArray(state && state.cycles)
      return {
        nodes: nodes,
        currentIndex: currentIndex,
        done: done,
        total: STAGES.length,
        progress: STAGES.length ? done / STAGES.length : 0,
        blocked: blocked,
        round: cycles.length,
        hasCycles: cycles.length > 0,
        gatePassed: gate && Number.isFinite(Number(gate.passed)) ? Number(gate.passed) : 0,
        gateTotal: gate && Number.isFinite(Number(gate.total)) ? Number(gate.total) : 0,
        gateOk: gate ? gate.ok === true : null,
      }
    }

    function flywheelActionAvailability(state, gate, options) {
      const opts = options || {}
      const model = flywheelModel(state, gate)
      const releaseNode = model.nodes[model.nodes.length - 1] || null
      const releasePassed = Boolean(releaseNode && releaseNode.gateOk === true)
      const archived = Boolean(state && state.archived === true)
      const paused = opts.paused === true
      const busy = opts.busy === true
      const writeIndex = STAGES.findIndex((item) => item.id === "write")
      const reportReady = writeIndex >= 0 && model.currentIndex >= writeIndex
      // Export is a delivery action and follows the release gate. Archive is a
      // reversible lifecycle action: blocked or paused work can be shelved.
      const exportReason = paused ? "paused" : archived ? "archived" : !releasePassed ? "release" : busy ? "busy" : null
      const archiveReason = archived ? "archived" : busy ? "busy" : null
      return {
        export: { enabled: exportReason === null, reason: exportReason },
        ledger: { enabled: true, reason: null },
        audit: { enabled: true, reason: null },
        report: { enabled: reportReady, reason: reportReady ? null : "write" },
        archive: { enabled: archiveReason === null, reason: archiveReason },
      }
    }

    function campaignPrompt(campaign, lang) {
      const title = campaign && campaign.title ? campaign.title : ""
      const id = campaign && campaign.id ? campaign.id : ""
      if (lang === "en") {
        return `Continue research campaign ${id} ("${title}"). Read rsx_campaign action:"status" and rsx_gate action:"check", fix the current blocking checks, and continue from the current stage instead of starting over.`
      }
      return `继续研究项目 ${id}《${title}》。先读取 rsx_campaign action:"status" 与 rsx_gate action:"check"，按当前阻断项继续，不要重头开始。`
    }
