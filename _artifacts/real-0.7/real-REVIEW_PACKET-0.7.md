# 评审包 · 0.7 真实验收：schema-3 检索协议与敏感性闸门探针

- 活动：rs-5495250c · 阶段：release · 领域：通用
- 对象哈希：`14145feb4b601bd70208f9b4a3a1e5da22d0f42bd632c2997325747a5c6b2aba`
- 生成时间：2026-11-17T17:49:56.496Z

## 评审问题

1. 主假设的 warrant 是否真的把证据和结论连起来，还是只是复述结论？
2. 反证检索记录了什么？没有反例和没有检索是两件事。
3. 确定性（certainty）与证据数量匹配吗？多条同源证据不能升级为高确定性。
4. 每个被引用来源是否独立？派生来源是否指向原始来源？
5. 偏倚风险 high / some-concerns 的具体理由和影响是否写清楚？
6. 预注册与当前分析是否一致？不一致是否有带理由的修订记录？
7. 数字能否从 run/来源重算？不确定性的口径是什么？
8. 负对照真的会让效应消失吗？它的输出在哪里？
9. 复现包是否包含精确命令、种子、环境锁和原始 stdout？
10. 检索协议是否写清了数据库、日期窗口和命中/筛选/纳入计数？哪些数据库没有覆盖？
11. 敏感性分析换过哪些设定？有没有一个合理设定会让结论反向？
12. 有哪些结论一旦新证据出现就会改变？谁负责发布后监测？

## 断言与证据

| id | 状态 | 断言 | 支持/反驳 | 确定性 | warrant | 缺口 |
| --- | --- | --- | ---: | --- | --- | --- |
| C-0001 | supported | 在第三代 schema 中，缺少检索协议或敏感性记录会分别阻断 survey 与 analyze；补齐记录后同一阶段放行。 | 2/0 | moderate | 若新检查只对第三代 schema 阻断，则缺记录项目应在对应阶段出现命名阻断；这是可直接读取的 gate.blocking 输出。 | — |
| C-0002 | supported | 早期 schema 上同一缺失检索不触发 search_protocol 阻断。 | 1/0 | moderate | 若 featureRigor 只在 schema 三设置 blocking，则早期 schema 的同名检查应为 advisory。 | — |

## 来源独立性

| id | 来源 | 可靠性 | 独立性 | 设计 | 偏倚 | 引用 |
| --- | --- | --- | --- | --- | --- | --- |
| S-0001 | 探针：缺检索协议 | primary | independent | isolated service + pure gate probe | low | 是 |
| S-0002 | 探针：补齐检索协议 | primary | independent | isolated service + pure gate probe | low | 否 |
| S-0003 | 探针：缺敏感性记录 | primary | independent | isolated service + pure gate probe | low | 是 |
| S-0004 | 探针：补齐敏感性记录 | primary | independent | isolated service + pure gate probe | low | 否 |
| S-0005 | 探针：早期 schema 负对照 | primary | independent | isolated service + pure gate probe | low | 是 |
| S-0006 | README 0.7 能力与边界 | secondary | unknown | — | not-assessed | 否 |
| S-0007 | 研究闭环 0.7 设计 | secondary | unknown | — | not-assessed | 否 |
| S-0008 | CHANGELOG 0.7.0 | secondary | unknown | — | not-assessed | 否 |

## 检索协议

| id | 类型 | 数据库 | 查询 | 命中/初筛/纳入 | 否证 |
| --- | --- | --- | --- | --- | --- |
| Q-0001 | disconfirming | local gate-probe | schema three search protocol sensitivity null result | 5/5/4 | 是 |

## 敏感性分析

| id | 名称 | 方法 | 设定 | 结果 | 方向 | 追溯 |
| --- | --- | --- | --- | --- | --- | --- |
| Z-0001 | schema-one negative control | negative-control | 把同一缺失检索的 state 标为早期 schema 后重跑 gate，隔离版本化契约的影响。 | 早期 schema 不触发 search_protocol 阻断；第三代 schema 触发。 | consistent | `run:R-c292d0fe5f#legacy_missing_search_blocked` |

## 数字与运行

- N-0001 · blocked_cases=2 case（确定性探针：五个预设案例中的阻断数，不构成抽样置信区间）← `run:R-c292d0fe5f#blocked_cases`
- R-c292d0fe5f · success · seed=7 · `node "F:\dsh插件创造\_artifacts\real-0.7\probe.mjs" --seed 7`
- R-c8d30f8079 · success · negative · seed=7 · `node "F:\dsh插件创造\_artifacts\real-0.7\probe.mjs" --seed 7 --negative`

## 最近自动化审查

- A-0001 · ok=true · verdict=accept · blocking=0

> 评审包只汇总可核验记录；签名与哈希链由 review gate 单独校验。