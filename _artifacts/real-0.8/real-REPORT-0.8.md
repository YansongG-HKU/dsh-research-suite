# 0.8 真实验收：schema-4 研究程序与 review 闸门

> 研究包由科研套件（dsh-research-suite）生成。阶段：**发布** ｜ 档位 **M** ｜ 事件 65 条。

## 0. 状态

| 字段 | 值 |
| --- | --- |
| Campaign | rs-f7edf967 |
| 阶段 | 发布 (release) |
| 档位 | M · 400000 tokens 预算 |
| 模板 | 空白 |
| 领域 | 通用流程 |
| 闭环成熟度 | 100/100（A，L4 可审计闭环） |
| 创建 / 更新 | 2026-11-17T20:12:33.827Z / 2026-11-17T20:17:48.367Z |
| 事件链 | 完整（65 条） |
| 工件 | 11 个 |

## 1. 研究问题与边界

**问题**：在 schema-4 中，缺少计划/视角/循环/锦标赛/质量评分/矛盾台账是否会让 review 闸门阻断，补齐后是否放行？

**边界**：只覆盖本机插件服务、纯闸门函数与确定性探针；不估计多智能体系统在真实科研任务上的效应，也不声称程序记录等于科学发现。

**成功判据**：缺程序、开放矛盾、低质量评分三类案例阻断 program_complete；补齐案例与早期 schema 负对照不阻断；release 闸门全过。

## 2. 世界模型

| 类别 | 键 | 值 |
| --- | --- | --- |
| question | main | 程序完整性是否真的改变评审闸门 |
| coverage | program-contract | plan / perspectives / autonomy / cycles / tournament / rubric / contradictions |
| coverage | schema-negative | schema-3 advisory path |
| novelty | nearest | {"checked":true,"nearest":"0.7 的检索协议与敏感性；0.8 增加程序级计划、视角、锦标赛、质量评分与矛盾台账"} |
| novelty | checked | true |
| failure | program-is-only-docs | 程序检查若只改文档不动闸门，缺程序案例不会阻断；探针专门否定该替代解释。 |
| safety | dual_use | pass |

## 3. 来源

| ID | 标题 | 年份 | 类型 | 可信度 | DOI / URL | 内容哈希 |
| --- | --- | --- | --- | --- | --- | --- |
| S-0001 | Anthropic: How we built our multi-agent research system | 2025 | report | primary | https://www.anthropic.com/engineering/multi-agent-research-system | sha256:a631d… |
| S-0002 | Anthropic: Building effective agents | 2024 | report | primary | https://www.anthropic.com/engineering/building-effective-agents | sha256:45628… |
| S-0003 | Co-Scientist: Accelerating scientific discovery with a multi-agent system | 2025 | paper | primary | 10.48550/arXiv.2502.18864 | sha256:12f68… |
| S-0004 | Kosmos: An AI Scientist for Autonomous Discovery | 2025 | paper | primary | 10.48550/arXiv.2511.02824 | sha256:c2c80… |
| S-0005 | PaperQA2: Language agents achieve superhuman synthesis of scientific knowledge | 2024 | paper | primary | 10.48550/arXiv.2409.13740 | sha256:51619… |
| S-0006 | STORM: Assisting in Writing Wikipedia-like Articles From Scratch | 2024 | paper | primary | 10.48550/arXiv.2402.14207 | sha256:357de… |
| S-0007 | The AI Scientist-v2: Workshop-Level Automated Scientific Discovery | 2025 | paper | primary | 10.48550/arXiv.2504.08066 | sha256:7d5c7… |
| S-0008 | dsh-research-suite 0.8 README and CHANGELOG | 2026 | report | secondary | file:///F:/dsh插件创造/workspace/dsh-research-suite/README.md | sha256:54dfc… |
| S-0009 | 0.8 程序探针：exploratory | 2026 | dataset | primary | file:///F:/dsh插件创造/_artifacts/real-0.8/probe-exploratory.json | sha256:e061a… |
| S-0010 | 0.8 程序探针：negative | 2026 | dataset | primary | file:///F:/dsh插件创造/_artifacts/real-0.8/probe-negative.json | sha256:42b54… |

## 3.1 检索协议

检索记录 1 条（否证 1）· 命中/初筛/纳入 48/14/8。检索在外部执行，本表只登记可复核的查询与筛选计数。

| ID | 类型 | 数据库 | 查询 | 日期范围 | 命中 | 初筛 | 纳入 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-0001 | disconfirming | OpenAlex / arXiv / Anthropic engineering index | multi-agent research programme null result contradictory evidence | 2023-01-01 – 2026-12-31 | 48 | 14 | 8 |

## 3.2 研究计划与视角

目标：用可复核的计划、视角、自治策略、锦标赛、质量评分和矛盾台账，验证程序完整性是否真的改变评审闸门。计划 3 个问题、3 个视角、1 条行动循环。

| ID | 问题 | 优先级 | 负责人 | 状态 | 覆盖 |
| --- | --- | --- | --- | --- | --- |
| G-0001 | 缺少程序记录时 review 是否阻断 program_complete？ | high | lead | open | S-0009 |
| G-0002 | 开放矛盾或低质量评分是否同样阻断？ | high | evaluator | open | S-0005 |
| G-0003 | 多智能体编排的成本是否要求显式停止规则？ | medium | architect | open | S-0001, S-0003 |

| ID | 视角 | 利益相关方 | 问题 | 来源 |
| --- | --- | --- | --- | --- |
| O-0001 | 系统架构师 | 编排与工具设计 | 规划、并行子代理与停止条件如何落到可检查状态？ | S-0002, S-0004 |
| O-0002 | 独立评审 | 方法与统计评审 | 程序记录是否足以让外部评审者复核，而不是只相信代理自述？ | S-0005, S-0003 |
| O-0003 | 领域作者 | 论文写作与来源选择 | 多视角提问和引用是否降低覆盖缺口与来源偏差？ | S-0006, S-0007 |

| 自治项 | 值 |
| --- | --- |
| 最大循环 | 3 |
| 停止条件 | 所有预设探针运行完毕、无开放矛盾且质量评分不低于 0.7 时停止。 |
| 升级条件 | 出现方向相反的独立证据或闸门行为与预期不符时升级给人类评审。 |
| 人类检查点 | 发布前由人类评审者核对探针输出、负对照、程序记录与导出包。 |

## 4. 断言与证据

| ID | 类型 | 断言 | 状态 | 置信度 | 证据 |
| --- | --- | --- | --- | --- | --- |
| C-0001 | hypothesis | 在 schema-4 中，缺少程序记录、开放矛盾或低质量评分会让 review 闸门阻断 program_complete；补齐后放行。 | supported | 0.82 | 3 |
| C-0002 | claim | 程序检查只是文档字段，不会改变 review 闸门的放行/阻断。 | refuted | 0.35 | 1 |

| 证据 | 断言 | 关系 | 引用 | 定位 | 摘录 |
| --- | --- | --- | --- | --- | --- |
| E-0001 | C-0001 | supports | S-0009 | cases.missing_program | "missing_program": { |
| E-0002 | C-0001 | supports | S-0010 | cases.legacy_schema3 | "legacy_missing_blocked" |
| E-0003 | C-0002 | refutes | S-0009 | cases.missing_program | "blocked": true |
| E-0004 | C-0001 | supports | R-aea7ced359 | metrics.blocked_cases | blocked_cases=3 |

## 4.1 敏感性分析

换一种合理设定后结论是否仍成立。方向只描述本次分析，不是对真实效应的裁决。

| ID | 名称 | 方法 | 设定 | 结果 | 方向 | 追溯 |
| --- | --- | --- | --- | --- | --- | --- |
| Z-0001 | schema-3 negative control | negative-control | 把同一缺程序的 state 标为 schema 3 后重跑 review gate，隔离版本化契约的影响。 | schema-3 不触发 program_complete 阻断；schema-4 触发。 | consistent | run:R-54a0d0375e#legacy_missing_blocked |

## 4.2 假设锦标赛、质量评分与矛盾台账

锦标赛是记录下来的两两判断，Elo 只反映这些判断的顺序，不证明胜者真实。

| 排名 | 断言 | Elo | 胜/负/平 | 场次 |
| --- | --- | --- | --- | --- |
| 1 | C-0001 在 schema-4 中，缺少程序记录、开放矛盾或低质量评分会让 review 闸门阻断 program_complete；补齐后放行。 | 1016 | 1/0/0 | 1 |
| 2 | C-0002 程序检查只是文档字段，不会改变 review 闸门的放行/阻断。 | 984 | 0/1/0 | 1 |

最新质量评分 Y-0001（自动化质量评分）总分 0.863。

| 维度 | 分数 |
| --- | --- |
| 事实准确性 | 0.86 |
| 引用准确性 | 0.9 |
| 完整性 | 0.84 |
| 来源质量 | 0.88 |
| 工具效率 | 0.8 |
| 局限与风险 | 0.9 |

| ID | 断言 | 证据 A | 证据 B | 状态 | 处置 |
| --- | --- | --- | --- | --- | --- |
| D-0001 | C-0001 | S-0001 | S-0005 | explained | 两者任务不同：前者是广度检索与多代理编排，后者是文献综合与矛盾检测；程序层可以同时容纳单代理与多代理路径，因此不是直接冲突。 |

## 5. 数字台账

| ID | 名称 | 值 | 单位 | 不确定性 | 溯源 | 校验 |
| --- | --- | --- | --- | --- | --- | --- |
| N-0001 | blocked_cases | 3 | case | 确定性夹具：六个预设案例中的阻断数，不构成抽样置信区间 | run:R-aea7ced359#blocked_cases | ok |

## 6. 运行

| ID | 阶段 | 状态 | 种子 | 对照 | 指标 | 命令 |
| --- | --- | --- | --- | --- | --- | --- |
| R-aea7ced359 | execute | success | 7 | — | {"blocked_cases":3,"missing_blocked":1,"complete_blocked":0,"open_contradiction_blocked":1,"resolved_contradiction_blocked":0,"low_quality_blocked":1,"legacy_blocked":0} | node "F:\dsh插件创造\_artifacts\real-0.8\probe.mjs" --seed 7 |
| R-54a0d0375e | execute | success | 7 | negative | {"legacy_missing_blocked":0,"blocked_cases":0} | node "F:\dsh插件创造\_artifacts\real-0.8\probe.mjs" --seed 7 --negative |

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
| 定题 | pass | 5/5 |  | 2026-11-17T20:12:33.950Z |
| 文献测绘 | pass | 9/9 |  | 2026-11-17T20:12:34.323Z |
| 假设 | pass | 9/9 |  | 2026-11-17T20:12:34.441Z |
| 设计 | pass | 10/10 |  | 2026-11-17T20:12:34.478Z |
| 执行 | pass | 8/8 |  | 2026-11-17T20:12:34.963Z |
| 分析 | pass | 11/11 |  | 2026-11-17T20:12:35.082Z |
| 写作 | pass | 7/7 |  | 2026-11-17T20:12:35.143Z |
| 评审 | pass | 7/7 |  | 2026-11-17T20:12:35.297Z |
| 发布 | pass | 12/12 |  | 2026-11-17T20:12:35.321Z |

## 10. 预算

| 字段 | 值 |
| --- | --- |
| 档位 | M（建议 agents ≤ 3） |
| tokens | 0 / 400000 |
| 时长（秒） | 0 / 14400 |
| 超限 | 无 |

## 11. 复现命令

- `node "F:\dsh插件创造\_artifacts\real-0.8\probe.mjs" --seed 7`（R-aea7ced359，seed 7）
- `node "F:\dsh插件创造\_artifacts\real-0.8\probe.mjs" --seed 7 --negative`（R-54a0d0375e，seed 7）

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
| 54 | 2026-11-17T20:12:35.181Z | review.added | agent |
| 55 | 2026-11-17T20:12:35.200Z | declaration.set | agent |
| 56 | 2026-11-17T20:12:35.221Z | world.set | agent |
| 57 | 2026-11-17T20:12:35.236Z | release.approved | agent |
| 58 | 2026-11-17T20:12:35.279Z | audit.recorded | agent |
| 59 | 2026-11-17T20:12:35.301Z | stage.advanced | agent |
| 60 | 2026-11-17T20:12:35.324Z | campaign.released | agent |
| 61 | 2026-11-17T20:12:35.341Z | monitoring.updated | agent |
| 62 | 2026-11-17T20:12:35.346Z | monitoring.observed | agent |
| 63 | 2026-11-17T20:12:35.377Z | loop.evaluated | agent |
| 64 | 2026-11-17T20:12:35.391Z | report.rendered | agent |
| 65 | 2026-11-17T20:17:48.360Z | report.rendered | agent |

## 15. 自动化审查

- 结论：**通过（无阻断、无主要问题）**
- 审查 ID：A-0001
- 审查时间：2026-11-17T20:12:35.275Z
- 对象哈希：`e16cb0958bd2807925cd703c3a950f10d70d30030ba64d23c1c3ca7946be4446`
- 签名：HMAC-SHA256 / 2bf5ca3613676c83
- 计数：blocking 0 · major 0 · minor 2 · info 0

### minor

| code | 问题 | 详情 | ref |
| --- | --- | --- | --- |
| `claim_evidence_weak` | 证据引文与断言词面不匹配 | C-0001 的 E-0001（weak，覆盖率 0）没有覆盖断言关键词；请人工确认是否真的支持。 | C-0001 |
| `claim_evidence_weak` | 证据引文与断言词面不匹配 | C-0001 的 E-0002（weak，覆盖率 0）没有覆盖断言关键词；请人工确认是否真的支持。 | C-0001 |


## 16. 证据抽取矩阵

- 维度：3 · 来源：10 · 已覆盖：3

| 来源 | 年份 | reported_gain | contradictions_per_paper | statement_accuracy |
| --- | --- | --- | --- | --- |
| S-0001 Anthropic: How we built our multi-agent research system | 2025 | 0.902 | — | — |
| S-0002 Anthropic: Building effective agents | 2024 | — | — | — |
| S-0003 Co-Scientist: Accelerating scientific discovery with a multi-agent system | 2025 | — | — | — |
| S-0004 Kosmos: An AI Scientist for Autonomous Discovery | 2025 | — | — | 0.794 |
| S-0005 PaperQA2: Language agents achieve superhuman synthesis of scientific knowledge | 2024 | — | 2.34 | — |
| S-0006 STORM: Assisting in Writing Wikipedia-like Articles From Scratch | 2024 | — | — | — |
| S-0007 The AI Scientist-v2: Workshop-Level Automated Scientific Discovery | 2025 | — | — | — |
| S-0008 dsh-research-suite 0.8 README and CHANGELOG | 2026 | — | — | — |
| S-0009 0.8 程序探针：exploratory | 2026 | — | — | — |
| S-0010 0.8 程序探针：negative | 2026 | — | — | — |


## 17. 文献与溯源文件

- `references.bib`：由来源台账生成的 BibTeX（可直接导入 Zotero / Overleaf）。
- `SEARCH.md`：检索协议、查询窗口与命中/初筛/纳入计数。
- `SENSITIVITY.md`：换设定后的稳健性记录。
- `PROGRAM.md`：研究计划、视角、自治策略、假设锦标赛、质量评分、矛盾台账与行动循环。
- `MATRIX.md` / `matrix.csv`：证据抽取矩阵的 Markdown 与 CSV 版本。
- `AUDIT.md`：自动化审查的完整发现。
- `LOOP.md`：13 维闭环成熟度、缺口与自我改进前提（运行评估后生成）。
- `provenance.json`：W3C PROV-JSON（实体、活动、代理与五类 PROV 关系）。
- `ro-crate-metadata.json`：RO-Crate 1.1 JSON-LD，含 figure→source 的独立 `about` 边，可用于 FAIR 交换与长期归档。

## 18. 发布后监测（闭环）

| 字段 | 值 |
| --- | --- |
| 状态 | active |
| 监测计划 | 发布后若程序闸门行为、探针计数或 schema 迁移发生变化，重跑探针并回到 analyze。 |
| 负责人 | YG |
| 复查频率 | per release |
| 信号 | blocked_cases, legacy_blocked, open_contradictions |
| 指标 / 观测 | 3 / 3 |
| 告警 / 缺口 | 0 / 0 |
| 最近复查 | 2026-11-17T20:12:35.338Z |
| 备注 | — |

| 指标 | 目标 / 容差 | 方向 | 最新观测 | 状态 |
| --- | --- | --- | --- | --- |
| blocked_cases | 3 ± 0 | higher | 3 | ok |
| legacy_blocked | 0 ± 0 | higher | 0 | ok |
| open_contradictions | 0 ± 0 | higher | 0 | ok |

## 19. 研究闭环评估

- 项目：**0.8 真实验收：schema-4 研究程序与 review 闸门**
- 成熟度：**100/100**（A）· L4 可审计闭环
- 基线：100/100；相对基线 +0
- 领域：通用流程 · 阶段：release
- 评估时间：2026-11-17T20:12:35.374Z

| 维度 | 权重 | 通过 | 得分 |
| --- | ---: | ---: | ---: |
| 问题与边界 (`question`) | 6 | 4/4 | 100% |
| 证据测绘 (`survey`) | 10 | 10/10 | 100% |
| 可证伪假设 (`hypothesis`) | 10 | 11/11 | 100% |
| 预注册设计 (`design`) | 7 | 11/11 | 100% |
| 研究程序完整性 (`program`) | 8 | 10/10 | 100% |
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
