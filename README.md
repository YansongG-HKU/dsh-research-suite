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
- 侧边栏面板：总览、领域、台账（断言/来源/数字/运行/证据/图/工件）、审查、模板、报告
- 集百家之长：Claude Science 式 reviewer、Elicit 式抽取矩阵、Zotero/BibTeX、RO-Crate 1.1、W3C PROV-JSON、OSF 预注册、DVC/MLflow 溯源、PRISMA/CONSORT/TRIPOD+AI、NIST AI RMF、GIPS/Deflated Sharpe、ISO/IEC 17025/IATF 16949

当前版本 **0.4.0**，72 个测试全绿；0.3.0 已在真实会话中跑通，0.4.0 的领域层已在真实桌面会话中跑完九阶段并完成导出与面板验收（见[验收](#验收)）。

---

## 安装

要求 DSH `>= 0.2.2-rc.3`、Node `>= 22`。

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

重启 DSH（或重新加载该 bundle）后，工具栏出现 **科研套件**，同时注册十四个 `rsx_*` 工具。若通过插件市场发布，名称同为 `dsh-research-suite`，版本 `0.4.0`。

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
| survey | ≥8 条来源、≥2 条一手来源、≥1 条 2023+、抓取正文（有内容哈希）、一次**证伪检索**、≥2 个覆盖域 |
| hypothesis | 明确证伪条件、终止条件、预测观察、主指标与单位、≥2 条支持证据、最近邻工作查新 |
| design | 预注册：假设 id、指标、样本量、分析计划、停止规则、随机种子、负对照、环境锁定 |
| execute | ≥1 次成功运行、种子、指标、真实跑过的负对照、完整命令 |
| analyze | 数字有 trace、trace 能解析、数值与运行指标一致（1e-6）、≥1 个不确定性、所有断言已定状态 |
| write | 手稿 ≥200 字、至少一个 `{{N-0001}}`、至少一个 `[[src:S-0001]]`、无未知引用、无游离数字、图有工件+代码+数据 |
| review | 两份评审、至少一份红队对抗评审、无 reject、无未解决阻断问题、断言均已定状态、**最近一次自动化审查通过、未过期且 HMAC 验签通过** |
| release | 上游闸门全过、AI 声明+水印+模型+人工复核人、`world.safety.dual_use = "pass"`、预算未超、无争议断言、事件链与 `stateHash` 完整 |

设计要点：**闸门只挡状态，不评判文笔**。它检查的是“能不能被机器复核”，而不是“结论是否正确”——正确性由证据、负对照和评审人负责。

---

## 领域档案（0.4.0）

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
- **角色分离**：review 阶段要求每个档案的两个角色各至少一条 `rsx_gate action:"review" role:"..."` 记录；角色化评审要在自动审查**之前**完成，否则审查会因缺角色而阻断。
- **闭环**：release 阶段要求监测计划、负责人、频率与信号；发布后用 `rsx_campaign action:"monitor"` 更新状态/计划/信号。监测触发时可以 `rsx_gate action:"back"` 回到 analyze/design，修正后重新审查与发布，闸门历史保留整条回退路径。
- **口径**：它是“标准/清单对齐”的记录结构，不声称认证、法律合规或临床合规；标准文本与适用性由领域评审人确认。

新增一个领域只需在 `lib/domains.js` 加一个 profile（字段/阶段/规则/角色/监测），再加模板与测试；`domainChecks`、审计、面板、导出不需要改分支。详见 [领域研究闭环-0.4.0](docs/领域研究闭环-0.4.0.md)。

---

## 十四个工具

| 工具 | 作用 |
| --- | --- |
| `rsx_campaign` | 建项目、查状态、写世界模型（实体/事实/失败/覆盖/查新/安全）、记录证伪检索、预注册、预算、发布后监测、归档；`update` 可设 `numbersAllowlist` 放行方法常量 |
| `rsx_domain` | 领域档案：`list/get/check/set`；四个领域、字段完整性、阶段检查、角色与监测状态；`set` 可只更新传入字段，切换档案会清空旧值 |
| `rsx_template` | 11 个任务模板 + 3 个方法协议；`apply` 直接建项目并返回可粘贴提示词；带领域的模板自动启用档案 |
| `rsx_source` | 登记论文/数据集/注册表/报告，抓取正文存为内容寻址工件；`import` 解析 BibTeX，`bibtex` 导出 `references.bib` |
| `rsx_claim` | 断言与假设；假设必须写证伪条件、终止条件、预测观察、指标 |
| `rsx_evidence` | 把断言连到来源/运行/工件，关系 `supports/refutes/context`，可带原文引文 |
| `rsx_run` | 记录真实命令、退出码、种子、指标、stdout 工件、负对照（**只记录，不代跑**） |
| `rsx_number` | 数字登记与 trace 校验；写入时即校验与运行指标一致，返回 `{{N-0001}}` |
| `rsx_extract` | Elicit 式抽取矩阵：source × dimension，带 value/quote/locator/confidence，输出 `MATRIX.md` / `matrix.csv` |
| `rsx_review` | 自动化审查：引用、引文、数字、图、预注册、负对照、抽取覆盖、领域字段/角色；记录 `subjectHash`、findings 与 HMAC 签名 |
| `rsx_artifact` | 登记数据集/代码/环境/补充材料为内容寻址工件，带 role 与 description |
| `rsx_figure` | 图 + 代码 + 数据 + 环境/运行/描述作为一个溯源单元；缺代码或数据会挡写作闸门 |
| `rsx_gate` | check / advance / back / history / review，闸门历史只追加；review 闸门要求新鲜、通过且验签成功的审查，领域档案要求角色化评审 |
| `rsx_write` | 手稿、AI 声明、渲染、导出（REPORT.md、DOMAIN.md、references.bib、MATRIX.md、AUDIT.md、provenance.json、ro-crate-metadata.json、BUNDLE.zip） |

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

- **总览**：项目状态、九阶段步进条、当前闸门、预算条、完整性、事件/工件计数、一键复制“继续研究”提示词、导出、归档
- **领域**：选择/切换档案，字段完整度、待补字段、标准清单、角色化评审状态、发布后监测计划与信号
- **台账**：断言、来源、数字、运行、证据、图、工件七个表；数字直接显示 trace 与不确定性，工件显示角色/字节/说明
- **审查**：最新结论与 blocking/major/minor 计数、findings 表、来源×维度矩阵、运行审查、下载 `references.bib`
- **模板**：任务/方法筛选，填占位符后直接建项目并给出提示词
- **报告**：渲染 `REPORT.md`（18 节，含领域档案、自动化审查、证据矩阵、发布后监测、溯源性文件清单），下载 Markdown、AI 声明、导出研究包
- 中文/英文切换，浅色/深色跟随系统，1440 / 1024 / 375 三档无横向溢出

面板与工具读写同一份状态，HTTP 路由挂在 `/dsh-research-suite`：

- 仅回环：`Host` 必须是 `127.0.0.1` / `localhost` / `[::1]`
- 写操作要求 `x-dsh-research-suite: 1`，并校验同源 `Origin`
- 请求体上限 2 MB，路径 id 严格匹配，拒绝穿越
- 无鉴权 cookie，不监听非回环地址

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
    exports/REPORT.md DOMAIN.md campaign.json ledger.jsonl declaration.md references.bib MATRIX.md matrix.csv AUDIT.md provenance.json ro-crate-metadata.json BUNDLE.zip
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
- `rsx_write export` 复制 ≤2 MB 工件进 `BUNDLE.zip`（store-only，无压缩依赖），跳过项会列在 `skippedArtifacts`
- `references.bib` 由来源台账生成；`provenance.json` 是 **W3C PROV-JSON**（`prefix/entity/activity/agent` + `wasGeneratedBy/used/wasDerivedFrom/wasAttributedTo/wasAssociatedWith`，QName 与 `dsh:` 扩展属性，关系目标都可解析）；`ro-crate-metadata.json` 是 RO-Crate 1.1 JSON-LD，figure 通过 `about` 独立指向 source；三者都由同一份 state + `verify()` 渲染，不另读事件日志
- 所有时间戳 UTC ISO-8601

---

## token 开销（实测）

用 `tiktoken` cl100k/o200k 对**真实快照**分词（DeepSeek 分词器未公开，两者差异 <1%）：

| 组成 | cl100k | o200k |
| --- | ---: | ---: |
| 系统提示词 section | 653 | 640 |
| 14 个工具 schema | 6,616 | 6,608 |
| **每次请求固定开销** | **7,269** | **7,248** |

单项目读取开销（本机 0.4 验收项目 `rs-ad07b91f`，44 事件 / 10 工件 / 已发布）：`REPORT.md` 7,168 字符（4,308 cl100k / 3,716 o200k）、`campaign.json` 37,219 字符（14,538 / 13,378）、`ledger.jsonl` 17,315 字符（8,221 / 7,999）、`declaration.md` 304 字符（220 / 180）。领域字段与监测会随 campaign 增长。

复现：

```powershell
node scripts/measure-overhead.mjs
python scripts/measure_tokens.py --campaign "$env:DSH_HOME\research-suite\campaigns\rs-ad07b91f\exports" --out _artifacts
```

结果落在 `_artifacts/overhead-tokens.md` 与 `_artifacts/tokens.json`。7.27k/请求是“十四个工具常驻”的代价；不做科研时可在插件管家禁用整个 bundle，开销归零。

---

## 测试

```powershell
npm run check        # 语法 + client 构建新鲜度
npm test             # 72 个测试
```

覆盖：事件链与篡改/截断检测、状态 digest、跨实例与跨进程写锁、stale state、路径穿越、工件 64 MB 上限、非法 id、去重不重写、篡改修复、旧状态无 artifacts 数组、artifacts 目录双向对账（orphan_file / missing_entry）、读时 TOCTOU（同 fd 校验 + 内容哈希）、审查 HMAC 签名与验签失败阻断、损坏密钥 fail-closed、九道闸门逐项阻断、完整九阶段流程、四领域字段/规则/角色/监测、N/A 豁免与日期校验、领域审计与 DOMAIN.md 导出、领域模板传播、模板占位符、十四个工具 schema 与错误包装、自动化审查（引用/撤稿/引文失配/新鲜度/正文工件缺失/证据工件引用）、BibTeX 解析与往返（重复 key、kind 往返、100 条上限）、工件去重、图溯源、抽取矩阵/CSV（公式注入、表头特殊字符、空单元格）、PROV-JSON 关系解析与 RO-Crate figure→source 边、面板 HTTP、客户端纯函数。

工件边界与对账探针（不依赖测试框架，失败时退出码 1）：

```powershell
node scripts/repro-artifacts.mjs
node scripts/repro-orphans.mjs
```

---

## 验收

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
- 口径：该 campaign 的焊接数据是**固定种子的合成 DOE 夹具**，用于验证“真实命令 → 运行记录 → 数字 trace → 审计 → 导出”的管线，不是焊接物理结论；红队评审已把这一点写入记录。

---

## 边界与不做的事

- `rsx_run` **不执行命令**，只记录；agent 必须先用 shell/notebook 真跑，再登记真实输出。这是刻意设计：执行留在用户可审计的终端里。
- 不内置文献检索/PDF 解析；检索由 agent 与现有工具完成，套件负责登记、哈希与引用一致性。
- 不做统计推断；它检查“数字能否追到运行”，不检查“统计方法是否正确”（后者交给评审闸门与红队）。
- `provenance.json` 现在是 **W3C PROV-JSON** 最小完整视图（entity/activity/agent + 五类关系）；它不声称覆盖 PROV-O 的全部约束（如 `prov:wasInformedBy`、角色限定），严格约束校验请用 PROV 工具链再做一层。
- RO-Crate 的 figure→source 边用 `about` 表达“图解释该来源”；`isBasedOn` 仍指代码/数据工件，两者语义分开。
- 审查签名是**本机 HMAC**，密钥在同机数据目录：能挡住改 `state.json`/findings 后重算哈希，但挡不住拥有数据目录与密钥的本地攻击者；要更强 trust root 需外部 KMS/时间戳/透明日志。
- `stateHash` 是未加盐 SHA-256，能发现意外修改与不一致，但不是抗本地重算的签名；它与事件尾锚定，真正的不可否认性由审查签名提供。
- 写锁是本地文件锁，假设单个共享数据目录；跨主机共享盘（NFS/SMB）上的语义取决于文件系统，不声称分布式一致性。
- 工件读取已消除 `stat`→`read` 的常见 TOCTOU（单 fd + 读后校验），但无法阻止内核/文件系统层在两次 `fstat` 之间篡改同一 inode 的极端场景；内容哈希是最终判据。
- 演示项目的数据是**固定种子的合成队列**，用于验收管线，不是睡眠科学结论。

---

## License

MIT © 2026 YansongG-HKU
