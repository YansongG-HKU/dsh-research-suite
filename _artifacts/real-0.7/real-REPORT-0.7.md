# 0.7 真实验收：schema-3 检索协议与敏感性闸门探针

> 研究包由科研套件（dsh-research-suite）生成。阶段：**发布** ｜ 档位 **M** ｜ 事件 49 条。

## 0. 状态

| 字段 | 值 |
| --- | --- |
| Campaign | rs-5495250c |
| 阶段 | 发布 (release) |
| 档位 | M · 400000 tokens 预算 |
| 模板 | 空白 |
| 领域 | 通用流程 |
| 闭环成熟度 | 100/100（A，L4 可审计闭环） |
| 创建 / 更新 | 2026-11-17T17:49:54.648Z / 2026-11-17T17:49:56.480Z |
| 事件链 | 完整（49 条） |
| 工件 | 11 个 |

## 1. 研究问题与边界

**问题**：第三代 schema 的检索协议与敏感性记录，是否真的改变 survey 与 analyze 的闸门判定？

**边界**：只覆盖本机插件服务与纯闸门函数，在隔离临时库中构造的五个确定性探针；不外推到真实文献检索的召回率或统计敏感性。

**成功判据**：缺检索协议时 survey 阻断 search_protocol，缺敏感性时 analyze 阻断 sensitivity；补齐后放行；早期 schema 负对照不触发同名阻断；release 闸门全过。

## 2. 世界模型

| 类别 | 键 | 值 |
| --- | --- | --- |
| question | main | 版本化闸门是否按记录缺失阻断 |
| coverage | gate-protocol | searchLog / sensitivity / prereg timing |
| coverage | negative-control | schema-1 advisory path |
| novelty | nearest | {"checked":true,"nearest":"0.6 的 evidence rigor; 0.7 adds protocol and robustness records"} |
| novelty | checked | true |
| failure | all-missing-block | 早期 schema 负对照否定了“所有缺失都会阻断”的替代解释。 |
| safety | dual_use | pass |

## 3. 来源

| ID | 标题 | 年份 | 类型 | 可信度 | DOI / URL | 内容哈希 |
| --- | --- | --- | --- | --- | --- | --- |
| S-0001 | 探针：缺检索协议 | 2026 | dataset | primary | file:///F:/dsh插件创造/_artifacts/real-0.7/source-missing_search.json | sha256:a6477… |
| S-0002 | 探针：补齐检索协议 | 2026 | dataset | primary | file:///F:/dsh插件创造/_artifacts/real-0.7/source-with_search.json | sha256:c8b72… |
| S-0003 | 探针：缺敏感性记录 | 2026 | dataset | primary | file:///F:/dsh插件创造/_artifacts/real-0.7/source-missing_sensitivity.json | sha256:78ca8… |
| S-0004 | 探针：补齐敏感性记录 | 2026 | dataset | primary | file:///F:/dsh插件创造/_artifacts/real-0.7/source-with_sensitivity.json | sha256:39089… |
| S-0005 | 探针：早期 schema 负对照 | 2026 | dataset | primary | file:///F:/dsh插件创造/_artifacts/real-0.7/source-legacy_negative.json | sha256:2346f… |
| S-0006 | README 0.7 能力与边界 | 2026 | report | secondary | file:///F:/dsh插件创造/workspace/dsh-research-suite/README.md | sha256:2a48f… |
| S-0007 | 研究闭环 0.7 设计 | 2026 | report | secondary | file:///F:/dsh插件创造/workspace/dsh-research-suite/docs/研究闭环-0.7.0.md | sha256:c2da4… |
| S-0008 | CHANGELOG 0.7.0 | 2026 | report | secondary | file:///F:/dsh插件创造/workspace/dsh-research-suite/CHANGELOG.md | sha256:14d8f… |

## 3.1 检索协议

检索记录 1 条（否证 1）· 命中/初筛/纳入 5/5/4。检索在外部执行，本表只登记可复核的查询与筛选计数。

| ID | 类型 | 数据库 | 查询 | 日期范围 | 命中 | 初筛 | 纳入 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-0001 | disconfirming | local gate-probe | schema three search protocol sensitivity null result | 2026-01-01 – 2026-12-31 | 5 | 5 | 4 |

## 4. 断言与证据

| ID | 类型 | 断言 | 状态 | 置信度 | 证据 |
| --- | --- | --- | --- | --- | --- |
| C-0001 | hypothesis | 在第三代 schema 中，缺少检索协议或敏感性记录会分别阻断 survey 与 analyze；补齐记录后同一阶段放行。 | supported | 0.8 | 2 |
| C-0002 | claim | 早期 schema 上同一缺失检索不触发 search_protocol 阻断。 | supported | 0.75 | 1 |

| 证据 | 断言 | 关系 | 引用 | 定位 | 摘录 |
| --- | --- | --- | --- | --- | --- |
| E-0001 | C-0001 | supports | S-0001 | case missing_search | 缺少检索协议时 survey 闸门阻断 |
| E-0002 | C-0001 | supports | S-0003 | case missing_sensitivity | 缺少敏感性记录时 analyze 闸门阻断 |
| E-0003 | C-0002 | supports | S-0005 | case legacy_negative | 早期 schema 项目上同一缺失不阻断，只作为 advisory |

## 4.1 敏感性分析

换一种合理设定后结论是否仍成立。方向只描述本次分析，不是对真实效应的裁决。

| ID | 名称 | 方法 | 设定 | 结果 | 方向 | 追溯 |
| --- | --- | --- | --- | --- | --- | --- |
| Z-0001 | schema-one negative control | negative-control | 把同一缺失检索的 state 标为早期 schema 后重跑 gate，隔离版本化契约的影响。 | 早期 schema 不触发 search_protocol 阻断；第三代 schema 触发。 | consistent | run:R-c292d0fe5f#legacy_missing_search_blocked |

## 5. 数字台账

| ID | 名称 | 值 | 单位 | 不确定性 | 溯源 | 校验 |
| --- | --- | --- | --- | --- | --- | --- |
| N-0001 | blocked_cases | 2 | case | 确定性探针：五个预设案例中的阻断数，不构成抽样置信区间 | run:R-c292d0fe5f#blocked_cases | ok |

## 6. 运行

| ID | 阶段 | 状态 | 种子 | 对照 | 指标 | 命令 |
| --- | --- | --- | --- | --- | --- | --- |
| R-c292d0fe5f | design | success | 7 | — | {"missing_search_blocked":1,"with_search_passed":1,"missing_sensitivity_blocked":1,"with_sensitivity_passed":1,"legacy_missing_search_blocked":0,"probe_cases":5,"blocked_cases":2} | node "F:\dsh插件创造\_artifacts\real-0.7\probe.mjs" --seed 7 |
| R-c8d30f8079 | design | success | 7 | negative | {"legacy_missing_search_blocked":0,"blocked_cases":0} | node "F:\dsh插件创造\_artifacts\real-0.7\probe.mjs" --seed 7 --negative |

## 7. 图

| ID | 标题 | 工件 | 代码 | 数据 | 环境 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — |

## 8. 评审

| ID | 评审人 | 角色 | 独立 | 机构 / 利益冲突 | 对抗 | 结论 | 阻断问题 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V-0001 | 方法与统计评审 | — | 是 | 独立统计评审组 / none | 否 | minor | 0 |
| V-0002 | 红队评审 | — | 是 | 独立红队 / none | 是 | accept | 0 |

## 9. 闸门历史

| 阶段 | 最近结果 | 通过 / 总项 | 阻断项 | 时间 |
| --- | --- | --- | --- | --- |
| 定题 | pass | 5/5 |  | 2026-11-17T17:49:54.815Z |
| 文献测绘 | pass | 9/9 |  | 2026-11-17T17:49:54.892Z |
| 假设 | pass | 9/9 |  | 2026-11-17T17:49:54.915Z |
| 设计 | pass | 10/10 |  | 2026-11-17T17:49:56.224Z |
| 执行 | pass | 8/8 |  | 2026-11-17T17:49:56.268Z |
| 分析 | pass | 11/11 |  | 2026-11-17T17:49:56.299Z |
| 写作 | pass | 7/7 |  | 2026-11-17T17:49:56.397Z |
| 评审 | pass | 6/6 |  | 2026-11-17T17:49:56.411Z |
| 发布 | pass | 12/12 |  | 2026-11-17T17:49:56.427Z |

## 10. 预算

| 字段 | 值 |
| --- | --- |
| 档位 | M（建议 agents ≤ 3） |
| tokens | 0 / 400000 |
| 时长（秒） | 0 / 14400 |
| 超限 | 无 |

## 11. 复现命令

- `node "F:\dsh插件创造\_artifacts\real-0.7\probe.mjs" --seed 7`（R-c292d0fe5f，seed 7）
- `node "F:\dsh插件创造\_artifacts\real-0.7\probe.mjs" --seed 7 --negative`（R-c8d30f8079，seed 7）

事件链与工件校验：

```bash
# 事件链（SHA-256，前一条的 hash 进入下一条）
sha256sum ledger.jsonl
```

## 12. 声明

- 模型 / 工具：DeepSeek Harness · dsh-research-suite
- 人工复核人：YG
- AI 参与：是 ｜ 水印：已添加

## 13. 当前阻断与下一步

当前阶段 **发布** 已满足闸门，可以推进。

## 14. 最近事件

| seq | 时间 | 类型 | actor |
| --- | --- | --- | --- |
| 38 | 2026-11-17T17:49:56.324Z | review.added | agent |
| 39 | 2026-11-17T17:49:56.338Z | declaration.set | agent |
| 40 | 2026-11-17T17:49:56.352Z | world.set | agent |
| 41 | 2026-11-17T17:49:56.363Z | release.approved | agent |
| 42 | 2026-11-17T17:49:56.384Z | audit.recorded | agent |
| 43 | 2026-11-17T17:49:56.399Z | stage.advanced | agent |
| 44 | 2026-11-17T17:49:56.413Z | stage.advanced | agent |
| 45 | 2026-11-17T17:49:56.429Z | campaign.released | agent |
| 46 | 2026-11-17T17:49:56.440Z | monitoring.updated | agent |
| 47 | 2026-11-17T17:49:56.443Z | monitoring.observed | agent |
| 48 | 2026-11-17T17:49:56.466Z | loop.evaluated | agent |
| 49 | 2026-11-17T17:49:56.477Z | report.rendered | agent |

## 15. 自动化审查

- 结论：**通过（无阻断、无主要问题）**
- 审查 ID：A-0001
- 审查时间：2026-11-17T17:49:56.381Z
- 对象哈希：`14145feb4b601bd70208f9b4a3a1e5da22d0f42bd632c2997325747a5c6b2aba`
- 签名：HMAC-SHA256 / 2bf5ca3613676c83
- 计数：blocking 0 · major 0 · minor 1 · info 0

### minor

| code | 问题 | 详情 | ref |
| --- | --- | --- | --- |
| `extraction_coverage` | 抽取矩阵覆盖不足 | 已覆盖 1/8 条来源，建议至少 3 条。 |  |


## 16. 证据抽取矩阵

- 维度：1 · 来源：8 · 已覆盖：1

| 来源 | 年份 | blocked |
| --- | --- | --- |
| S-0001 探针：缺检索协议 | 2026 | 1 |
| S-0002 探针：补齐检索协议 | 2026 | — |
| S-0003 探针：缺敏感性记录 | 2026 | — |
| S-0004 探针：补齐敏感性记录 | 2026 | — |
| S-0005 探针：早期 schema 负对照 | 2026 | — |
| S-0006 README 0.7 能力与边界 | 2026 | — |
| S-0007 研究闭环 0.7 设计 | 2026 | — |
| S-0008 CHANGELOG 0.7.0 | 2026 | — |


## 17. 文献与溯源文件

- `references.bib`：由来源台账生成的 BibTeX（可直接导入 Zotero / Overleaf）。
- `SEARCH.md`：检索协议、查询窗口与命中/初筛/纳入计数。
- `SENSITIVITY.md`：换设定后的稳健性记录。
- `MATRIX.md` / `matrix.csv`：证据抽取矩阵的 Markdown 与 CSV 版本。
- `AUDIT.md`：自动化审查的完整发现。
- `LOOP.md`：12 维闭环成熟度、缺口与自我改进前提（运行评估后生成）。
- `provenance.json`：W3C PROV-JSON（实体、活动、代理与五类 PROV 关系）。
- `ro-crate-metadata.json`：RO-Crate 1.1 JSON-LD，含 figure→source 的独立 `about` 边，可用于 FAIR 交换与长期归档。

## 18. 发布后监测（闭环）

| 字段 | 值 |
| --- | --- |
| 状态 | active |
| 监测计划 | 发布后若 schema-3 新增检查的阻断行为变化，重跑探针并回到 analyze。 |
| 负责人 | YG |
| 复查频率 | per release |
| 信号 | blocked_cases, legacy_missing_search_blocked |
| 指标 / 观测 | 2 / 2 |
| 告警 / 缺口 | 0 / 0 |
| 最近复查 | 2026-11-17T17:49:56.438Z |
| 备注 | — |

| 指标 | 目标 / 容差 | 方向 | 最新观测 | 状态 |
| --- | --- | --- | --- | --- |
| blocked_cases | 2 ± 0 | higher | 2 | ok |
| legacy_missing_search_blocked | 0 ± 0 | higher | 0 | ok |

## 19. 研究闭环评估

- 项目：**0.7 真实验收：schema-3 检索协议与敏感性闸门探针**
- 成熟度：**100/100**（A）· L4 可审计闭环
- 基线：100/100；相对基线 +0
- 领域：通用流程 · 阶段：release
- 评估时间：2026-11-17T17:49:56.464Z

| 维度 | 权重 | 通过 | 得分 |
| --- | ---: | ---: | ---: |
| 问题与边界 (`question`) | 6 | 4/4 | 100% |
| 证据测绘 (`survey`) | 10 | 10/10 | 100% |
| 可证伪假设 (`hypothesis`) | 10 | 11/11 | 100% |
| 预注册设计 (`design`) | 7 | 11/11 | 100% |
| 可复现执行 (`execution`) | 13 | 8/8 | 100% |
| 数字与引文追溯 (`traceability`) | 10 | 13/13 | 100% |
| 自动化审计 (`audit`) | 10 | 6/6 | 100% |
| 独立评审 (`review`) | 9 | 6/6 | 100% |
| 领域适用性 (`domain`) | 7 | 1/1 | 100% |
| 发布后监测 (`monitoring`) | 8 | 9/9 | 100% |
| 发布声明 (`release`) | 6 | 10/10 | 100% |
| 台账完整性 (`integrity`) | 4 | 4/4 | 100% |

所有维度通过；仍需用同一评估器在改动后重跑并比较基线。

### 自我改进前提

- ✅ 新鲜、验签通过且无 blocking 的自动化审计
- ✅ 两名独立评审人（领域项目还要覆盖两个角色）
- ✅ 监测有指标、有观测、无未处理告警且每个信号都有指标覆盖
- ✅ 闭环成熟度 ≥85

> 这是“可自我改进闭环”的工程前提，不是智能水平或 AGI 测量；候选改动必须在同一评估器上重跑并与基线比较。

> 评分只检查工程可复核性，不判断科学结论、临床有效性、法律合规或投资建议是否正确。

---

由 dsh-research-suite 生成；数字与引用以 `campaign.json` 为准。
