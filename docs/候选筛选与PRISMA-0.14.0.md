# 候选级筛选与 PRISMA 2020 流量数据（0.14.0）

0.13 已经能把 Zotero/RIS/BibTeX 题录导入台账，也能用 DOI 精查补齐来源；但检索协议仍停留在一条 `searchLog` 的 `hits / screened / included` 聚合数。它能回答“检索到多少、初筛多少、纳入多少”，不能回答：哪条记录在标题阶段被排除、排除理由是什么、重复记录有几条、全文阶段又有多少不可得。0.14 补的是这层**候选级证据**，并把它变成可导出的 PRISMA 2020 流量数据，而不是新增一个“看起来像 PRISMA”的汇总字段。

## 1. 设计边界

| 维度 | 0.14 的选择 | 理由 |
| --- | --- | --- |
| 工具数 | 仍为 16 个 | `rsx_source` 已经拥有来源登记、导入、导出和 DOI 精查；筛选与来源同属“文献进出”，新增第 17 个工具会扩大常驻 schema |
| schema | 仍为 `PROGRAM_SCHEMA = 4` | `state.screening` 是惰性兼容字段；旧项目没有该字段时按空候选处理，不迁移、不重写旧状态 |
| 闸门 | 九道闸门不变 | 候选筛选是研究过程记录，不应把 survey 闸门改成“必须填满三阶段”；未完成项通过 `pending` 和 warnings 暴露 |
| 全文 | 不抓取、不解析 PDF | 0.14 只记录研究者/agent 已经做出的决策；PDF 抽取、全文比对与双人筛选是后续层 |
| PRISMA | 输出流量计数与流程图数据，不声称合规 | 计数可复核，但双人独立筛选、全文质量评价、检索覆盖等仍由人负责 |
| 兼容 | 0.13 的 `import/export/lookup` 与三种引用格式不变 | 筛选层只消费来源 id，不改变来源结构或引用渲染 |

## 2. 候选数据模型

候选 id 使用 `R-0001` 四位序号；它和运行 id `R-xxxxxxxxxx`（10 位十六进制）格式不同，工具参数也分属 `rsx_source` 与 `rsx_evidence`，不会冲突。

```json
{
  "id": "R-0001",
  "title": "From Black Box to Audit Trail",
  "doi": "10.55041/ijsrem53440",
  "year": 2025,
  "source": "S-0001",
  "duplicateOf": "",
  "decisions": {
    "title": {
      "decision": "include",
      "reason": "",
      "note": "",
      "reviewer": "YG",
      "at": "2026-11-18T17:26:12.080Z"
    },
    "abstract": null,
    "fullText": null
  },
  "createdAt": "2026-11-18T17:26:12.080Z",
  "updatedAt": "2026-11-18T17:26:12.112Z"
}
```

字段约束：

- `title` 最多 500 字符；`doi` 最多 200；`reviewer` 最多 120；单条决策备注最多 2,000；每项目最多 500 条候选。
- `source` 只接受本台账内已存在的 `S-xxxx`；创建候选时若给了 source，会复制缺失的 title/doi/year。
- `duplicateOf` 必须指向一个**保留的**候选；重复候选不能有阶段决策。重复项仍然占用一条识别记录，但会被 `duplicatesRemoved` 移除。
- 不传 `candidate` 时，按 DOI（其次精确标题）复用已有的保留候选，避免同一条记录被重复创建。要记录真正的重复题录，必须显式传 `duplicateOf`；不做模糊标题猜测。
- 每个决策保留 `reviewer` 和 `at`。重做同一阶段会覆盖 state 中的当前值，但每次写入都进入 `events.jsonl` 的 `screening.decided` 事件，事件带 `reviewer`、`note` 和自动清理的 `cleared` 字段，历史可由事件链复现。
- schema 仍为 4；`state.screening = { candidates: [] }` 由 `emptyState` 建立，旧状态由 `normalizeScreening` 惰性补齐。

## 3. 三阶段与排除理由

```text
title
  ├─ include ──────────> abstract
  ├─ maybe ────────────> pending
  └─ exclude (reason) ─> excluded at title/abstract
abstract
  ├─ include ──────────> full-text (title 也必须是 include)
  ├─ maybe ────────────> pending
  └─ exclude (reason) ─> excluded at title/abstract
full-text
  ├─ include           ──> included study
  ├─ exclude (reason)  ──> excluded report
  └─ exclude not-retrieved
```

代码强制两条一致性规则：全文决策要求标题与摘要都已是 `include`；标题/摘要改成 `exclude` 或 `maybe` 时，后续阶段决策会被自动清空，`screening.decided` 事件用 `cleared` 记录被清空的字段。标题与摘要之间的普通乱序仍允许（先写摘要再补标题），PRISMA 会产生 `decision_out_of_order` 警告并把这些记录留在 `pending`，不会把乱序数据伪装成完整流程。

理由代码是固定枚举，便于跨项目汇总：

| 代码 | 中文 |
| --- | --- |
| `not-relevant` | 不相关 |
| `wrong-population` | 人群不符 |
| `wrong-intervention` | 干预不符 |
| `wrong-comparator` | 对照不符 |
| `wrong-outcome` | 结局不符 |
| `wrong-design` | 设计不符 |
| `not-peer-reviewed` | 非同行评议 |
| `duplicate` | 重复记录 |
| `not-retrieved` | 全文不可得 |
| `insufficient-data` | 数据不足 |
| `other` | 其他 |

`exclude` 必须有理由；`not-retrieved` 只允许在 `full-text` 且必须是 `exclude`。`maybe` 是合法决策，但会计入 pending，不会被当成纳入或排除。

## 4. PRISMA 计数规则

PRISMA 2020 的流程图不是一条线性总和，而是“识别 → 去重 → 标题/摘要筛选 → 寻求全文 → 全文评估 → 纳入”，中间有排除和不可得分支。0.14 的计数由候选记录确定性重算，不读取聚合 searchLog 来补齐差额：

```text
recordsIdentified        = 所有候选（含重复）
duplicatesRemoved        = duplicateOf 非空的候选
recordsAfterDuplicates   = retained

titleAbstractScreened    = retained 中至少有 title 或 abstract 决策的
titleAbstractExcluded    = title.exclude ∪ abstract.exclude（按 id 去重）

reportsSought            = title.include ∩ abstract.include
reportsNotRetrieved      = reportsSought 中 fullText.exclude + reason=not-retrieved
reportsAssessed          = reportsSought 中 fullText 为 include 或非 not-retrieved 的 exclude
fullTextExcluded         = reportsAssessed 中 fullText.exclude（非 not-retrieved）
studiesIncluded          = reportsAssessed 中 fullText.include

pendingScreening         = retained - titleAbstractExcluded - reportsSought
pendingFullText          = reportsSought - included - fullTextExcluded - notRetrieved
pending                  = 两部分 id 的并集
complete                 = 有候选 且 pending 为空 且 consistency.ok
```

注意：

- `recordsScreened` 是“已经出现筛选决策”的记录数，不是 `recordsAfterDuplicates`。尚未处理的候选单独放在 `pendingScreening`，避免把“还没筛”说成“筛过且未排除”。
- `reportsSought` 包含尚未做全文决策的记录；`reportsAssessed` 只包含真正有全文结论（include 或非 not-retrieved 的 exclude）的记录。`full-text` 的 `maybe` 留在 `pendingFullText`。
- `reportsNotRetrieved` 是 PRISMA 的独立分支，不从 `reportsAssessed` 里再扣一次。
- 没有候选时 `complete=false`，输出零计数和 `no_candidates` 警告；`pending` 不为零时输出 `screening_pending`。这些是数据提示，不是闸门阻断。
- `consistency.ok` 是数据一致性诊断，不是闸门：格式错误候选、乱序、排除后仍有后续决策、重复项带决策、孤儿重复、重复指向重复都会让它为 `false`，并在 `consistency.codes` 列出代码；`complete` 不会在这些警告存在时为真。`no_search_log`、`included_without_source` 等来源完整性警告仍只作为提示，不改变 `consistency`。

## 5. 工具接口

### 5.1 记录决策

```json
{
  "action": "screen",
  "campaign": "rs-a874c2ae",
  "source": "S-0001",
  "stage": "title",
  "decision": "include",
  "reviewer": "YG"
}
```

后续阶段用 `candidate:"R-0001"` 定位：

```json
{
  "action": "screen",
  "campaign": "rs-a874c2ae",
  "candidate": "R-0001",
  "stage": "abstract",
  "decision": "exclude",
  "reason": "wrong-outcome",
  "notes": "结局指标与本研究不同",
  "reviewer": "YG"
}
```

记录重复：

```json
{
  "action": "screen",
  "campaign": "rs-a874c2ae",
  "duplicateOf": "R-0001"
}
```

返回 `{candidate, counts, complete, duplicate, created}`，其中 `counts` 是即时 PRISMA 计数，不需要再调一次 `prisma`；`complete` 同时要求无 pending 且 `consistency.ok`。重复项返回 `duplicate:true`，且没有阶段决策。

### 5.2 读取 PRISMA

```json
{ "action": "prisma", "campaign": "rs-a874c2ae" }
```

返回：

```json
{
  "standard": "PRISMA 2020",
  "complete": true,
  "counts": { "recordsIdentified": 4, "duplicatesRemoved": 1, "studiesIncluded": 1, "pending": 0 },
  "stages": {
    "title": { "decided": 3, "include": 3, "exclude": 0, "maybe": 0, "missing": 0, "reasons": {} },
    "abstract": { "decided": 3, "include": 2, "exclude": 1, "maybe": 0, "missing": 0, "reasons": { "wrong-outcome": 1 } },
    "fullText": { "decided": 2, "include": 1, "exclude": 1, "maybe": 0, "missing": 0, "reasons": { "not-retrieved": 1 } }
  },
  "duplicates": { "removed": 1, "pairs": [{ "id": "R-0004", "duplicateOf": "R-0001" }] },
  "pending": { "total": 0, "screening": 0, "fullText": 0, "candidateIds": [] },
  "included": { "studies": 1, "candidateIds": ["R-0001"] },
  "flow": { "nodes": [], "edges": [] },
  "warnings": [],
  "records": []
}
```

`flow.nodes/edges` 是稳定 id 的图数据，可直接交给前端图形库；`PRISMA.md` 另用同一对象生成 Mermaid。`search` 字段只放检索协议摘要，作为来源，不参与候选计数。

## 6. 导出与面板

`rsx_write action:"export"` 新增：

- `PRISMA.json`：完整 `buildPrisma` 对象，含 `flow` 与 `records`；可用于审计、重绘或二次分析。
- `PRISMA.md`：流量计数、三阶段表、排除理由、Mermaid 图、候选明细和数据提示。
- `PRISMA.csv`：每条候选一行，三阶段决策、理由、备注、reviewer、时间，便于 Excel/Rayyan 复核。

三者都写进 `paths` 和 `BUNDLE.zip`；`REPORT.md` §17.1 列出文件名，§17.2 嵌入报告正文。

面板路由：

```text
GET /api/prisma/:id                -> { format:"json", prisma }
GET /api/prisma/:id?format=markdown -> { format:"markdown", content, counts }
GET /api/prisma/:id?format=csv      -> { format:"csv", content, counts }
```

审查视图的“下载 PRISMA”按钮拉取 JSON。`POST /api/campaign action:"screen"` 与工具走同一个 `sourceScreen`，用于面板侧和真实回环验收；写请求仍要求 `x-dsh-research-suite:1` 与同源 Origin。

## 7. 测试与真实验收

单元测试 `test/unit/screening.test.mjs` 覆盖：

1. 三个阶段的写入、来源链接、reviewer 与 schema 4 不变；
2. 缺失/非法理由、`not-retrieved` 在标题阶段被拒；
3. 显式重复、重复计数、重复不可再筛、目标不存在；
4. 待处理计数、乱序警告、`complete` 的语义；
5. 非 `include` 清理后续阶段、全文前置条件、失败写入回滚、`consistency` 与篡改状态、格式错误候选、重复指向重复、CSV 公式中和；
6. PRISMA JSON/Markdown/CSV 内容、Mermaid、BUNDLE.zip 条目与 `REPORT.md` §17.2。

全量 **164/164** 通过；`npm run check`、`npm run rsi`（100/A/L4）、`npm run rsi:suite`（5/5）通过；devkit `verify` run `20261118-180332-8ghv6g`（boundary/version/unit，164 tests / 9,991 ms），`trend` health 100、pass rate 100%、最新耗时 Δ-7.6%。固定开销 **12,231 cl100k / 12,199 o200k**，相对 0.13 增加 **332/332**（约 +2.8%）。

真实验收使用既有项目 `rs-a874c2ae`（假设阶段，8 个真实来源），通过已安装面板的 `POST /api/campaign action:"screen"` 写入 4 条候选：

| 候选 | 来源 | 标题 | 摘要 | 全文 |
| --- | --- | --- | --- | --- |
| R-0001 | S-0001 | include | include | include |
| R-0002 | S-0002 | include | exclude / wrong-outcome | — |
| R-0003 | S-0003 | include | include | exclude / not-retrieved |
| R-0004 | 重复 R-0001 | — | — | — |

结果：识别 4、重复 1、去重后 3、标题/摘要排除 1、寻求全文 2、全文不可得 1、全文评估 1、纳入 1、待处理 0；`complete=true`、`consistency.ok=true`，`PRISMA.md` 2,168 字符，`PRISMA.csv` 1,466 字符，state `schema=4`、`chainOk=true`、`stateOk=true`。验收文件保存在 `_artifacts/live-prisma/`，是接口返回后落盘的文本，不是根据设计推断。

同一安装实例上还做了两次拒绝验收：缺排除理由的新候选返回 400，候选数仍为 4 且没有幽灵标题；对摘要已排除的 `R-0002` 直接写全文决策返回 400，`fullText` 保持 `null`。两次拒绝后 PRISMA 仍为 `complete=true`、`consistency.ok=true`，记录在 `_artifacts/live-prisma/rejections.json`。

## 8. 已知边界

- 不自动判断相关性；`title/abstract/full-text` 是人工/agent 的决策记录，不是分类器输出。
- 不做双人独立筛选、一致性 κ、全文质量评价或 RoB 2；`reviewer` 只记录名字。
- 不解析 PDF、不抓取全文；`not-retrieved` 是用户给出的状态，不是网络探测结果。
- 重复只按显式 `duplicateOf` 计数；DOI/标题匹配仅用于复用已存在候选，不做模糊去重。
- PRISMA 数据可以复核计数和排除理由，但不构成 PRISMA 2020 合规认证，也不证明数据库覆盖完整。
- `complete` 只表示没有 pending 且没有一致性警告，不表示方法学充分；`consistency` 是诊断字段，不参与九道闸门，也不阻断导出。

## 9. 标准与参考

- [PRISMA 2020 statement](https://www.prisma-statement.org/)
- [PRISMA 2020 flow diagram](https://www.prisma-statement.org/prisma-2020-flow-diagram)
- [PRISMA 2020 checklist](https://www.prisma-statement.org/prisma-2020-checklist)
- [Cochrane Handbook, searching and selecting studies](https://training.cochrane.org/handbook)




