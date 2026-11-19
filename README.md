# 科研套件 · dsh-research-suite

[![CI](https://github.com/YansongG-HKU/dsh-research-suite/actions/workflows/ci.yml/badge.svg)](https://github.com/YansongG-HKU/dsh-research-suite/actions/workflows/ci.yml)

把 DeepSeek Harness 变成一个**可审计的科研项目工作台**：模板起步、证据台账、九道机器可检的闸门、领域协议档案、自动化审查、BibTeX/证据矩阵/RO-Crate 研究包。它不是另一个聊天窗口，而是给现有 agent 加了一层“项目状态 + 证据约束 + 交付格式”。

- 九阶段流水线：`scoping → survey → hypothesis → design → execute → analyze → write → review → release`
- 四类领域档案：金融量化、AI/ML、医学临床、工业工程；领域字段成为对应阶段的阻断检查，而不是提示词
- 每条断言必须挂证据，每个数字必须能追到一次真实运行或一条来源
- 自动化审查：引用必须落在捕获正文里、引文必须能在正文中找到、图必须带代码与数据、领域角色与字段必须到位
- 事件链 SHA-256 逐条哈希，工件按内容寻址；`state.json` 带整体 digest 并锚定事件尾，跨进程写锁 + 读时哈希校验
- 审查记录用本地 HMAC-SHA256 签名；review 闸门验签，篡改 findings/verdict/对象哈希会被挡住
- 预注册、负对照、环境锁定、AI 声明、人工复核与发布后监测都是闸门的一部分
- 条件适用性：字段/标准按研究设计与风险等级自动失效，不再用一条 `N/A` 掩盖所有设计差异
- 监测判定：指标 + 观测 + 目标/容差 + 告警 + 回退，而不只是登记一个监测计划
- 独立评审：机构、利益冲突、独立性声明；同一人不能同时覆盖两个领域角色
- 13 维研究闭环评分（0–100）、版本化基线、`npm run rsi` 回归门槛，形成可比较的自我改进循环
- 侧边栏面板：总览（九阶段环形飞轮、当前闸门→暂停→下一步→导出、真实轮次轨迹）、跨项目组合（需关注优先、搜索/筛选、真实发布状态）、领域、台账（断言/来源/数字/运行/证据/图/工件）、审查、健康（问题明细可展开）、模板、报告；归档可随时恢复
- 研究程序：计划问题与来源覆盖、利益相关方视角、`maxCycles`/停止/升级/人类检查点、act→observe→decide 循环、假设锦标赛、六维质量评分、矛盾台账；schema-4 的 review 闸门要求程序完整
- 宿主循环闸门：`rsx_campaign action:"loop"` 每轮先查完整性/预算/闸门/循环预算，暂停写 `LP-xxxx` 与 `loop.paused`，人工输入后才允许 `resume:true`；不执行推荐、不自动批准
- 断言严谨性：Toulmin warrant、反向证据检索、GRADE 式 certainty；来源声明独立性/派生关系/研究设计/偏倚风险，审计会指出“八条同源新闻不是八条独立验证”
- 评审支持：`rsx_review action:"packet"` 生成评审包（断言、warrant、来源独立性、数字、运行、十二个必答问题）；`entailment` 做词面覆盖筛查，并明确它不是语义蕴含；0.7 还会标出否定极性与数字不一致
- 检索协议与稳健性：每条检索登记数据库、查询、日期窗口、命中/初筛/纳入计数；每条敏感性记录换模型、换子样本、换阈值后的结果与方向；预注册锁定时间与最早运行时间比较
- 宿主侧实时检索：`rsx_search` 直接查 OpenAlex 与 Crossref，返回规范化、DOI 去重、带来源标记的候选；单源失败回退，双源失败明确报错；只读，不自动写台账
- 可执行复现包：`REPRO.md` / `repro.json` / `checksums.txt` 记录精确命令、种子、负对照、环境锁、期望指标与工件校验和
- 发布治理：人工批准绑定当前审查对象哈希，证据改动后自动失效；结构化、带到期日与批准人的 waiver，且不能关闭完整性/签名/独立性/声明校验
- 预注册漂移：锁定哈希 + 带理由的修订记录；运行早于锁定会被审计指出，并在 schema 3 的 execute 闸门阻断
- 跨领域 RSI 套件：`npm run rsi:suite` 让通用夹具与四个领域夹具各跑完九阶段，失败按命名检查报告
- 集百家之长：Claude Science 式 reviewer、Elicit 式抽取矩阵、Zotero CSL-JSON/RIS/BibTeX、RO-Crate 1.1、W3C PROV-JSON、OSF 预注册、PRISMA 2020 候选级筛选、multiverse/specification-curve 敏感性、DVC/MLflow 溯源、CONSORT/TRIPOD+AI、NIST AI RMF、GIPS/Deflated Sharpe、ISO/IEC 17025/IATF 16949、Toulmin/GRADE、PROV/RO-Crate 溯源

当前版本 **1.1.0**，**175** 个测试全绿，RSI 确定性夹具 100/100，跨领域套件 5/5 达到 100；`npm run acceptance` 27/27 在临时目录完成真实 release → export → migrate → reindex。1.1.0 把面板从“单项目工作台”补成可运营的控制台：新增跨项目组合视图（需关注优先、搜索/筛选、按真实 release 闸门统计已发布）、可展开的体检问题明细、带代码的错误提示、请求竞态保护与原生焦点管理；业务上把归档改成**可恢复的生命周期动作**（不再要求发布闸门、不再被暂停挡住），并用 `unarchive`、归档列表与状态计数把恢复路径显式化；同时移除没有执行路径的 `allowExec` 开关。仍是 16 个工具、schema 5、九道闸门，不引入第 17 个常驻工具。1.0.0 把 schema 5 的 FAIR/CRediT 治理、显式迁移与备份、只读体检、可重建索引、带 SHA-256 清单的导出和面板健康视图收成稳定契约；0.14.0 把检索日志里的 `hits/screened/included` 聚合数推进到候选级：每条候选独立记录标题、摘要、全文三阶段决策，可带排除理由代码与重复指向，并生成 `PRISMA.json`、`PRISMA.md`（含 Mermaid 流程图）和 `PRISMA.csv`；仍是 16 个工具，不新增闸门或 PDF 解析。0.13.0 把参考文献做成可进可出的互操作层：`rsx_source action:"import"` 直接接收 Zotero 的 CSL-JSON、EndNote/Rayyan 的 RIS 和原有 BibTeX，按 DOI/标题去重；`action:"lookup"` 用一个 DOI 走 Crossref 精查并返回可直接 `add` 的草稿；`action:"export"` 与导出研究包同时产出 `references.bib`、`references.csl.json`、`references.ris`，报告新增带“手稿引用/未引用”标记的格式化参考文献表。0.12.0 把总览从“阶段条”改成可回看的九阶段飞轮：环形节点只读取当前阶段与真实闸门，右侧按“当前状态 → 暂停 → 指标 → 下一步”排序，下方只渲染台账里实际存在的轮次；没有循环就不画轮次，也不生成估算进度。飞轮卡底部新增统一的五动作区：台账/审查随时可查，报告到写作阶段开放，导出/归档必须发布闸门通过、无暂停且不在写入中；动作原因通过原生 `disabled` 与 `title` 暴露，不再分散在卡片和页脚。0.11.0 把 0.10 的只读规划器接成宿主循环闸门：`rsx_campaign action:"loop"` 在每轮前检查完整性、预算、闸门与 `maxCycles`，遇 `needsInput`、人工检查点或未映射检查就写 `LP-xxxx` 暂停记录并停止；人工补齐后 `resume:true` 才恢复，未变化的阻断会被拒绝。0.10.0 新增确定性下一步规划器 `rsx_campaign action:"next"`：按当前闸门返回一个主推荐与少量备选，11 个规划器测试全绿；三个真实项目的 `next` 调用分别落在定题、测绘、发布阶段。0.9.0 新增宿主侧 `rsx_search`：真实 OpenAlex/Crossref 查询合并 6 条候选、12/12 验收检查通过、3,794 ms，单源失败可回退。此前 0.4.0 的领域层已在真实桌面会话中跑完九阶段，0.5.0 完成四轮真实闭环评估，0.6.0 在真实工业项目上补足 warrant/反向检索/来源独立性/人工批准后仍为 100（A-0004 `accept`，0 blocking / 0 major，见[验收](#验收)），0.7.0 用 schema-3 项目 `rs-5495250c` 验证检索协议与敏感性阻断，0.8.0 用 schema-4 项目 `rs-f7edf967` 验证研究程序与 `program_complete` 闸门。

---

## 1.1.0：跨项目操作台与可恢复归档

1.0 已经能证明一个项目是否可交付，但项目一多，操作者仍要在下拉框里逐个点开，归档又只能进不能出。1.1 补的是**运营层**：先看组合里谁需要关注，再进项目；归档是生命周期动作，不再和发布闸门绑在一起。

- **组合视图**：`GET /api/portfolio` 返回每个项目的最新评估、审计新鲜度、监控告警、完整性、schema 与 `attentionReasons`；服务端统一计算 `releasePassed`、`unmigrated`、`attention` 与 `archived` 计数。面板新增“组合”标签：KPI、搜索、全部/需关注/进行中/已发布筛选、需关注原因、打开项目；默认按需关注与更新时间排序，不再把“发布阶段”误报成“已发布”。
- **可恢复归档**：归档只拒绝已归档和写入中的项目，不再要求 release 闸门，也不因暂停而拒绝；暂停记录保留在事件链里。新增 `unarchive`（面板、HTTP、`rsx_campaign` action 三处）与 `archivedCampaigns`/`archivedCount`，面板头部显示归档数量并列出每个项目的恢复入口；恢复写入 `campaign.unarchived`，保留完整台账。
- **界面与可访问性**：顶部刷新按钮带旋转状态与竞态保护；状态、详情、领域请求各有序列号，快速切换项目不会被旧响应覆盖；错误统一保留 `code`（如 `action_blocked`）与 detail；健康表的问题单元格展开后显示 code、severity、detail 与 ref；导航可横向滚动，按钮/输入有 `:focus-visible`，模态框有 Escape、Tab 焦点环与关闭后焦点归还，并尊重 `prefers-reduced-motion`。
- **删除无效配置**：移除面板里“允许 rsx_run 执行命令”的开关。`rsx_run` 一直是记录型工具，没有执行路径，保留这个开关会让用户误以为授予了不存在的权限；旧 `settings.json` 中的 `allowExec` 在读取与保存时都被忽略并清理。
- **版本与兼容**：`1.1.0`；仍是 16 个工具、schema 5、九道闸门，新增 1 个 `rsx_campaign` action（`unarchive`），不新增工具或闸门。旧项目、旧归档项目与 schema 1–4 继续可读。

真实验收：安装态 DSH 面板显示 `1.1.0`，组合页对 9 个活跃项目显示“需关注 8 / 已发布 5 / 归档 5”，搜索 `DOE` 过滤到 1 行，需关注筛选 8 行；归档弹窗列出 5 个旧项目及恢复按钮；健康表展开显示 `schema 4 can be migrated to 5`；打开组合行回到总览并加载对应项目。截图见 [`_artifacts/live-1.1/portfolio-1440.png`](_artifacts/live-1.1/portfolio-1440.png) 与 [`_artifacts/live-1.1/archived-1440.png`](_artifacts/live-1.1/archived-1440.png)。设计说明见 [1.1.0-操作台](docs/1.1.0-操作台.md)，验收证据见 [1.1.0-验收](docs/1.1.0-验收.md)。

## 1.0.0：稳定契约、FAIR/CRediT 治理与可迁移发布

0.14 已经能证明“候选怎么被筛掉”，但还不能回答一个更基本的问题：**把研究包交给别人之后，对方怎么知道许可、数据、代码、贡献与版本关系，以及升级时数据会不会被悄悄改掉？** 1.0 把这一层做成发布契约：schema 5 记录治理字段，release 闸门对 schema 5 增加 `stewardship`，迁移必须显式、先验证、先备份，体检只读，导出带可核验清单。它不新增第 17 个常驻工具，也不把“字段填满”冒充法务批准。

- **schema 5 治理字段**：`state.stewardship` 包含 `license / licenseUrl / dataAvailability / codeAvailability / funding / competingInterests / ethics / keywords / contributors`。贡献者使用 CRediT 的 14 个标准角色（`conceptualization`、`software`、`supervision`、`writing-review-editing` 等），ORCID 接受裸 iD 或 URL 并归一化；字段有长度、数量、角色、重复姓名和 URL 校验。新建项目默认 schema 5。
- **发布闸门 13/13**：schema 5 的 `release` 在原有 12 项检查上增加 `stewardship`；许可、数据/代码可用性、利益冲突、伦理、至少一名带角色的贡献者缺一即阻断。它和 `declaration`、`human_approval` 一样不可被 waiver 静默关闭。schema 1–4 项目该检查只作 advisory，不会因升级被追溯阻断。审计新增 `stewardship_incomplete`（major）供评审者查看，不替代闸门。
- **显式迁移与备份**：`rsx_campaign action:"migrate"` 支持 `dryRun:true`；正式迁移先验证链、state 哈希和全部工件，再在 `campaigns/<id>/backups/` 写含 `state.json`、`events.jsonl`、`manifest.json` 的 ZIP，然后改 schema、写入 `campaign.migrated`（带 `from/to/backup.sha256`），最后保存新状态。每个项目保留最近 20 份；迁移幂等。schema 1–3 迁移还会同时启用研究程序等旧契约检查，dry-run 会返回 `program.missing`。
- **只读体检与索引重建**：`action:"doctor"` 检查事件链、state 哈希、工件、`index.json` 与目录对账、写锁年龄、审计新鲜度/HMAC、schema 与治理完整性；只读、不创建密钥、不自动修复，最多扫描 200 个项目。`action:"reindex"` 只根据 campaign 目录重建 `index.json`，损坏项目跳过并报告，不改 `state.json`。
- **导出清单**：`rsx_write action:"export"` 新增 `STEWARDSHIP.md` 与 `MANIFEST.json`；清单记录插件版本、schema、项目 id/seq/lastHash/stateHash、release 闸门，以及每个导出文件的字节数与 SHA-256，并进入 `BUNDLE.zip`。清单不包含自身与 ZIP 自身哈希，这是格式约束；验证时按 `files[].path` 相对导出目录逐个核对。
- **API 与面板**：`/api/state` 增加 `apiVersion:1 / pluginVersion:1.0.0 / schemaVersion:5`；新增 `GET /api/doctor`、`GET /api/stewardship/:id`、`POST /api/reindex` 与 `POST /api/campaign action:"stewardship"|"migrate"`。面板新增 **健康** 标签：全局检查、每个项目的链/审计/治理/锁状态、待迁移提示、重建索引和显式迁移按钮；迁移前有确认提示。
- **兼容与边界**：schema 1–4 继续可读；0.13 的参考文献三格式、0.14 的候选级 PRISMA 与全部旧 action 保持原行为。仍不抓取/解析 PDF、不做双人独立筛选或 kappa、不自动判断研究质量或伦理批准、不提供静态加密或多用户远端服务。

测试从 164 增至 **174**：`stewardship.test.mjs` 覆盖治理字段与完整性、schema 5 阻断/schema 4 advisory、迁移 dry-run/备份/幂等/损坏链拒绝、doctor 只读/索引/写锁、manifest 哈希与 bundle 条目；工具、面板、客户端测试覆盖新 action、路由、版本与健康视图。`npm test` **174/174**；`npm run release:check` 通过；`npm run acceptance` **27/27**（795 ms，临时目录真实执行，输出 [`acceptance-1.0.0.json`](_artifacts/acceptance-1.0.0.json)）。真实验收与 devkit 证据见[1.0.0 验收](docs/1.0.0-验收.md)与[真实安装验收](#100-真实安装验收)。稳定契约见 [1.0.0 发布契约](docs/1.0.0-发布契约.md)，迁移与回滚见 [1.0.0 迁移与恢复](docs/1.0.0-迁移与恢复.md)。

---

## 0.14.0：候选级筛选与 PRISMA 2020 流量数据

0.13 的 `SEARCH.md` 只有 `hits / screened / included` 三个聚合数：能证明“检索过”，但证明不了“哪条记录在标题阶段被排除、为什么被排除、重复记录有几条”。0.14 把这一层补成候选级台账：检索结果不再只能落成来源，也可以先落成待筛候选；每条候选独立走标题、摘要、全文三个阶段，排除必须给理由代码，重复项单独计数，最后由这些记录直接计算 PRISMA 2020 流量数据。它不抓取全文、不解析 PDF，也不把候选数量当成来源数量。

- **候选记录**：`R-0001` 形式的独立 id，和运行 id `R-xxxxxxxxxx` 不冲突。字段包括 `title / doi / year / source / duplicateOf / decisions`；`source` 可链接到已有的 `S-0001` 并补齐题录；`decisions.title`、`decisions.abstract`、`decisions.fullText` 各自保存 `decision / reason / note / reviewer / at`，覆盖旧答案时不丢事件链，历史决策仍在 `events.jsonl` 的 `screening.decided` 事件里，事件同时记录 `reviewer`、`note` 与被自动清理的 `cleared` 字段。
- **三阶段决策**：`stage:"title" | "abstract" | "full-text"`；`decision:"include" | "exclude" | "maybe"`。排除理由限定为 `not-relevant / wrong-population / wrong-intervention / wrong-comparator / wrong-outcome / wrong-design / not-peer-reviewed / duplicate / not-retrieved / insufficient-data / other`；`exclude` 必须带理由，`not-retrieved` 只能在全文阶段使用且必须是 `exclude`。
- **重复计数**：显式传 `duplicateOf:"R-0001"` 创建重复候选；重复项不参与筛选，计入 `duplicatesRemoved`，PRISMA 同时给出 `duplicates.pairs`。不靠模糊标题猜测重复；`source` / DOI / 标题只用于复用已存在的保留候选，避免把同一条记录误建成两条。
- **PRISMA 数据**：`rsx_source action:"prisma"` 返回 `counts`、三阶段 `stages`（含每个理由的计数）、`duplicates`、`pending`、`included`、`flow.nodes/edges` 和完整 `records`。计数由候选记录确定性重算：识别 → 移除重复 → 标题/摘要筛选 → 寻求全文 → 全文不可得 → 全文评估 → 纳入；`maybe` 和未填阶段保留在 `pending`，不会被当成纳入或排除。`complete` 只在没有待处理项且 `consistency.ok` 为真时为真；所有待处理 id 都在 `pending.candidateIds`。
- **状态一致性**：标题/摘要决策改为 `exclude` 或 `maybe` 时自动清除后续阶段决策（事件记录 `cleared`），全文阶段只接受标题与摘要均为 `include` 的候选；写入校验失败会回滚内存中的候选表，不留下幽灵记录。PRISMA 额外返回 `consistency.ok / codes`，并把乱序、排除后仍有后续决策、重复项带决策、孤儿/链式重复和格式错误候选列为不一致；`complete=true` 不掩盖这些警告。
- **可导出**：`rsx_write action:"export"` 写 `PRISMA.json`（机器可读，含 `flow.nodes/edges` 与候选明细）、`PRISMA.md`（中文流程说明 + Mermaid `flowchart`）和 `PRISMA.csv`（候选级决策表），三者都进 `BUNDLE.zip` 和 `REPORT.md` 第 17.2 节。面板审查视图新增“下载 PRISMA”按钮；`GET /api/prisma/:id?format=json|markdown|csv` 返回同一份数据，JSON 默认包含 `prisma` 对象。
- **兼容性**：仍是 16 个工具，只扩展 `rsx_source` 的 `action`、`candidate/source/stage/decision/reason/duplicateOf/reviewer` 参数；schema 仍为 4，九道闸门未改，0.13 的 `import / export / lookup` 与三种参考文献格式保持原行为；不引入 PDF 解析或全文下载。
- **开销**：固定开销 11,899/11,867 → **12,231/12,199** cl100k/o200k（+332/+332，约 +2.8%），增量来自 `rsx_source` 的筛选参数、枚举与说明文字；提示词段未变、工具数未变。

测试从 157 增至 **164**：新增 `screening.test.mjs` 覆盖三阶段写入、schema 4 不变、排除理由校验、重复计数、待处理/乱序警告、非 `include` 清理后续阶段、全文前置条件、失败写入回滚、`consistency`/`complete` 判定、CSV 公式中和、PRISMA 计算与三种渲染、导出文件和 `BUNDLE.zip` 条目；工具测试覆盖 `screen/prisma` 分发与严格 schema，面板测试覆盖 `POST /api/campaign action:"screen"` 和三条 PRISMA 路由。真实验收在既有项目 `rs-a874c2ae`（假设阶段，8 个真实来源）通过已安装面板写入 4 条候选：识别 4、重复 1、去重后 3、标题/摘要排除 1、寻求全文 2、全文不可得 1、全文评估 1、纳入 1、待处理 0；`PRISMA.json` 的 `complete=true`、`consistency.ok=true`，`PRISMA.md` 2,168 字符，`PRISMA.csv` 1,466 字符，链完整性 `chainOk=true`。`npm test` 164/164、`npm run check`、RSI 100 与套件 5/5 通过；devkit `verify` run `20261118-180332-8ghv6g`（164 tests / 9,991 ms），`trend` health 100、pass rate 100%、最新耗时 Δ-7.6%。设计与标准对照见 [候选筛选与PRISMA-0.14.0](docs/候选筛选与PRISMA-0.14.0.md)。

---

## 0.13.0：参考文献互操作，从 Zotero 到可投稿引用表

一篇真实论文的第一道摩擦通常不是写作，而是“手里已有几百条 Zotero 记录，插件只收 BibTeX”。0.13 补的是**题录进出**这一层：CSL-JSON、RIS、BibTeX 三种最常见导出都能直接进台账；一个 DOI 能变成可登记的来源草稿；导出研究包会同时给出三种引用文件，报告里有一张按台账顺序生成、标出手稿未引用项的参考文献表。它不试图替代 Zotero，也不做 PDF 全文解析。

- **CSL-JSON**：Zotero 的“导出 → CSL JSON”原样可导入，支持数组与 Zotero 的 `{items:[…]}` 包装；映射 `article-journal/book/report/dataset/preprint/webpage` 等类型到台账 `kind`，保留作者、年份、期刊/出版社、DOI、URL、摘要/注释，单字段有长度上限并剥离 HTML。
- **RIS**：支持 Zotero、EndNote、Rayyan 等常见的 `TY/AU/TI/JO/PY/DO/UR/AB/ER` 标签、多记录与续行；未知类型落到 `other`，不伪装成论文。
- **统一导入**：`rsx_source action:"import"` 接受 `data`（或旧参数 `bibtex`）和 `format:"auto" | "bibtex" | "csl-json" | "ris"`；按 DOI、其次标题去重，最多 100 条，逐条返回 `imported / items / skipped`，并写 `references.imported` 事件。旧 `sourceImportBibtex` 保持原行为。
- **DOI 精查**：`rsx_source action:"lookup" {doi}` 走 Crossref 单条记录接口，校验 DOI 形状、拒绝返回 DOI 不一致的响应、404 报 `not_found`；返回 `candidate` 和可直接展开到 `action:"add"` 的 `sourceDraft`。检索仍由 `rsx_search` 负责，DOI 只是“已知目标”的快捷入口。
- **交付物**：导出目录与 `BUNDLE.zip` 新增 `references.csl.json`、`references.ris`；`REPORT.md` 新增第 17 节格式化参考文献表和第 17.1 节文件说明。引用覆盖从手稿里的 `[[src:S-0001]]` 解析，未引用来源保留并标注，不静默删除。
- **面板**：审查视图除 `references.bib` 外新增 CSL-JSON、RIS 下载；`GET /api/references/:id?format=…` 与 `/api/bibtex/:id?format=…` 返回同一渲染结果。
- **兼容性**：仍是 16 个工具，不新增工具、不改 schema 版本、不改九道闸门；只扩展 `rsx_source` 的 `action` 枚举与 `data/format` 参数。固定开销 11,748/11,718 → **11,899/11,867**（+151/+149，约 +1.3%），增量全部来自 `rsx_source` schema（+150）与说明文字；提示词段未变。

测试从 147 增至 **157**：`references.test.mjs` 覆盖 CSL 数组/`items` 包装、RIS 续行、格式探测、渲染往返、去重、引用覆盖与 DOI 成功/404；工具测试覆盖 `import/export/lookup` 的分发，面板测试覆盖两个新下载路由，导出测试检查三个引用文件和报告章节。真实验收在已发布项目 `rs-f7edf967` 上触发导出：CSL-JSON 11 条、RIS 11 条、报告显示“11 条 / 手稿引用 9 / 未引用 2”，`BUNDLE.zip` 同时含三种引用文件；重载前 `/api/references/...` 为 404，重载后为 200。`npm test` 157/157、`npm run check`、RSI 100 与套件 5/5 通过；devkit `verify` run `20261118-170629-7rro7p`（157 tests / 6,277 ms），`trend` health 100、duration Δ-25.6%。设计与标准对照见 [参考文献互操作-0.13.0](docs/参考文献互操作-0.13.0.md)。

---

## 0.12.0：把九阶段做成可回看的飞轮

0.11 解决了“下一步该干什么”，但总览仍是一条线性阶段条：能看见当前阶段，看不见它和闸门、暂停、导出、历史轮次的关系。0.12 把总览改成一张飞轮工作台，所有数字都来自当前项目的真实状态，不引入独立评分或估算值。

- **九阶段环**：`定题 → 测绘 → 假设 → 设计 → 执行 → 分析 → 写作 → 评审 → 发布`。已完成阶段打勾，当前阶段高亮；当前闸门失败时，当前节点直接变红并显示 `!`，即使该闸门尚未写进 `state.gates`，也使用接口返回的实时 `gate` 判断。
- **右侧状态栏**：顺序固定为当前阶段/闸门 → 开放暂停（人工检查点 / 等待输入 / 未映射）→ 四个真实指标（闸门、证据、来源、事件）→ 下一步动作（可复制调用）。发布阶段全部闸门通过时，下一步卡只保留“导出研究包”的说明；真正的导出按钮统一放在下方动作区。
- **五动作区（0.12 版）**：`导出研究包 / 查看台账 / 查看审查 / 查看报告 / 归档` 同一行渲染，全部使用原生 `<button>`。台账、审查始终可用；报告从 `write` 阶段起可用；导出与归档仅在发布闸门 `gateOk`、无开放暂停、未归档且父级不在 `busy` 时可用。不可用按钮带 `disabled`、`aria-disabled` 与具体 `title` 原因（发布闸门、暂停、写作阶段、处理中、已归档），禁用时不挂 `onClick`；归档保留父级二次确认。同一组条件还在 `/api/export/:id` 与归档 action 的服务端路由复核，被拒绝时返回 409 `action_blocked` 与 `detail.reason`，直接调用 API 不再能绕过按钮。**1.1 起归档改为独立生命周期动作**：不再要求发布闸门、不受暂停阻断，并可用 `unarchive` 恢复；导出的发布闸门保持不变。
- **真实轮次轨迹**：只取 `state.cycles` 的最后 4 条，显示 `K-xxxx`、决策、时间、目标、观察；没有轮次时展示空状态和 `rsx_campaign action:"cycle"` 的写入方式，不补造历史。
- **可回退**：旧线性总览保留为 `OverviewLinear`；`Overview` 只有一行 `return h(OverviewFlywheel, props)`，需要回退时换成 `h(OverviewLinear, props)` 即可。
- **兼容性**：不新增工具、不改 schema、不改闸门、不动 token 固定开销；服务端动作门复用现有策略与状态字段，`rsx_*` 工具与状态格式保持 0.11 兼容。

真实验收使用两个现有项目：`rs-f7edf967`（发布、第 2 圈、9/9 阶段、12/12 闸门、4 证据、11 来源；动作验收前 79 事件，完成导出/报告点击后 82 事件，服务端门复测后 83 事件）与 `rs-a874c2ae`（假设阶段、第 2 圈、2/9 阶段、0/1 闸门、8 来源、25 事件，旧进程绕过复测后 26 事件、`LP-0002` 等待输入）。环形节点、暂停卡和轨迹条数与接口返回的 `stage`、`gate`、`loopPauses`、`cycles` 一致；五个动作的六种状态（完成、暂停、写作前、发布阻断、已归档、写入中）均有可用性断言。窄屏在内容宽 520–600px 时单列、KPI 两列、圆环最大 270px；动作行在 700px 以下改为三列。截图见 [`1440 完成态`](_artifacts/v012-flywheel-complete-1440.png)、[`1440 暂停态`](_artifacts/v012-flywheel-paused-1440.png)、[`动作区完成态`](_artifacts/v012-actions-complete-1440.png)、[`动作区暂停态`](_artifacts/v012-actions-paused-1440.png)、[`窄屏`](_artifacts/v012-flywheel-mobile-520.png)。

设计与数据映射见 [研究飞轮-0.12.0](docs/研究飞轮-0.12.0.md)。

---

## 0.11.0：把下一步接成宿主循环闸门

0.10 的 `next` 只读：它告诉你下一步调用什么，但不会阻止你在缺输入、缺人工批准或遇到未映射检查时继续猜。0.11 补的是**每轮开始前的门**：宿主调用 `rsx_campaign action:"loop"`，先验完整性、阶段预算、当前闸门和 `maxCycles`，再把主推荐分成 `continue / pause / stop / ready`。暂停不是建议，而是写入事件链的状态；人工不补齐，`resume:true` 会被拒绝。

| 新增能力 | 入口 | 行为 |
| --- | --- | --- |
| 循环前置检查 | `rsx_campaign action:"loop"` | 每次返回 `checks.integrity`、`checks.budget`、`checks.gate`、`checks.prereg`、`checks.cycles`；停止优先于暂停 |
| 暂停记录 | 自动 | 主推荐带 `needsInput`、`human` 或新增的 `unmapped` 时写 `LP-xxxx` 行与 `loop.paused` 事件，重复检查不重复写 |
| 显式恢复 | `action:"loop" resume:true` | 阻断计划未变化时 `resumeRejected:true` 且不写；条件解除后才写 `loop.resumed`，`pause.status` 变为 `resumed` |
| 未映射检查 | `unmapped:true` | 规划器没有具体配方的闸门/程序检查不再被静默执行，循环按 `unmapped_gate` 暂停 |
| 人工边界 | 自动 | 不调用推荐工具、不写审批、不豁免、不改预注册；`loop` 只做检查与暂停/恢复记录 |

**兼容性**：仍是 16 个工具，只扩展 `rsx_campaign` 的 `action` 枚举、`resume`/`reason` 参数和输出；不新增 schema 版本，不改变九道闸门。`state.loop` 与 `state.loopPauses` 是向后兼容的新字段，旧项目首次暂停时才写入。固定开销 11,537/11,505 → **11,748/11,718**（+211/+213，约 +1.8%），增量来自 `rsx_campaign` schema 与循环协议提示词。设计与边界见 [宿主循环-0.11.0](docs/宿主循环-0.11.0.md)。

---

## 0.10.0：把“下一步做什么”变成可执行计划

0.8 记录研究程序，0.9 能查文献，但“现在该调用哪个工具”仍要 agent 从长长的闸门清单里自己拼。0.10 补控制层：`rsx_campaign action:"next"` 读取当前阶段、闸门与程序缺口，返回**一个主推荐**和少量备选；每个推荐带精确参数、`why`、`unblocks`、是否需要人工填写、是否人类检查点。它只规划，不执行、不写台账、不自动批准。

| 新增能力 | 入口 | 行为 |
| --- | --- | --- |
| 单一主推荐 | `rsx_campaign action:"next"` | 按阻断检查排序，返回 `primary` + 最多 7 个 `steps`；每个是可直接调用的工具名与参数 |
| 闸门到工具的映射 | 自动 | 覆盖 scoping→release 的检查代码；survey 先检索再登记，review 展开 `program_complete` 的具体缺口 |
| 停止优先 | 自动 | 完整性失败、预算超限、预注册晚于数据、循环预算耗尽、`stop`/`escalate` 决策都先返回 `stop{blocked,escalate,reason}`，不再给后续 TODO |
| 人类检查点 | 自动 | 双重用途、人工批准、AI 声明、预注册时序等标 `human:true`，不自动代签 |
| 面板下一步卡 | 总览 | 显示主推荐、阶段或“可交付/停止”、参数摘要与“复制调用”；截图见 [0.10 面板](_artifacts/real-0.10/panel-next-1440.png) |

**确定性**：相同状态与闸门输入得到相同计划；不读时钟做决策，不调用模型，不联网。`next` 本身是只读的——验收里连续调用前后事件数保持 `1 → 1`。

**兼容性**：仍是 16 个工具，不新增工具、不改 schema 版本与九道闸门；只扩展 `rsx_campaign` 的 `action` 枚举和输出。固定开销 11,422/11,390 → **11,537/11,505**（+115/115，约 +1.0%），增量来自 `rsx_campaign` schema（+57）与提示词补充（+57）。设计与边界见 [下一步规划器-0.10.0](docs/下一步规划器-0.10.0.md)。

---

## 0.9.0：把文献检索变成宿主侧可执行能力

0.8 能记录研究程序和检索协议，但“查”本身仍在套件外。0.9 的第一步补上执行层：`rsx_search` 一次调用查询 OpenAlex 与 Crossref，规范化并去重后返回候选。它仍然只读——不自动写台账、不下载全文、不把检索结果当成已验证证据。

| 新增能力 | 工具入口 | 检查/产物 |
| --- | --- | --- |
| 双源实时检索 | `rsx_search` | OpenAlex + Crossref，单源超时/失败回退，返回 `counts`/`warnings`/`elapsedMs` |
| 题录规范化 | 自动 | 标题/年份/作者/DOI/URL/期刊/摘要/引用数/类型；DOI 大小写与 URL 前缀归一 |
| 跨源合并去重 | 自动 | DOI 优先，标题+年份回退；`providers`/`providerIds` 取并集 |
| 外部文本边界 | 自动 | 去标记/实体、限长（标题 400、摘要 2,000、作者 12）；只作为数据，不作为指令 |
| 结构化失败 | 工具层 | `retrieval_timeout` / `retrieval_failed` / `invalid_input`，带 `repair`，不伪造候选 |

**兼容性**：不改变九道闸门、领域档案或 schema 版本；`rsx_search` 是第 16 个工具。固定开销从 11,002/10,969 增至 **11,422/11,390**（+420/421，约 +3.8%），增量主要是第 16 个 schema（372/372）与提示词补充。设计与边界见 [文献检索-0.9.0](docs/文献检索-0.9.0.md)。

---

## 0.8.0：把“多智能体在跑”变成可复核的研究程序

0.7 补的是“查过什么、换设定是否稳健”。0.8 补的是长期研究程序本身的结构：它计划了什么、从哪些视角看、何时停、假设如何比较、质量按什么标准评分、冲突证据如何处置。

| 新增能力 | 工具入口 | 检查/产物 |
| --- | --- | --- |
| 计划与视角 | `rsx_program action:"plan"` / `"perspective"` | 问题优先级/负责人/来源覆盖；视角→来源；`PROGRAM.md`、报告 `3.2` |
| 自治策略与循环 | `rsx_program action:"autonomy"` / `"cycle"` | `maxCycles` 硬预算、停止/升级/人类检查点；act→observe→decide 日志 |
| 假设锦标赛 | `rsx_program action:"match"` / `"rank"` | 两两判断、确定性 Elo 排序；review 要求至少一场 hypothesis/竞争 claim 比赛 |
| 质量评分 | `rsx_program action:"quality"` | 六维 rubric（事实/引用/完整性/来源质量/工具效率/局限），总分 ≥0.7 |
| 矛盾台账 | `rsx_program action:"contradiction"` | `open`/`resolved`/`explained`；开放矛盾阻止程序完整 |
| 程序完整性闸门 | 自动 | schema-4 `review` 闸门 `program_complete`；审计 `program_incomplete`（major） |

设计来源包括 Anthropic 的 orchestrator-worker 与 LLM-as-judge rubric、Co-Scientist 的锦标赛演化、Kosmos 的结构化世界模型、PaperQA2 的矛盾检测、STORM 的多视角提问与 AI Scientist-v2 的端到端循环。它们只作为结构依据；0.8 不运行检索、模型或实验，也不把这些论文的效应量当作本项目的效果；0.9 才加入只读的题录检索。完整设计、验收与边界见 [研究程序-0.8.0](docs/研究程序-0.8.0.md)。

**兼容性**：新建项目是 schema 4，`program_complete` 在 review 阻断；schema 1–3 项目只作 advisory，旧对象哈希与分数不受影响。闭环评分新增 `program` 维（13 维），schema 1–3 项目该维返回一条 advisory。

---

## 0.7.0：把“查过了”变成可复核的检索与稳健性

0.6 补的是“证据为什么支持结论”。0.7 继续补两个常被一句“已检索/结果稳健”带过的缺口，并把预注册时序变成可失败检查：

| 新增能力 | 工具入口 | 检查/产物 |
| --- | --- | --- |
| 检索协议 | `rsx_campaign action:"searchLog"`；`action:"search"` 兼容否证检索 | survey `search_protocol`；审计 `search_protocol_missing` / `search_protocol_invalid` / `search_counts_missing`；`SEARCH.md`、报告 `3.1` |
| 敏感性/稳健性 | `rsx_claim action:"sensitivity"` | analyze `sensitivity` / `sensitivity_traces`；审计 `sensitivity_missing` / `sensitivity_untraced` / `sensitivity_trace_unresolved`；`SENSITIVITY.md`、报告 `4.1` |
| 预注册在运行之前 | 沿用 `rsx_campaign action:"prereg"` | execute `prereg_before_run`；审计 `prereg_after_run` |
| 引文否定/数字极性 | `rsx_review action:"entailment"` | 审计 `claim_evidence_negation`（major）/ `claim_evidence_number`（minor） |

检索记录字段：`kind`（database/disconfirming/snowball/grey/other）、`database`、`query`、`dateFrom`、`dateTo`、`hits`、`screened`、`included`、`notes`。计数必须满足 `hits >= screened >= included >= 0`；查询至少 3 个字符。缺计数不阻断（滚雪球检索可能没有命中数），但审计会提示 `search_counts_missing`。

敏感性字段：`claim`、`name`、`method`、`specification`、`result`、`direction`（consistent/attenuated/reversed/inconclusive）、`trace`、`notes`。`trace` 可选，但给了就必须能解析到 run 指标或来源。

**兼容性**：新建项目是 schema 3，0.7 新检查阻断；0.6 项目是 schema 2、更早项目是 schema 1，新检查降为 advisory，旧检查保持原契约。`auditSubject` 只在 `searchLog`/`sensitivity` 非空时纳入新字段，旧项目对象哈希与既有审计不受影响。设计与边界详见 [研究闭环-0.7.0](docs/研究闭环-0.7.0.md)。

---

## 0.6.0：从“有证据”到“证据为何支持结论”

0.5 解决的是“证据、数字、预注册、领域协议有没有被记录”。0.6 补的是记录之后的推理与治理缺口：

| 新增能力 | 工具入口 | 检查/产物 |
| --- | --- | --- |
| Toulmin warrant + 反向检索 + certainty | `rsx_claim action:"update"` | hypothesis/analyze 闸门；审计 `claim_warrant` / `claim_counter_evidence` / `claim_certainty` / `claim_contested_ignored` |
| 来源独立性、lineage、设计、偏倚风险、捕获回执 | `rsx_source` 字段或 `action:"update"` | survey 闸门 `source_independence` / `source_rob`；审计 `source_lineage_missing`、`source_rob_note` |
| 预注册锁定哈希与修订 | `rsx_campaign action:"prereg"`，改动时 `amend:true` + `reason` | `prereg.lockedHash` / `prereg.hash` / `amendments`；审计 `prereg_drift` / `prereg_amended` / `prereg_after_execution` |
| 评审包与词面蕴含筛查 | `rsx_review action:"packet"` / `"entailment"` | `REVIEW_PACKET.md`；审计 `claim_evidence_weak` / `claim_evidence_untraceable` |
| 人工批准 | `rsx_gate action:"approve"` | 绑定 `auditSubjectHash`；证据变化后 `approval_stale`，release 闸门要求重新批准 |
| 结构化 waiver | `rsx_gate action:"waive"` | 必须带理由、批准人、到期日；完整性/签名/独立性/声明/上游闸门/人工批准类检查不可豁免 |
| 可执行复现包 | `rsx_write action:"repro"` / `"export"` | `REPRO.md`、`repro.json`、`checksums.txt`；命令、种子、负对照、环境锁、stdout、期望指标 |
| AI/人类贡献矩阵 | `rsx_write action:"declaration"` 的 `contributions` | `AI_CONTRIBUTION.md`；声明与 release 检查 |
| 标准生命周期 | `rsx_domain action:"list"` | 每条标准带 `status` / `reviewedAt`，`DOMAIN.md` 显示复核日期，避免把过期清单当当前标准 |
| 组合视图与探索图 | `rsx_campaign action:"portfolio"` / `"graph"` | 跨项目分数/等级/审计新鲜度/告警/完整性；claim→source/run/number 边 |
| 跨领域回归 | `npm run rsi:suite` | 通用 + finance/ai/medicine/industrial 五套夹具，输出 `_artifacts/rsi-suite.{json,md}` |

兼容性：新建项目是 schema 2，上述检查按阶段阻断；0.5 及更早项目是 schema 1，新检查降为 advisory（审计 major/minor），不会因为升级突然卡住已发布项目。旧项目可以逐步补字段，补完后由同一条 `rsx_gate action:"advance"` 重新验证。设计与边界详见 [研究闭环-0.6.0](docs/研究闭环-0.6.0.md)。

---

## 安装

要求 DSH `>= 0.2.2-rc.5`、Node `>= 22`。

本地开发安装（推荐）：

```powershell
# 1) 把包链接进当前 profile
cd "$env:DSH_HOME\profiles\desktop"
pnpm add "link:F:\dsh插件创造\workspace\dsh-research-suite"
```

```jsonc
// 2) 在 profile 的 package.json 里把 bundle 加进列表
"dsh": {
  "profile": {
    "bundles": [
      // …
      "dsh-research-suite"
    ]
  }
}
```

重启 DSH（或重新加载该 bundle）后，工具栏出现 **科研套件**，同时注册十六个 `rsx_*` 工具。若通过插件市场发布，名称同为 `dsh-research-suite`，版本 `1.1.0`。

配置写在 profile 的 `cordis.patch.yml`，也可以完全不管，走面板设置：

```yaml
- id: dsh-research-suite
  name: dsh-research-suite
  config:
    defaultTier: M   # S | M | L | XL
    language: zh     # zh | en
```

数据目录默认 `$DSH_HOME/research-suite`，每个项目一个 `rs-[0-9a-f]{8}` 子目录；面板设置里可以改 `dataDir`。

---

## 九道闸门

闸门不是提示词，是代码。`rsx_gate action:"check"` 返回 `{ok, checks, blocking}`，`advance` 在失败时抛 `gate_blocked` 并带上完整检查表。

| 阶段 | 通过条件（摘要） |
| --- | --- |
| scoping | 研究问题 ≥12 字、边界 ≥12 字、成功判据 ≥10 字、档位合法、世界模型记录问题 |
| survey | ≥8 条来源、≥2 条一手来源、≥1 条 2023+、抓取正文（有内容哈希）、一次**证伪检索**、≥2 个覆盖域；schema 2 还要求 ≥2 条声明独立的 primary 来源、每条 primary 有偏倚风险评估；schema 3 还要求至少一条可复核检索记录（查询 + 合法计数顺序） |
| hypothesis | 明确证伪条件、终止条件、预测观察、主指标与单位、≥2 条支持证据、最近邻工作查新；schema 2 还要求 warrant 与反向证据检索 |
| design | 预注册：假设 id、指标、样本量、分析计划、停止规则、随机种子、负对照、环境锁定；schema 2 还要求锁定哈希与 alpha/power（统计参数为 advisory） |
| execute | ≥1 次成功运行、种子、指标、真实跑过的负对照、完整命令；schema 2 还要求至少一份 stdout 工件；schema 3 还要求首次运行不早于预注册锁定时间 |
| analyze | 数字有 trace、trace 能解析、数值与运行指标一致（1e-6）、≥1 个不确定性、所有断言已定状态；schema 2 还要求 warrant、certainty、反向检索，反证存在时不能仍标 supported；schema 3 还要求至少一条敏感性记录，且给出的 trace 可解析 |
| write | 手稿 ≥200 字、至少一个 `{{N-0001}}`、至少一个 `[[src:S-0001]]`、无未知引用、无游离数字、图有工件+代码+数据 |
| review | 两份评审、至少一份红队对抗评审、无 reject、无未解决阻断问题、断言均已定状态、**最近一次自动化审查通过、未过期且 HMAC 验签通过**；schema 4 还要求 `program_complete`（计划覆盖、视角、自治策略、循环、锦标赛、六维质量 ≥0.7、无开放矛盾） |
| release | 上游闸门全过、AI 声明+水印+模型+人工复核人、`world.safety.dual_use = "pass"`、预算未超、无争议断言、事件链与 `stateHash` 完整；schema 2 还要求新鲜人工批准、AI/人类贡献矩阵、可复现包与合法 waiver；schema 5 还要求 `stewardship`（许可、数据/代码可用性、利益冲突、伦理、CRediT 贡献者） |

设计要点：**闸门只挡状态，不评判文笔**。它检查的是“能不能被机器复核”，而不是“结论是否正确”——正确性由证据、负对照和评审人负责。

---

## 领域档案（0.5.0）

通用九闸门检查“有没有证据、有没有预注册、数字能否追溯”，但检查不出“金融回测有没有样本外”“医学综述有没有 PRISMA 计数”“工业测量系统有没有 GR&R”“AI 有没有污染检查”。领域档案把这些协议字段映射到阶段，做成**可执行的对齐清单**：

| 档案 | 字段 | 标准/清单锚点 | 角色化评审 | 发布后信号 |
| --- | ---: | --- | --- | --- |
| `finance` | 24 | SEC Marketing Rule 206(4)-1、GIPS 2020、Deflated Sharpe、PBO | quant + risk | 回撤、夏普衰减、换手、成本滑点 |
| `ai` | 26 | NIST AI RMF 1.0、NIST AI 600-1、ISO/IEC 42001、EU AI Act、NeurIPS checklist、Model Cards | ml + safety | 精度漂移、数据漂移、安全事件、评测回退 |
| `medicine` | 35 | PRISMA 2020、CONSORT 2025、STROBE、RoB 2、GRADE、ICH E6(R3)、TRIPOD+AI、CONSORT-AI | clinical + statistics | 不良事件、方案偏离、数据质量、安全信号 |
| `industrial` | 32 | ISO/IEC 17025、IATF 16949、AIAG MSA、ISO 13849-1、IEC 61508、ISO 9001 | engineering + quality | SPC 告警、校准到期、缺陷率、安全事件 |

工作方式：

```text
rsx_domain action:"set" domain:"finance" values:{...}
  → 只更新传入字段；首次切换档案会清空旧档案值
rsx_domain action:"check" stage:"design"
  → 返回该阶段字段检查、规则检查、角色/监测状态
rsx_gate action:"check"
  → domain_<profile>_<field> / domain_<profile>_<rule> 作为 blocking 检查进入闸门
```

- **字段不是提示词**：`required` 字段缺失会在对应阶段阻断 `advance`；`N/A — 具体原因`（原因至少 6 字）可豁免真正不适用的项，理由会保留在 `DOMAIN.md` 与审计里。
- **两条跨字段规则**：金融 `in_sample_end < oos_start`；医学 `prisma_included <= prisma_identified`。规则只在两个值都有效时求值，N/A 不会误伤。
- **条件适用性（0.5）**：字段/标准可带 `when`。医学综述才要求 PRISMA 字段，RCT 才要求随机化/盲法；工业 DOE 才要求因子/水平/随机化。条件不满足时不阻断、不显示为待补；`DOMAIN.md` 标明标准是“适用”还是“参考”。
- **角色分离与独立性（0.5）**：review 阶段要求每个档案的两个角色各至少一条 `rsx_gate action:"review" role:"..."` 记录；新评审要带 `affiliation`、`conflict`、`independent`，同一评审人不能覆盖两个角色。旧版评审保持兼容。
- **监测判定（0.5）**：release 要求计划、负责人、频率与无告警；发布后用 `rsx_campaign action:"monitor"` 登记 `metrics` 与 `observations`，按 target/tolerance/min/max 判定，越界进入 `alert`，可 `reopen:true` 回到 analyze。信号没有指标、指标没有观测会作为覆盖缺口进入闭环评分。
- **口径**：它是“标准/清单对齐”的记录结构，不声称认证、法律合规或临床合规；标准文本与适用性由领域评审人确认。

新增一个领域只需在 `lib/domains.js` 加一个 profile（字段/阶段/条件/规则/角色/监测），再加模板与测试；`domainChecks`、审计、面板、导出不需要改分支。详见 [研究闭环-0.5.0](docs/研究闭环-0.5.0.md)。

---

## 研究闭环与 RSI（0.5.0）

`rsx_campaign action:"evaluate"` 对当前项目计算 **13 维工程成熟度**；`rsx_write action:"export"` 写出 `LOOP.md` 并在 `REPORT.md` 第 19 节渲染同一结果。

| 维度 | 权重 | 维度 | 权重 |
| --- | ---: | --- | ---: |
| 问题与边界 | 6 | 可复现执行 | 13 |
| 证据测绘 | 10 | 数字与引文追溯 | 10 |
| 可证伪假设 | 10 | 自动化审计 | 10 |
| 预注册设计 | 7 | 独立评审 | 9 |
| 领域适用性 | 7 | 发布后监测 | 8 |
| 发布声明 | 6 | 台账完整性 | 4 |

- 等级：≥90 且监测满分/评审 ≥80% 为 **L4 可审计闭环**；≥78 **L3 可复核研究**；≥55 **L2 证据化草稿**；>0 **L1 立项**。
- 首次评估写入 `loopBaseline`；后续评估带 `previousScore`/`delta`，`loopEvaluations` 保留最近 50 次。评分只检查工程可复核性，不判断结论正确性。
- 自我改进前提：新鲜验签审计、两名独立评审人、监测有指标/观测/无告警/无覆盖缺口、分数 ≥85。它是“可以开始比较候选改动”的门槛，不是自治声明。
- `npm run rsi` 用确定性夹具走完整九阶段 + 抽取 + stdout + 独立评审 + 审计 + 监测，输出 `_artifacts/rsi-report.md` 并与 `_artifacts/rsi-baseline.json` 比较；分数下降退出码 1。当前基线 **100/100，L4，RSI 前提满足**。
- `npm run rsi:suite` 把同一套闸门跑在 general + 四个领域夹具上，输出 `_artifacts/rsi-suite.{json,md}`；**5/5 达到 100/100**。它验证跨领域闭包，不替代真实研究。

```powershell
rsx_campaign action:"evaluate"
rsx_write action:"export"
npm run rsi
npm run rsi:suite
npm run rsi -- --update-baseline   # 需要人工确认
```

详见 [研究闭环-0.5.0](docs/研究闭环-0.5.0.md)。

---

## 十六个工具

| 工具 | 作用 |
| --- | --- |
| `rsx_campaign` | 建项目、查状态、写世界模型（实体/事实/失败/覆盖/查新/安全）、记录证伪检索、预注册、预算、发布后监测（指标/观测/告警/回退）、13 维闭环评估、归档；`action:"next"` 返回确定性下一步主推荐；`action:"loop"` 是每轮前置闸门（暂停 `LP-xxxx`、`resume:true` 恢复），`update` 可设 `numbersAllowlist` 放行方法常量；1.0 新增 `stewardship`（FAIR/CRediT）、`migrate`（显式迁移+备份）、`doctor`（只读体检）、`reindex`（只重建索引） |
| `rsx_search` | 实时题录检索：OpenAlex + Crossref，规范化、DOI 去重、跨源合并；单源失败回退，双源失败报错；只读，候选需人工检查后登记 |
| `rsx_domain` | 领域档案：`list/get/check/set`；四个领域、字段完整性、阶段检查、角色与监测状态；`set` 可只更新传入字段，切换档案会清空旧值 |
| `rsx_template` | 11 个任务模板 + 3 个方法协议；`apply` 直接建项目并返回可粘贴提示词；带领域的模板自动启用档案 |
| `rsx_source` | 登记论文/数据集/注册表/报告，抓取正文存为内容寻址工件；`import` 解析 BibTeX/CSL-JSON/RIS，`export` 导出 BibTeX/CSL-JSON/RIS，`lookup` 按 DOI 精查，`screen` 记录标题/摘要/全文三阶段候选决策与排除理由，`prisma` 返回 PRISMA 2020 流量计数 |
| `rsx_claim` | 断言与假设；假设必须写证伪条件、终止条件、预测观察、指标 |
| `rsx_evidence` | 把断言连到来源/运行/工件，关系 `supports/refutes/context`，可带原文引文 |
| `rsx_run` | 记录真实命令、退出码、种子、指标、stdout 工件、负对照；`action:"attach"` 可把后补的 stdout 挂到已有运行（**只记录，不代跑**） |
| `rsx_number` | 数字登记与 trace 校验；写入时即校验与运行指标一致，返回 `{{N-0001}}` |
| `rsx_extract` | Elicit 式抽取矩阵：source × dimension，带 value/quote/locator/confidence，输出 `MATRIX.md` / `matrix.csv` |
| `rsx_program` | 研究程序：`plan`（问题/优先级/负责人/来源覆盖）、`perspective`、`autonomy`（maxCycles/停止/升级/人类检查点）、`cycle`（act→observe→decide）、`match`/`rank`（确定性 Elo）、`quality`（六维 rubric）、`contradiction`（open/resolved/explained）、`list`（完整性检查） |
| `rsx_review` | 自动化审查：引用、引文、数字、图、预注册、负对照、抽取覆盖、领域字段/角色、warrant/反向检索/来源独立性/偏倚/批准/复现包；`packet` 生成评审包，`entailment` 做词面筛查 |
| `rsx_artifact` | 登记数据集/代码/环境/补充材料为内容寻址工件，带 role 与 description |
| `rsx_figure` | 图 + 代码 + 数据 + 环境/运行/描述作为一个溯源单元；缺代码或数据会挡写作闸门 |
| `rsx_gate` | check / advance / back / history / review / approve / waive / waivers / approvals；review 闸门要求新鲜、通过且验签成功的审查，领域档案要求角色化评审（机构/COI/独立性），批准绑定审查对象哈希，waiver 带到期日且不可关掉受保护校验 |
| `rsx_write` | 手稿、AI 声明、渲染、导出（REPORT.md、PROGRAM.md、SEARCH.md、SENSITIVITY.md、DOMAIN.md、LOOP.md、REVIEW_PACKET.md、REPRO.md、repro.json、checksums.txt、AI_CONTRIBUTION.md、STEWARDSHIP.md、MANIFEST.json、references.bib、references.csl.json、references.ris、PRISMA.json、PRISMA.md、PRISMA.csv、MATRIX.md、AUDIT.md、provenance.json、ro-crate-metadata.json、BUNDLE.zip） |

工具输出统一 `{ok:true, …}` 或 `{ok:false, code, error, repair, detail}`；`repair` 是给 agent 的下一步动作，不是给人看的错误页。

### 自动化审查的边界

审查只检查“能否被机器复核”：引用是否解析到已捕获来源、引文是否真的出现在捕获正文、数字是否等于产生它的运行指标、图是否带代码与数据、预注册是否仍描述实际执行的分析、领域字段/角色/监测是否到位。它**不判断结论是否正确**；`blocking` 才挡闸门，`major/minor` 交给人工评审。审查对象哈希不包含阶段、声明、世界模型、闸门、评审与审查本身，所以发布时的声明变更不会让审查失效；但来源、手稿、断言、图或**领域字段值**的改动会让它过期。

---

## 模板

11 个任务模板：文献综述 `lit-review`、临床试验 `clinical-trials`、机器学习管线 `ml-pipeline`、健康趋势 `health-trends`、论文幻灯 `paper-slides`、访谈综合 `interview-synthesis`、开源评估 `oss-eval`、量化回测 `quant-backtest`、学术主页 `academic-site`、尽职调查 `due-diligence`、工业试验设计 `industrial-doe`。

3 个方法协议：复现 `replicate`、消融 `ablation`、对抗评审 `review`。

模板只填**结构**（阶段、交付物、闸门提示、占位符），不编造领域结论；`{topic}`、`{data}`、`{paper}` 等占位符未填时保留 `[TOPIC]` 形式，避免静默出错。

---

## 面板

侧边栏 **科研套件**（顺序 26）：

- **总览**：项目状态、九阶段步进条、当前闸门、**下一步卡**（主推荐/可交付/停止、参数摘要、复制调用）、预算条、完整性、事件/工件计数、13 维闭环卡片（分数/等级/缺口/一键评估）、一键复制“继续研究”提示词、导出、归档
- **领域**：选择/切换档案，字段完整度、条件不适用项、标准清单、角色化评审状态、发布后监测计划与信号
- **台账**：断言、来源、数字、运行、证据、图、工件七个表；数字直接显示 trace 与不确定性，工件显示角色/字节/说明
- **审查**：最新结论与 blocking/major/minor 计数、findings 表、来源×维度矩阵、运行审查、下载 `references.bib` / `references.csl.json` / `references.ris` / `PRISMA.json`
- **健康**：`doctor` 全局检查与逐项目链/审计/治理/写锁/schema 状态、待迁移数量、重建索引、显式迁移（带确认与备份路径）
- **模板**：任务/方法筛选，填占位符后直接建项目并给出提示词
- **报告**：渲染 `REPORT.md`（19 节，含领域档案、自动化审查、证据矩阵、格式化参考文献、PRISMA 候选筛选流程、发布后监测、闭环评估、溯源性文件清单），下载 Markdown、AI 声明、导出研究包
- 中文/英文切换，浅色/深色跟随系统，1440 / 1024 / 375 三档无横向溢出

面板与工具读写同一份状态，HTTP 路由挂在 `/dsh-research-suite`：

- 仅回环：`Host` 必须是 `127.0.0.1` / `localhost` / `[::1]`
- 写操作要求 `x-dsh-research-suite: 1`，并校验同源 `Origin`
- 请求体上限 2 MB，路径 id 严格匹配，拒绝穿越
- 无鉴权 cookie，不监听非回环地址
- 1.0 新增 `GET /api/doctor`、`GET /api/stewardship/:id`、`POST /api/reindex`、`POST /api/campaign action:"stewardship"|"migrate"`；`/api/state` 带 `apiVersion/pluginVersion/schemaVersion`
- 1.1 新增 `GET /api/portfolio`、`POST /api/campaign action:"unarchive"`；`/api/state` 带 `archivedCampaigns/archivedCount`

---

## 数据与完整性

```
$DSH_HOME/research-suite/
  index.json                     # 项目索引
  settings.json                  # 面板设置
  signing-key.json               # 本机审查签名密钥（0600，永不导出）
  campaigns/rs-c537de08/
    state.json                   # 项目状态（断言/来源/运行/数字/评审/闸门历史 + stateHash）
    .write.lock                  # 跨进程写锁（短生命周期）
    events.jsonl                 # JSONL: seq, ts, kind, actor, payload, prev, hash
    artifacts/<64hex>            # 内容寻址（id 为 sha256:<64hex>）
    backups/backup-*.zip         # 迁移前 state + events + manifest（最多 20 份）
    exports/REPORT.md PROGRAM.md SEARCH.md SENSITIVITY.md DOMAIN.md LOOP.md REVIEW_PACKET.md REPRO.md repro.json checksums.txt AI_CONTRIBUTION.md STEWARDSHIP.md MANIFEST.json campaign.json ledger.jsonl declaration.md references.bib references.csl.json references.ris PRISMA.json PRISMA.md PRISMA.csv MATRIX.md matrix.csv AUDIT.md provenance.json ro-crate-metadata.json BUNDLE.zip
```

- 事件哈希：`sha256(prev | ts | kind | actor | canon(payload))`，genesis 固定，重启后继续链
- 状态哈希：`stateHash = sha256(canon(state 去掉 stateHash/stateHashVersion))`，包含 `seq`/`lastHash`，所以直接改 `state.json` 而不追加事件会在 `integrity.stateOk=false` 暴露；旧状态没有该字段时返回 `stateOk:null` 并退回链校验
- 审查签名：HMAC-SHA256 覆盖 `id/ok/verdict/findings/counts/blocking/subjectHash/stateHash/ts`；密钥在数据目录的 `signing-key.json`（不在 campaign 内，不进导出），审查记录带 `keyId`/`signatureVersion`；review 闸门验签，未签名、密钥不匹配或 findings 被改都会阻断
- 写锁：`.write.lock` 用 `open(..., "wx")` 原子创建，写 `save`/`emit` 前检查磁盘 `seq`/`lastHash`/`stateHash` 是否仍是内存链的前缀；30s 未释放视为陈旧锁，5s 拿不到抛 `locked`。另一个进程推进过项目时抛 `stale_state`，不静默覆盖
- 工件 id 即内容哈希；合法重复不重写、不追加，地址被篡改时重新写回正确内容；总量上限 64 MB（超限按文件大小先拒绝，不先读入内存）
- 工件读取走单 fd：打开后先 `fstat` 限长，读完再 `fstat` 对 inode/size，并对内容重算 SHA-256；读取期间被原地改内容报 `hash_mismatch`，路径被替换/消失报 `changed_during_read`，不会把变化后的字节当原工件返回
- 非法工件 id（穿越、短哈希、大写、非字符串）抛 `invalid_input`；`integrity` 对缺失/哈希不符/长度不符/非法 id/不可读分别报 `missing/hash_mismatch/size_mismatch/invalid_id/unreadable`
- `integrity` 同时枚举 `artifacts/` 与 `state.artifacts` 双向对账：未登记且文件名不是合法内容地址（临时文件/目录）报 `orphan_file`；未登记但文件名是合法 64 位地址（条目被删）报 `missing_entry`；已登记但文件不存在仍是 `missing`
- 事件链校验同时锚定 `state.seq`/`state.lastHash`：删尾或追加合法尾部会报断裂，不只是改中间事件
- `rsx_write export` 复制 ≤2 MB 工件进 `BUNDLE.zip`（store-only，无压缩依赖），跳过项会列在 `skippedArtifacts`；`MANIFEST.json` 在打包前写入并校验每个导出文件的字节数与 SHA-256，自身与 ZIP 不自哈希
- 迁移备份是独立的 `backups/backup-*.zip`，含 `state.json` + `events.jsonl` + `manifest.json`；只用于回滚，不进入发布包，保留最近 20 份
- `doctor` 只读：不创建签名密钥、不删除锁、不重写索引；`reindex` 只重写 `index.json`。schema 5 治理字段与审计对象哈希分离：补声明不会让审查过期，但 schema 5 的 release 闸门会读取它
- `references.bib` / `references.csl.json` / `references.ris` 由同一份来源台账生成，三种格式的 citation key 一致且唯一；`provenance.json` 是 **W3C PROV-JSON**（`prefix/entity/activity/agent` + `wasGeneratedBy/used/wasDerivedFrom/wasAttributedTo/wasAssociatedWith`，QName 与 `dsh:` 扩展属性，关系目标都可解析）；`ro-crate-metadata.json` 是 RO-Crate 1.1 JSON-LD，figure 通过 `about` 独立指向 source；三者都由同一份 state + `verify()` 渲染，不另读事件日志
- 所有时间戳 UTC ISO-8601

---

## token 开销（实测）

用 `tiktoken` cl100k/o200k 对**真实快照**分词（DeepSeek 分词器未公开，两者差异 <1%）：

| 组成 | cl100k | o200k |
| --- | ---: | ---: |
| 系统提示词 section | 1,062 | 1,048 |
| 16 个工具 schema | 11,452 | 11,438 |
| **每次请求固定开销** | **12,514** | **12,486** |

单项目读取开销（本机 0.8 验收项目 `rs-f7edf967`，schema 4，最终 L4，已发布）：`REPORT.md` 12,044 字符、`campaign.json` 53,349 字符、`ledger.jsonl` 25,042 字符、`PROGRAM.md` 1,830 字符、`declaration.md` 478 字符、`LOOP.md` 993 字符，另有 `REPRO.md` 2,659 字符与 `REVIEW_PACKET.md` 3,783 字符。闭环评估历史已压缩为分数摘要，最新一次保留 13 维分数。

复现：

```powershell
node scripts/measure-overhead.mjs
python scripts/measure_tokens.py --campaign "$env:DSH_HOME\research-suite\campaigns\rs-f7edf967\exports" --out _artifacts
```

结果落在 `_artifacts/overhead-tokens.md` 与 `_artifacts/tokens.json`。12.5k/请求是“十六个工具常驻 + 研究程序字段 + 实时检索/DOI 精查 schema + 候选级 PRISMA schema + 下一步规划器 + 宿主循环闸门 + schema 5 治理 action + 可恢复归档”的代价；不做科研时可在插件管家禁用整个 bundle，开销归零。1.0→1.1 增加 **46/46**（约 +0.4%），只来自 `rsx_campaign` 的 `unarchive` 与归档说明；0.14→1.0 增加 **283/287**（约 +2.3%），增量来自 `rsx_campaign` 的四个 action 与 `stewardship/dryRun` 参数，以及 `rsx_write` 的 `STEWARDSHIP.md`/`MANIFEST.json` 说明；提示词段未变；0.13→0.14 增加 **332/332**（约 +2.8%），0.12→0.13 增加 **151/149**（约 +1.3%），0.11 比 0.10 增加 **211/213**（约 +1.8%），其中 `rsx_campaign` schema 增加 146/147，提示词增加 65/66；0.10 比 0.9 增加 115/115（约 +1.0%）；0.9 比 0.8 增加 420/421（约 +3.8%），增量主要是第 16 个 `rsx_search` schema（372/372）与提示词补充；0.8 比 0.7 增加 1,464/1,451（约 +15.3%），0.7 比 0.6 增加 633/630（约 +7.1%）。

---

## 测试

```powershell
npm run release:check # 版本/schema/工具数/bundle/文档契约
npm run check         # 语法 + client 构建新鲜度
npm test              # 175 个测试
npm run acceptance    # 临时目录端到端 release→export→migrate→reindex
npm run rsi           # 13 维闭环评分 + 基线回归门槛
npm run rsi:suite     # 通用 + 四个领域的九阶段回归
```

覆盖：1.1 新增组合 API 与 `releasePassed/attention/archived` 计数、归档不受发布闸门/暂停阻断、`unarchive` 与归档列表、旧 `allowExec` 清理、客户端 `errorText`/Portfolio、需关注排序与搜索筛选、健康问题明细；1.0 新增 schema 5 治理字段与完整性、schema 5 阻断/schema 4 advisory、迁移 dry-run 与备份/幂等/损坏链拒绝、doctor 只读与索引/写锁、manifest 哈希与 bundle、面板 doctor/migrate/stewardship/reindex 路由、客户端版本与健康视图；此外包含事件链与篡改/截断检测、状态 digest、跨实例与跨进程写锁、stale state、路径穿越、工件 64 MB 上限、非法 id、去重不重写、篡改修复、旧状态无 artifacts 数组、artifacts 目录双向对账（orphan_file / missing_entry）、读时 TOCTOU（同 fd 校验 + 内容哈希）、审查 HMAC 签名与验签失败阻断、损坏密钥 fail-closed、九道闸门逐项阻断、完整九阶段流程、四领域字段/规则/角色/监测、条件适用性、评审身份/COI/独立性、监测指标判定/告警/回退、13 维闭环评分/基线/delta/LOOP.md、N/A 豁免与日期校验、领域审计与 DOMAIN.md 导出、领域模板传播、模板占位符、十六个工具 schema 与错误包装、实时检索（规范化/DOI 去重/跨源合并/单源回退/双源失败/超时/坏结构/年份参数）、自动化审查（引用/撤稿/引文失配/新鲜度/正文工件缺失/证据工件引用）、BibTeX 解析与往返（重复 key、kind 往返、100 条上限）、CSL-JSON/RIS 互操作（Zotero 包装、RIS 续行、格式探测、渲染往返、DOI 精查成功/404、导入去重、引用覆盖标记、面板下载路由与导出文件）、候选级筛选（三阶段、排除理由、重复计数、待处理/乱序、PRISMA 计数/JSON/Markdown/CSV/导出包）、工件去重、图溯源、抽取矩阵/CSV（公式注入、表头特殊字符、空单元格）、PROV-JSON 关系解析与 RO-Crate figure→source 边、面板 HTTP（含 evaluate）、客户端纯函数、schema1/2 严谨性差异、warrant/certainty、预注册锁定与修订、受保护/过期 waiver、批准失效与重新批准、评审包/词面筛查、复现包导出、portfolio/graph、schema3 检索协议与计数校验、检索记录审计、敏感性阻断/补齐/trace 解析、预注册时序、否定/数字极性筛查、研究程序（计划/视角/自治/循环/锦标赛/质量/矛盾）完整性、下一步规划器（阶段主推荐/程序缺口展开/预算与完整性停止/循环与预注册时序/发布就绪）、宿主循环闸门（继续/四类暂停分类/四类停止优先/幂等暂停/恢复拒绝与成功/未映射检查/不自动批准）、schema-4 review 阻断与 schema-3 advisory、服务端动作门（导出 × 完成/发布阻断/暂停/归档/写入中五态；归档 × 可归档/已归档/写入中，409 `action_blocked`）、SEARCH.md/SENSITIVITY.md/PROGRAM.md 导出。

工件边界与对账探针（不依赖测试框架，失败时退出码 1）：

```powershell
node scripts/repro-artifacts.mjs
node scripts/repro-orphans.mjs
```

---

## 验收

### 1.0.0 真实安装验收

- **静态契约**：`npm run release:check` 全部通过：package/config/client 三处版本 `1.0.0`、schema `5`、16 个工具、bundle 165,036 B / 161,561 字符（源码构建，`npm run check` 一致）、README/CHANGELOG/迁移与安全文档齐全。
- **单元与集成**：`npm test` **174/174**；新增 8 个治理/迁移/体检/清单测试与工具、面板、客户端回归；`npm run acceptance` **27/27**（795 ms），在临时目录真实完成 release（13/13）→ export（24 个清单文件逐一验哈希）→ schema 4→5 迁移（备份、幂等、链完整）→ stale index 重建（3 个项目）。
- **真实安装**：在已安装的 DSH 桌面 GUI（`http://127.0.0.1:61492`）重载 `dsh-research-suite` 1.0.0 后，`GET /api/state` 返回 `apiVersion:1 / pluginVersion:1.0.0 / schemaVersion:5`；`GET /api/doctor` 扫描 **14** 个项目：`ok:true`、`errors:0`、`index.ok:true`、14/14 索引一致，5 个提醒全部来自 0.7–0.11 的旧项目（3 个 stale audit + 2 个无法用当前安装密钥验签的旧审计），目标项目 `rs-f7edf967` 为 0 error / 0 warning。面板 **健康** 标签显示 `v1.0.0`、`schema 5 · 14/14`、`索引一致`、`5 个提醒` 与逐项目迁移按钮；截图 [`health-1440.png`](_artifacts/live-1.0/health-1440.png)。
- **真实迁移**：用 `rsx_campaign action:"migrate"` 对真实已发布项目 `rs-f7edf967` 先 dry-run（`missing:[]`，不写文件），再正式迁移 schema **4→5**；返回备份 `backup-2026-11-18T18-31-44-834-e8c0d8.zip`（112,949 B，SHA-256 `a7b25309…`），state `seq 84→85`，gate **13/13**、`blocking:[]`、治理 100%（2 位贡献者/4 个关键词）、链 `chainOk:true` / `stateOk:true` / 13 工件 0 问题。`migrations` 记录与 `campaign.migrated` 事件在同一链上；证据 [`live-state.json`](_artifacts/live-1.0/live-state.json)、[`backups.json`](_artifacts/live-1.0/backups.json)。
- **真实导出**：`rsx_write action:"export"` 生成 25 个清单文件、`BUNDLE.zip` 39 条目 / 265,037 B；`MANIFEST.json` 中每个文件的字节数与 SHA-256 全部复核通过，`STEWARDSHIP.md` 1,120 字符、`REPORT.md` 17,121 字符且含 §12.1。索引由 `rsx_campaign action:"reindex"` 重建为 14/14，`doctor` 仍 `ok:true`、`index.ok:true`；证据 [`manifest-verification.json`](_artifacts/live-1.0/manifest-verification.json)、[`reindex.json`](_artifacts/live-1.0/reindex.json)。
- **稳定性**：`npm run rsi` **100/A/L4**、`npm run rsi:suite` **5/5**（general/finance/ai/medicine/industrial 全 100）；devkit `verify` run `20261118-185411-ga3bt3` 的 boundary/version/unit 全过（**174 tests / 6,828 ms**），`trend` health **100**、pass rate 100%、change failure rate 0%、无回归/无 flaky；相对上一基线测试数 **Δ+10**，最近一次耗时 **Δ-9.5%**，测试数增加后仍落在稳定窗口。
- **固定开销**：**12,514 cl100k / 12,486 o200k**（16 schemas + prompt），0.14→1.0 增加 **283/287**（约 +2.3%），来自 `rsx_campaign` 的四个 action/治理参数与 `rsx_write` 的新导出文件说明；提示词段未变。
- **口径**：验收夹具是合成数据；它证明代码路径、链完整性与导出契约，不证明任何真实研究结论。PRISMA/FAIR/CRediT 字段齐全不等于方法学或法务合规。

### 0.14.0 候选筛选与 PRISMA 验收

- **安装与路由**：禁用/启用 `dsh-research-suite` bundle 后，已安装面板的 `GET /api/prisma/rs-a874c2ae?format=markdown` 返回 **200**；重载前该路由不存在。`POST /api/campaign action:"screen"` 与 `rsx_source action:"screen"` 走同一个 `sourceScreen`。
- **真实项目写入**：在 `rs-a874c2ae`（假设阶段，8 个真实来源）写入 R-0001（S-0001，三阶段 include）、R-0002（S-0002，摘要 `wrong-outcome` 排除）、R-0003（S-0003，全文 `not-retrieved`）和 R-0004（R-0001 的重复）。计数为识别 4 / 重复 1 / 去重后 3 / 标题摘要排除 1 / 寻求全文 2 / 全文不可得 1 / 全文评估 1 / 纳入 1 / 待处理 0，`complete=true`。
- **落盘证据**：`GET /api/prisma/...` 的 JSON、Markdown、CSV 分别保存为 [`PRISMA.json`](_artifacts/live-prisma/PRISMA.json)、[`PRISMA.md`](_artifacts/live-prisma/PRISMA.md)、[`PRISMA.csv`](_artifacts/live-prisma/PRISMA.csv)；Markdown 2,168 字符、CSV 1,466 字符，含 Mermaid 流程、`wrong-outcome` / `not-retrieved` 理由与重复对 `R-0004 → R-0001`。`/api/report/rs-a874c2ae` 的 `REPORT.md` 含 §17.2、Mermaid、纳入计数和 `PRISMA.json` 文件名。
- **拒绝与回滚**：在同一个已安装面板上，缺理由的标题排除返回 400，候选数仍为 4 且没有 `PHANTOM_RISK_TEST`；对摘要已排除的 `R-0002` 直接写全文决策返回 400，`fullText` 保持 `null`。证据在 [`rejections.json`](_artifacts/live-prisma/rejections.json)，接口随后仍为 `complete=true`、`consistency.ok=true`。
- **完整性**：真实 state `schema=4`、4 条候选、`chainOk=true`、`stateOk=true`；0.13 的 `references.bib/.csl.json/.ris` 导出测试仍通过。
- **测试与闸门**：`npm test` **164/164**；`npm run check` 通过；`npm run rsi` 100/A/L4，`npm run rsi:suite` 5/5；devkit `verify` run `20261118-180332-8ghv6g` boundary/version/unit 全过（164 tests / 9,991 ms），`trend` health 100、pass rate 100%、最新耗时 Δ-7.6%。
- **固定开销**：**12,231 cl100k / 12,199 o200k**（16 schemas + prompt），0.13 → 0.14 增加 **332/332**（约 +2.8%）。
- **口径**：这 4 条决策用于验收候选级写入与计数，不是对 `rs-a874c2ae` 全部 8 条来源的完整系统综述；PRISMA 数据可复核，但不构成合规认证。

2026-11-17 在本机 DSH（`http://127.0.0.1:57091`）完成 0.2.0 验收：

- 安装：profile 内 `dsh-research-suite` 为 junction 链接，插件管家状态 `active`，热重载后 13 个 `rsx_*` 工具在真实子会话中可调用
- 新工具链路：`rsx_source import` 导入 2 条 BibTeX、`rsx_source add` 捕获正文、`rsx_extract` 建 2 行矩阵、`rsx_artifact` 登记 3 个内容寻址工件、`rsx_figure` 绑定 figure+code+data、`rsx_review audit` 记录审查、`rsx_write export` 导出
- 验收项目 `rs-7bcc3f06`《v0.2 真实验收：证据矩阵与自动化审查》：导出时 22 事件、4 工件、1 图、2 抽取行、3 次审查，`chainOk: true`，`artifactProblems: []`；已用 `rsx_campaign world` + `rsx_gate advance` 从 scoping 推进到 survey
- 审查：最新 `A-0003` 为 `ok:true / verdict:major / blocking:0 / major:6 / minor:1`，`subjectHash=6834…`；`view` 返回 `fresh:true`。`A-0001/A-0002` 因 `numbersAllowlist` 被纳入审查对象而按设计变为 stale，展示了“编辑即过期、重跑才 fresh”的语义
- 导出：`REPORT.md` 6,585 B、`references.bib` 459 B、`MATRIX.md` 320 B、`matrix.csv` 244 B、`AUDIT.md` 1,098 B、`provenance.json` 5,152 B、`ro-crate-metadata.json` 4,772 B、`BUNDLE.zip` 46,497 B / 14 条目
- 面板 API：`/api/audit/:id`、`/api/matrix/:id`、`/api/bibtex/:id`、`/api/artifacts/:id` 均返回 200；旧项目 `GET /api/audit/rs-c537de08` 正确返回“尚未审查”
- 测试：53/53 通过（`npm test`，<2 s）；`npm run check` 通过；工件/孤儿探针全绿
- 固定开销：6,254（cl100k）/ 6,240（o200k）tokens，13 个工具 schema + prompt section

### 0.2.0 收尾核验（真实会话）

- 新项目 `rs-b39d91d2`《v0.2.0 收尾核验：审查闸门与导出》：4 条捕获来源、1 条 supported 断言、1 条证据、1 行抽取、3 个图工件 + F-0001（figure+code+data）、2 份评审、2 次审查、21 事件、7 工件。
- 审查新鲜度：`A-0001` 通过后新增 `S-0004`，`rsx_gate check stage:"review"` 的 `automated_audit` 由通过变为阻断（“latest audit is stale”）；重跑 `A-0002` 后同一闸门 **6/6 通过**，`subjectHash=ccf21f…`，`fresh:true`。
- 导出：`REPORT.md` 6,665 B、`BUNDLE.zip` 52,581 B / 17 条目（7 个 artifacts + 10 个导出文件）；`provenance.json` 含 7 artifacts / 4 sources / 1 claim / 1 evidence / 1 extraction；RO-Crate `@graph` 19 节点，含 `Assertion`、`CreativeWork` 证据与 `PropertyValue` 抽取节点。
- 链校验：`chainOk:true`、`brokenSeq:null`、`artifactProblems:[]`；审查 A-0001 在新增来源后 `fresh:false`，A-0002 fresh。

### 0.3.0 加固核验（真实会话）

- 新项目 `rs-79d63da4`《v0.3.0 加固核验：签名、状态哈希与 PROV》：1 条捕获来源、1 条 supported 断言、1 条证据、1 行抽取、2 份评审（含红队）、21 事件、1 工件；插件从 0.2 热切换到 0.3 后产生的 `A-0001` 未签名，用于验证迁移期行为，最新审查均有签名。
- 审查签名：`A-0003` 起 `signature=014ab5…`、`keyId=2bf5ca36…`、`signatureVersion=hmac-sha256-v1`，`signature.ok=true`；review 闸门 `automated_audit` 显示 “audit A-0006 passed”，最终 **6/6** 通过。
- 状态哈希：`integrity.stateHash=968491c1…`、`stateOk=true`；直接改 `state.json` 标题但保留旧 `stateHash` 后重启，`integrity.stateOk=false`（`state_hash_mismatch`），随后 `rsx_review audit` 记录 **A-0005**：`ok:false / blocking:["state_tampered"]`。修复标题后重审 **A-0006** 恢复 `ok:true`。
- 发布闸门：`rsx_gate check stage:"release"` 的 `chain_integrity` 为 true，detail “hash chain, state.json and 1 artifacts verified”；其余上游/声明项按预期阻断。
- 导出（`rs-79d63da4`）：`REPORT.md` 6,105 B、`provenance.json` 4,954 B、`ro-crate-metadata.json` 3,488 B、`BUNDLE.zip` 52,287 B / 11 条目；`provenance.json` 顶层键为 `activity,agent,entity,prefix,used,wasAssociatedWith,wasAttributedTo,wasDerivedFrom,wasGeneratedBy`，7 entity / 1 activity / 1 agent / 11 关系；RO-Crate 9 节点。
- figure→source 边用带图的旧项目 `rs-b39d91d2` 重导出验证：`#figure-F-0001.about={"@id":"#source-S-0001"}`，`isBasedOn` 仍指 code/data 工件，`contentUrl` 指图像；`provenance.json` 17 entity / 1 activity / 1 agent / 28 关系、11,962 B，RO-Crate 19 节点、8,325 B。
- 测试：61/61 通过（`npm test`，约 2.8 s）；`npm run check` 通过；跨进程锁测试真实启动子进程持锁，父进程在 40 ms 超时后得到 `locked`。
- CI：[run 44092844474](https://github.com/YansongG-HKU/dsh-research-suite/actions/runs/44092844474)，Node 22/24 均 success，`actions/checkout@v5` + `actions/setup-node@v5` 已落地。

### 0.4.0 领域层验收（真实会话 + 真实导出）

- 在当前桌面 DSH 会话内通过插件管理器热重载 `dsh-research-suite`，`rsx_domain` 从“unknown”变为可调用；第 14 个工具与 0.4.0 client bundle 生效，未重启整个应用。
- 验收项目 `rs-ad07b91f`《工业 DOE 与测量系统：焊接工艺窗口 DOE 与测量系统确认》，`industrial` 档案，真实使用 `rsx_template`、`rsx_domain`、`rsx_campaign`、`rsx_source`、`rsx_claim`、`rsx_evidence`、`rsx_run`、`rsx_number`、`rsx_gate`、`rsx_review`、`rsx_write` 走完九个阶段。
- 领域字段 **32/32**；8 条捕获来源（2 条 primary、1 条 2024）；1 条假设 + 2 条支持证据；2 次真实运行（固定种子 7，54 行，负对照斜率 −0.000436）；`engineering` + `quality` 角色评审各 1 条，其中 quality 为红队 adversarial。可复现夹具：`node scripts/fixtures/weld-doe.mjs 7`（campaign 记录的是验收当时的 `_tmp/weld-run.mjs` 路径）。
- 审计：`A-0001` 在 review 阶段 `blocking:0 / major:4`（声明/dual-use 未填，属于预期）；补声明、dual-use 与监测后 `A-0002` 为 `verdict:accept / findings:[] / blocking:[]`，HMAC 验签通过。
- 闸门：release **12/12** 通过；`chainOk:true`、`events:44`、`artifacts:10`、`artifactProblems:[]`、`stateOk:true`、`stateHash=56b85b3d…`。
- 导出（`exports/`）：`REPORT.md` 10,349 B、`DOMAIN.md` 6,928 B、`campaign.json` 43,676 B、`ledger.jsonl` 18,938 B、`declaration.md` 595 B、`references.bib` 1,227 B、`MATRIX.md` 145 B、`matrix.csv` 625 B、`AUDIT.md` 338 B、`provenance.json` 18,937 B、`ro-crate-metadata.json` 13,872 B、`BUNDLE.zip` 123,519 B / 21 条目。
- 面板：桌面侧边栏点击“科研套件”后，UI Automation 读到“领域 / 工业与工程研究 / 领域字段完成度 / 标准与清单 / ISO\/IEC 17025 / 领域审查角色 / 发布后监测”；截图见 [`_artifacts/v040-domain-panel-crop.png`](_artifacts/v040-domain-panel-crop.png)。
- 独立 Web 进程（隔离 profile，57092）验证 `/dsh-research-suite/api/domains` 返回 4 个档案、`/api/campaign/rs-ad07b91f/domain` 返回 `domainId:"industrial"`；验证后已停止该进程并恢复 profile。
- 测试：**72/72** 通过（`npm test`，约 3.2 s）；`npm run check` 通过；固定开销 7,269 cl100k / 7,248 o200k（14 schemas + prompt）。
- 提交与 CI：`6e70e80` 已推送到 `main`；[run 44100644820](https://github.com/YansongG-HKU/dsh-research-suite/actions/runs/44100644820) 在 Node 22/24 均 success。
- 口径：该 campaign 的焊接数据是**固定种子的合成 DOE 夹具**，用于验证“真实命令 → 运行记录 → 数字 trace → 审计 → 导出”的管线，不是焊接物理结论；红队评审已把这一点写入记录。

### 0.5.0 闭环与 RSI 验收（真实项目 + 确定性夹具）

- **条件适用性**：医学 `study_design="rct"` 时 5 个 PRISMA 字段不再阻断，切到 `systematic-review` 后立即恢复；工业 `design_type="acceptance"` 时 DOE 因子字段不适用，切回 `doe` 后重新要求。测试覆盖 `fieldApplicability`、阶段检查、完成度与标准适用性。
- **监测**：`rs-ad07b91f` 发布后为 5 个信号登记 5 个指标与 5 条观测（`mean_penetration_mm=1.31`、`spc_alert=0`、`calibration_due=104` 天、`defect_rate=0.00204%`、`safety_incident=0`）；状态 active、告警 0、覆盖缺口 0。`defect_rate` 是由 Cpk=1.42 的正态近似推算值，备注明确“不是 X 光全检实测”；其余为项目记录，不是产线遥测。越界场景测试验证 `alert` + `reopen` 回到 analyze，并写入 `monitoring.alert` / `loop.reopened` 事件。
- **独立评审**：新评审 `schema:2`，缺机构/COI 不覆盖领域角色；同一评审人覆盖 ml + safety 时产生 `domain_ai_review_independence` 阻断。旧评审保持兼容。
- **补证据与执行**：用 `rsx_run action:"attach"` 把两条确定性重放的 stdout 挂到 `R-fde2486908` / `R-f886ae3b61`，命令、种子与四项指标保持不变；从 `S-0001` 抽取 5 行（材料/电流/熔深/速度/保护气）进入矩阵。`A-0003` 为 `accept / blocking:0 / minor:1`，唯一 minor 是抽取只覆盖 1/8 条来源，建议后续扩到 3 条。
- **真实闭环评估**：`L-0001` **93.2/100**（L3）→ `L-0002` **95.8/100**（+2.6）→ 真实工具补录后 `L-0005` **100/100**（L4，delta **+4.2**，相对基线 **+6.8**），4 项 RSI 前提全部满足，`gaps:[]`。这是工程闭环首次在真实项目上由 `rsiReady:false` 变为 `true`。
- **导出**：`exports/LOOP.md` 含 `93.2 → 95.8 → 100` 与 `+6.8`；`REPORT.md` 9,550 字符；`MATRIX.md` 5 个维度；`DOMAIN.md` 显示 5 指标/5 观测/0 告警/0 缺口；`BUNDLE.zip` 24 条目、含 12 个工件。
- **面板**：通过插件管家热重载 `include:dsh-research-suite` 后，UI Automation 读到 `科研套件 / 0.5.0 / 研究闭环 / 100/100 / L4 可审计闭环 / 重新评估`；实拍 [`_artifacts/v050-loop-panel.png`](_artifacts/v050-loop-panel.png)。live panel API `POST /dsh-research-suite/api/campaign/rs-ad07b91f/evaluate` 返回 `100 / L4 / rsiReady:true`（`record:false`）。
- **RSI 夹具**：`npm run rsi` 构建完整九阶段项目（含抽取、stdout、两名独立评审、验签审计、带指标/观测的监测），**100/100、L4、RSI 前提满足**；基线在 `_artifacts/rsi-baseline.json`，分数下降退出码 1。夹具证明评估器可达满分，不能替代真实项目的证据。
- **测试**：**81/81** 通过（`npm test`，约 3.3 s）；`npm run check` 通过；`npm run rsi` 与基线比较通过。固定开销 **7,764 cl100k / 7,745 o200k**（14 schemas + prompt，0.4 → 0.5 增加 495/497）。
- **提交与 CI**：0.5.0 基线提交 `c53eded` 已在 [run 44106991255](https://github.com/YansongG-HKU/dsh-research-suite/actions/runs/44106991255) 通过 Node 22/24；本轮 stdout 补录、抽取与文档更新留在工作区，尚未提交或推送（按当前约定，提交需你明确确认）。
- **口径**：闭环分数是工程可复核性评分，不是科学结论、临床有效性、法律合规、投资建议或智能水平测量；监测观测由操作者显式登记，工具不抓取外部遥测。

### 0.6.0 推理严谨性与发布治理验收

- **测试**：**92/92** 通过（`npm test`，约 5.4 s），新增 `rigor.test.mjs` 覆盖 schema1/2 差异、claim 更新、预注册锁定与修订、受保护/过期 waiver、过期豁免作为历史记录、批准失效与重新批准、评审包/词面筛查、复现包导出、portfolio/graph。
- **跨领域套件**：`npm run rsi:suite` 让 `general + finance + ai + medicine + industrial` 五套夹具各自走完九阶段；**5/5 达到 100/100、L4、RSI 前提满足**，报告 [`_artifacts/rsi-suite.md`](_artifacts/rsi-suite.md)。这不是五个真实研究，而是“同一套闸门在五个领域协议上都能闭合”的回归证据。
- **真实项目补强**：在 `rs-ad07b91f` 上把两条 primary 来源标为 `independent`，记录 design 与 `riskOfBias:"high"`（理由：合成夹具，不能外推工艺窗口）；给 C-0001 补 warrant、反向检索与 `certainty:"low"`；锁定预注册后以 `amend:true` 补 alpha/power/effectSize，留下 1 条修订；补 AI/人类贡献矩阵与人类批准。
- **真实结果**：`L-0006` **99.1/100** 暴露了一个真实 bug——`world` 把失败记录写成 `failure`，两处检查却读 `failures`；修复为两种桶都接受后 `L-0007` **100/100、L4、rsiReady:true**。`A-0004` 为 `accept`、0 blocking、0 major、8 minor、1 info（minor 主要是抽取覆盖 1/8 与 E-0002 引文词面弱）；release 闸门 **16/16** 通过，`released:true`。摘要 [`_artifacts/real-acceptance-0.6.json`](_artifacts/real-acceptance-0.6.json)。
- **真实导出**：新增 [`_artifacts/real-REPRO-0.6.md`](_artifacts/real-REPRO-0.6.md)、[`_artifacts/real-repro-0.6.json`](_artifacts/real-repro-0.6.json)、[`_artifacts/real-REVIEW_PACKET-0.6.md`](_artifacts/real-REVIEW_PACKET-0.6.md)、[`_artifacts/real-AI_CONTRIBUTION-0.6.md`](_artifacts/real-AI_CONTRIBUTION-0.6.md)、[`_artifacts/real-AUDIT-0.6.md`](_artifacts/real-AUDIT-0.6.md)、[`_artifacts/real-DOMAIN-0.6.md`](_artifacts/real-DOMAIN-0.6.md)、[`_artifacts/real-REPORT-0.6.md`](_artifacts/real-REPORT-0.6.md)、[`_artifacts/real-LOOP-0.6.md`](_artifacts/real-LOOP-0.6.md)。
- **迁移口径**：`rs-ad07b91f` 仍是 schema 1。补字段后它在新评估器上达到 100，但 `source_independence` 等新检查在它上面是 advisory；新建项目才按 schema 2 阻断。这样升级不会让已发布项目突然失效，但也意味着“旧项目 100”不等同于“新项目所有新检查都通过”。补完 schema 2 字段并显式迁移后，才能声称完全对齐。
- **固定开销**：**8,905 cl100k / 8,888 o200k**（14 schemas + prompt），0.5 → 0.6 增加 **1,141/1,143**（+15%）。

### 0.11.0 宿主循环验收

- **宿主机制夹具**：`rsx_campaign action:"loop"` 在当前 DSH 会话可用；`rs-e710b015`（已归档并 `quarantine.citable=false`）验证了首次 `needs_input` 暂停、`stale` 暂停与 `resume:true` 成功恢复，但该夹具含合成题录，**不计入验收**。
- **真实项目**：`rs-a874c2ae`《0.11 宿主循环验收：真实题录与两次暂停》，S 档、`maxCycles=5`，真实宿主共 8 次 `loop`：3 次 `continue`、2 次暂停、1 次 `stale` 暂停、1 次恢复、1 次恢复拒绝。定题 `LP-0001` 在补齐 `scope` 后恢复并记录 `loop.resumed`；survey 真实检索 OpenAlex/Crossref 返回 8+8、合并 8 条（3,534 ms），登记 8 条真实题录与摘要，survey 9/9 通过；hypothesis 再因占位 `rsx_claim` 写 `LP-0002`，未补输入时 `resume:true` 返回 `resumeRejected:true` 且审批数组保持为空。
- **最终状态**：24 → **25 events**（清理后追加 `search.annotated`）、8 个内容寻址工件、`K-0001/K-0002`、`LP-0001=resumed`、`LP-0002=open`、`chainOk:true`、`artifactProblems:[]`；loop 停在 hypothesis 输入检查点，这是按设计停止，不是伪造完成。
- **面板**：DSH 面板显示 `科研套件 / 0.11.0`、阶段“假设”、24 events 与 8 artifacts；截图 [`1440`](_artifacts/real-0.11/panel-loop-1440.png)、[`390`](_artifacts/real-0.11/panel-loop-390.png)。
- **测试与闸门**：**141/141** 通过（`npm test`，7,706.7 ms），其中循环控制器 8 个；`npm run check`、`npm run rsi`（100/A/L4/rsiReady:true）、`npm run rsi:suite`（5/5）全绿；devkit `boundary`/`version`/`unit` 全过（run `20261117-224522-xasfwv`，141 tests，8,975 ms），client 6 fragments / 107,805 B；trend 健康 100、无异常，测试数不变（Δ+0），耗时较上次 -18.2%。`_artifacts` 中的 24 → 25 事件差异来自清理追加的 `search.annotated`，不是测试计数变化。
- **固定开销**：**11,899 cl100k / 11,867 o200k**（16 schemas + prompt），0.12 → 0.13 增加 **151/149**（约 +1.3%，全部来自 `rsx_source` 的 CSL/RIS/DOI 参数与说明；提示词段未变）。
- **证据**：[`acceptance-0.11.json`](_artifacts/real-0.11/acceptance-0.11.json)。
- **记录清理**：`Q-0002` 已标 `measured:false`、`supersededBy:"Q-0003"`，notes 明确 3/3/0 是未实测占位；`Q-0003` 标 `measured:true`、`supersedes:"Q-0002"`。机制夹具 `rs-e710b015` 已写 `quarantine.citable=false`，并追加 `campaign.quarantined`（事件 20）。两处都走 store 的 `emit`/`save`，不手改 JSON；清理脚本 [`annotate-0.11-records.mjs`](scripts/annotate-0.11-records.mjs)，证据 [`cleanup.json`](_artifacts/real-0.11-human/cleanup.json)。
- **真实人工检查点**：在已发布项目 `rs-f7edf967` 上加入真实综述 `S-0011`（DOI `10.51584/ijrias.2026.11030104`）并修订文稿（930 字符），旧批准 `P-0001` 失效。`loop` 先因 `K-0001` 已终止返回 `cycle_stop`；记录发布后修订循环 `K-0002`（`continue`）后，重新审计为 `A-0003`，`loop` 返回 **`pause / human_checkpoint`**，`LP-0001` open，`release` 11/12 仅阻断 `human_approval`。YG 在真实宿主明确选择「批准（YG）」后，才写入 `P-0002`（绑定对象 `3a1cd91a…`）；`release` 12/12，`loop resume:true` 写 `loop.resumed`（事件 76）并返回 `ready`。审批前没有任何自动批准或恢复。证据 [`acceptance-human.json`](_artifacts/real-0.11-human/acceptance-human.json)，面板实拍 [`panel-human-1440.png`](_artifacts/real-0.11-human/panel-human-1440.png)（显示 `rs-f7edf967` 已发布、全部闸门通过、事件链完整）。
- **使用边界**：终止循环（`cycle_stop`）不会被自动改写成人工暂停；发布后修订若要进入 `human_checkpoint`，需要先记录新的修订循环（`K-0002`）或由人直接审批。这是 0.11 的停止优先规则，不是自动代签。

### 0.10.0 下一步规划器验收

- **工具层**：`_artifacts/real-0.10/run-planner.mjs` 在临时库中通过真实 `rsx_campaign` handler 调用 `next`。定题阶段主推荐 `rsx_campaign action:"world"`（`needsInput:false`，直接使用已记录问题）；推进到测绘后主推荐 `rsx_search provider:"both" limit:10`，并明确“先检索、只登记实际读过的候选”。连续 `next` 前后事件数 **1 → 1**，证明只读；摘要 [`tool-planner.json`](_artifacts/real-0.10/tool-planner.json)。
- **宿主 0.10.0 真实会话**：插件禁用/启用后，对三个真实项目直接调用 `rsx_campaign action:"next"`。`rs-79d63da4`（定题）返回 `world_question` 阻断与精确问题文本；`rs-7bcc3f06`（测绘）返回 `rsx_search` 主推荐与 5 项阻断；`rs-f7edf967`（发布）返回 `gateOk:true`、12/12、`stop.ready:true`、主推荐 `rsx_write action:"export"`，完整性 65 events / 11 artifacts 全过。
- **首轮宿主发现并修复**：`rs-f7edf967` 最后一条循环决策是 `stop`，旧逻辑先判 `cycle_stop`，把已发布项目误报为停止。修复为“完整性/预算/预注册时序之后，发布闸门通过优先于终止循环”，新增回归用例，重载后宿主返回 `可交付`。
- **面板**：DSH 面板显示 `科研套件 / 0.10.0`，总览出现“下一步 / 可交付 / 导出研究包，交给人类复核者 / `{"action":"export"}`”；点击“复制调用”后按钮变为“已复制到剪贴板”。截图 [`1440`](_artifacts/real-0.10/panel-next-1440.png)、[`复制后`](_artifacts/real-0.10/panel-next-copied-1440.png)、[`390`](_artifacts/real-0.10/panel-next-390.png)。
- **测试与闸门**：**133/133** 通过（`npm test`，约 10.0 s），其中规划器 11 个；`npm run check`、`npm run rsi`（100/A/L4/rsiReady:true）、`npm run rsi:suite`（5/5）全绿；devkit `boundary`/`version`/`unit` 全过（run `20261117-205918-7rlc2t`，133 tests，10,270 ms），client 6 fragments / 107,805 B。
- **固定开销**：**11,537 cl100k / 11,505 o200k**（16 schemas + prompt），0.9 → 0.10 增加 **115/115**（约 +1.0%）。
- 证据：[`acceptance-0.10.json`](_artifacts/real-0.10/acceptance-0.10.json)、[`tool-planner.json`](_artifacts/real-0.10/tool-planner.json)、[`run-planner.mjs`](_artifacts/real-0.10/run-planner.mjs)。
- **边界**：规划器不执行推荐的调用，不自动登记候选、不自动批准、不自动豁免；占位参数标 `needsInput`；映射表需要随闸门检查维护，未映射项回退到 `rsx_gate action:"check"`。这不是“规划器已替代研究者”的证据。

### 0.9.0 实时文献检索验收

- **新能力**：`rsx_search` 在本机直接调用 OpenAlex 与 Crossref 公共接口；真实模块调用与真实工具 handler 都跑过，不使用 mock。
- **主验收**：查询 `multi-agent research system`，`provider:"both"`、`limit:6`；OpenAlex 6 条 + Crossref 6 条，合并后 6 条，3,794 ms，0 warning；2 条候选同时带 `openalex+crossref`，DOI 唯一，全部有标题。
- **工具 handler**：在临时 campaign store 中调用真实 `rsx_search`，4 + 4 条、4 条合并、0 warning、4,221 ms；调用后 `campaigns.length === 0`，证明只读。
- **宿主会话**：插件禁用/启用后，当前 DSH 会话的 `rsx_search` 直接查询 `reproducibility crisis psychology`，OpenAlex 3 + Crossref 3、合并 3 条、1 条跨源合并、0 warning、2,606 ms；最终 bundle 重载后再查 `open science reproducibility`，2 + 2、0 warning、3,442 ms。候选带摘要与作者，未写台账。空查询在宿主返回结构化 `invalid_input`，没有发网络请求。
- **回退**：`provider:"crossref"` 查询 `sleep deprivation working memory` 返回 3 条、340 ms、0 warning。另一次真实调用遇到 OpenAlex HTTP 429，工具按设计返回 warning 与 Crossref 结果，没有伪造候选；等待后重跑恢复双源。
- **测试与闸门**：**122/122** 通过（`npm test`，约 7.4 s）；`npm run check`、`npm run rsi`（100/A/L4/rsiReady:true）、`npm run rsi:suite`（5/5）全绿；devkit `boundary`/`version`/`unit` 全过（run `20261117-203649-x5c0bw`，122 tests）。
- **固定开销**：**11,422 cl100k / 11,390 o200k**（16 schemas + prompt），0.8 → 0.9 增加 **420/421**（约 +3.8%）。
- 证据：[`acceptance-0.9.json`](_artifacts/real-0.9/acceptance-0.9.json)、[`search-live.json`](_artifacts/real-0.9/search-live.json)、[`search-live.log`](_artifacts/real-0.9/search-live.log)、[`tool-call.json`](_artifacts/real-0.9/tool-call.json)、[`host-tool-call.json`](_artifacts/real-0.9/host-tool-call.json)、[`host-tool-call-final.json`](_artifacts/real-0.9/host-tool-call-final.json)、[`host-invalid-call.json`](_artifacts/real-0.9/host-invalid-call.json)、[`run-search.mjs`](_artifacts/real-0.9/run-search.mjs)、[`run-tool.mjs`](_artifacts/real-0.9/run-tool.mjs)。

### 0.8.0 研究程序与 schema-4 闸门验收

- **新项目**：在本机 profile（`C:\Users\13645\.dsh\research-suite`）新建 `rs-f7edf967`《0.8 真实验收：schema-4 研究程序与 review 闸门》，`schema:4`，走完九个阶段并发布。10 条来源（7 条外部设计来源：Anthropic 多代理/工作流、Co-Scientist、Kosmos、PaperQA2、STORM、AI Scientist-v2；2 条探针数据集；1 条本地 README/CHANGELOG），1 条 `Q-0001` 检索、3 行抽取、3 个计划问题（均有来源覆盖）、3 个视角、1 条行动循环、1 场比赛、1 行六维质量评分、1 条已解释矛盾、2 次真实运行。
- **真实闸门探针**：`_artifacts/real-0.8/probe.mjs` 逐案例调用真实 `checkGate`：缺程序阻断 `program_complete`、补齐放行、开放矛盾阻断、解释矛盾放行、低质量评分阻断、schema-3 负对照不阻断；确认性重跑在预注册锁定之后（`preregBeforeRun:true`），主指标 `blocked_cases=3`、负对照 `legacy_missing_blocked=0`。
- **审查与发布**：`A-0001` 为 `accept`、0 blocking / 0 major / 2 minor（两条 minor 都是证据摘录与中文断言词面不匹配，人工已复核），HMAC 验签通过、`fresh:true`、`subjectHash=e16cb095…`；release 闸门 **12/12**，`released:true`；`L-0001` **100/100、L4、rsiReady:true**，13 维。
- **新导出**：`PROGRAM.md`（3.2/4.2 节来源）、`REPORT.md` 的 `3.2`/`4.2` 节、`AUDIT.md` 0 major、`LOOP.md` 13 维；`BUNDLE.zip` 30 条目 / 194,971 B，包含 `PROGRAM.md`、`SEARCH.md`、`SENSITIVITY.md`。
- **面板热重载**：通过插件管家禁用/启用 `dsh-research-suite` 后，live panel API `GET /dsh-research-suite/api/campaign/rs-f7edf967` 返回 `gate.ok:true`、12/12、`planQuestions:3`、`perspectives:3`、`cycles:1`、`matches:1`、`quality:1`、`contradictions:1`、`chainOk:true`；证据在 [`_artifacts/real-0.8/live-panel.json`](_artifacts/real-0.8/live-panel.json)。
- **测试**：**108/108** 通过（`npm test`，约 7.5 s）；`npm run check`、`npm run rsi`、`npm run rsi:suite` 全绿。
- **固定开销**：**11,002 cl100k / 10,969 o200k**（15 schemas + prompt），0.7 → 0.8 增加 **1,464/1,451**（约 +15.3%）。
- 证据：[`acceptance-0.8.json`](_artifacts/real-0.8/acceptance-0.8.json)、[`verify.json`](_artifacts/real-0.8/verify.json)、[`real-AUDIT-0.8.md`](_artifacts/real-0.8/real-AUDIT-0.8.md)、[`real-PROGRAM-0.8.md`](_artifacts/real-0.8/real-PROGRAM-0.8.md)、[`real-LOOP-0.8.md`](_artifacts/real-0.8/real-LOOP-0.8.md)、[`real-REPORT-0.8.md`](_artifacts/real-0.8/real-REPORT-0.8.md)、[`live-panel.json`](_artifacts/real-0.8/live-panel.json)。

### 0.7.0 检索协议、敏感性与 schema-3 闸门验收

- **新项目**：在本机 profile（`C:\Users\13645\.dsh\research-suite`）新建 `rs-5495250c`《0.7 真实验收：schema-3 检索协议与敏感性闸门探针》，`schema:3`，走完九个阶段并发布。8 条来源（5 条 primary 探针记录 + 3 条 secondary 设计/变更文档）、1 条 `Q-0001` 检索、1 条 `Z-0001` 敏感性、2 条真实运行、1 个数字、1 行抽取、2 名独立评审（含红队）。
- **真实闸门探针**：`_artifacts/real-0.7/probe.mjs` 在隔离临时库中实际调用 service 与 `checkGate`。探索性与确认性结果一致：缺检索 `search_protocol` 阻断 1 例、补齐放行 1 例、缺敏感性 `sensitivity` 阻断 1 例、补齐放行 1 例、早期 schema 负对照不触发同名阻断 0 例；确认性运行在预注册锁定之后（`lockedAt 17:49:54.902Z` < first run `17:49:56.199Z`）。
- **审查与发布**：`A-0001` 为 `accept`、0 blocking / 0 major / 1 minor（唯一 minor 是抽取覆盖 1/8），HMAC 验签通过、`fresh:true`、`subjectHash=14145feb…`；release 闸门 **12/12**，`released:true`；`L-0001` **100/100、L4、rsiReady:true**。
- **新导出**：`SEARCH.md`（Q-0001，命中/初筛/纳入 5/5/4）、`SENSITIVITY.md`（Z-0001，negative-control，trace 到 `R-c292d0fe5f#legacy_missing_search_blocked`）、`REPORT.md` 的 `3.1`/`4.1` 节、`REVIEW_PACKET.md` 两张新表；`BUNDLE.zip` **29 条目 / 184,298 B**。
- **无回归**：旧项目 `rs-ad07b91f` 仍是 schema 1，`A-0004` 的 `subjectHash=7c86dde8…` 与当前对象哈希一致，`fresh:true`，release **16/16**，`L-0007 100/100`；新字段只在非空时进入对象哈希，因此旧审计不会无故失效。
- **面板热重载**：通过插件管家禁用/启用 `dsh-research-suite` 后，live panel API `GET /dsh-research-suite/api/campaign/rs-5495250c` 返回 `gate.ok:true`、12/12、`searchLog:1`、`sensitivity:1`，`chainOk:true`；证据在 [`_artifacts/real-0.7/live-panel.json`](_artifacts/real-0.7/live-panel.json)。浏览器直开 `http://127.0.0.1:57091` 因当前会话 401，本轮没有把截图作为验收证据。
- **测试**：**103/103** 通过（`npm test`，约 4.7 s）；`npm run check`、`npm run rsi`、`npm run rsi:suite` 全绿。
- **固定开销**：**9,538 cl100k / 9,518 o200k**（14 schemas + prompt），0.6 → 0.7 增加 **633/630**（约 +7.1%）。
- 证据：[`acceptance-0.7.json`](_artifacts/real-0.7/acceptance-0.7.json)、[`real-AUDIT-0.7.md`](_artifacts/real-0.7/real-AUDIT-0.7.md)、[`real-LOOP-0.7.md`](_artifacts/real-0.7/real-LOOP-0.7.md)、[`real-REPORT-0.7.md`](_artifacts/real-0.7/real-REPORT-0.7.md)、[`real-SEARCH-0.7.md`](_artifacts/real-0.7/real-SEARCH-0.7.md)、[`real-SENSITIVITY-0.7.md`](_artifacts/real-0.7/real-SENSITIVITY-0.7.md)、[`real-REVIEW_PACKET-0.7.md`](_artifacts/real-0.7/real-REVIEW_PACKET-0.7.md)、[`real-REPRO-0.7.md`](_artifacts/real-0.7/real-REPRO-0.7.md)、[`real-AI_CONTRIBUTION-0.7.md`](_artifacts/real-0.7/real-AI_CONTRIBUTION-0.7.md)。
- **口径**：五个探针是确定性工程夹具，只检验闸门行为，不检验真实文献检索的召回率或统计敏感性；早期 schema 的负对照只说明版本化契约差异，不说明旧项目证据充分。

---

## 边界与不做的事

- `rsx_run` **不执行命令**，只记录；agent 必须先用 shell/notebook 真跑，再登记真实输出。这是刻意设计：执行留在用户可审计的终端里。
- 不内置全文检索/PDF 解析；`rsx_search` 只查 OpenAlex/Crossref 题录元数据，0.13 的 `lookup` 也只走 Crossref 单条记录，0.14 的 `screen` 只登记人工/agent 给出的决策，不自动判断标题或摘要是否相关。套件负责登记、哈希与引用一致性；`PRISMA.json` 是可复核的候选级计数数据，不是 PRISMA 合规认证，也不替代双人独立筛选、全文阅读或质量评价。`SEARCH.md` 是检索协议记录，不证明数据库覆盖面；CSL-JSON/RIS 是交换格式，不是完整 CSL 样式引擎（不渲染特定期刊格式、不做引用歧义消解）。
- 不做统计推断；它检查“数字能否追到运行”，不检查“统计方法是否正确”（后者交给评审闸门与红队）。敏感性记录的方向由分析者填写，套件只检查字段、trace 与是否存在，不自动判定结论稳健。
- 监测不自动采集：`metrics`/`observations` 必须显式登记；没有外部遥测、SPC 计算或自动回退。观测越界只产生告警与可选 `reopen`，是否停产由人决定。
- 闭环评分只衡量工程可复核性；L4/RSI 前提不是科学正确性、临床有效性、法律合规或自治能力的证明。没有自动生成/合并代码，候选改动仍要人工审查、测试与发布。`rs-ad07b91f` 的 `defect_rate` 是 Cpk 推算值而非全检实测，来源覆盖也只到 1/8；真实项目 RSI 由 false 变 true 证明的是闭环证据链已闭合，不等于生产质量数据已经闭环。
- `provenance.json` 现在是 **W3C PROV-JSON** 最小完整视图（entity/activity/agent + 五类关系）；它不声称覆盖 PROV-O 的全部约束（如 `prov:wasInformedBy`、角色限定），严格约束校验请用 PROV 工具链再做一层。
- RO-Crate 的 figure→source 边用 `about` 表达“图解释该来源”；`isBasedOn` 仍指代码/数据工件，两者语义分开。
- `rsx_review action:"entailment"` 是**词面覆盖筛查**，只检查引文是否包含断言关键词；它不是语义蕴含判断，不能替代人工阅读。0.7 的否定/数字规则是启发式，能抓“引文说不会、断言说会”和明显数字不一致，也会受分词与语境影响；审计把弱引文列为 major/minor，而不是自动判真或判假。
- 人工批准记录的是“某位人类在某个对象哈希上签了字”，不是密码学身份认证；`approver` 由调用者填写，强身份需要外部 SSO/签名。
- 结构化 waiver 防止“用一条注释绕过检查”，但它本身仍是发布记录的一部分；受保护校验不可豁免，且 waiver 到期后重新阻断。它不是安全控制，不能替代修复。
- schema 1/2 项目上的新检查是 advisory；不要用“旧项目仍是 100”推断它的检索协议、敏感性、预注册时序都已具备。
- 预注册时序比较本机写入的 ISO 时间，不是可信时间戳服务；它能抓“先跑后补”，不能证明锁定的绝对时刻。
- `stateHash` 是未加盐 SHA-256，能发现意外修改与不一致，但不是抗本地重算的签名；它与事件尾锚定，真正的不可否认性由审查签名提供。
- 写锁是本地文件锁，假设单个共享数据目录；跨主机共享盘（NFS/SMB）上的语义取决于文件系统，不声称分布式一致性。
- 工件读取已消除 `stat`→`read` 的常见 TOCTOU（单 fd + 读后校验），但无法阻止内核/文件系统层在两次 `fstat` 之间篡改同一 inode 的极端场景；内容哈希是最终判据。
- 演示项目的数据是**固定种子的合成队列**，用于验收管线，不是睡眠科学结论。

---

## License

MIT © 2026 YansongG-HKU








