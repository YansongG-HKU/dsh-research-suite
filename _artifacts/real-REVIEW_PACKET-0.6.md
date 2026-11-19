# 评审包 · 工业 DOE 与测量系统：焊接工艺窗口 DOE 与测量系统确认

- 活动：rs-ad07b91f · 阶段：release · 领域：industrial
- 对象哈希：`7c86dde835f0d983798432baef21f0b99277e9ba9e7e1df18164c2a153dc1083`
- 生成时间：2026-11-17T16:58:44.100Z

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
10. 有哪些结论一旦新证据出现就会改变？谁负责发布后监测？

## 断言与证据

| id | 状态 | 断言 | 支持/反驳 | 确定性 | warrant | 缺口 |
| --- | --- | --- | ---: | --- | --- | --- |
| C-0001 | supported | 在 6mm 低碳钢平焊中，电流是熔深的主效应，焊接速度次之，保护气流量主要影响气孔率而非熔深。 | 2/0 | low | 电流主要改变热输入，速度改变线能量停留时间；在固定材料与湿度下，熔深应对电流更敏感、对速度次之，保护气主要通过熔池保护影响气孔率。 | — |

## 来源独立性

| id | 来源 | 可靠性 | 独立性 | 设计 | 偏倚 | 引用 |
| --- | --- | --- | --- | --- | --- | --- |
| S-0001 | 焊接电流与速度对熔深影响的实验研究 | primary | independent | experimental welding DOE fixture | high | 是 |
| S-0002 | 焊接保护气流量与气孔率的金相研究 | primary | independent | metallographic porosity fixture | high | 是 |
| S-0003 | 焊接工艺参数研究的系统综述 | secondary | unknown | — | not-assessed | 否 |
| S-0004 | GMAW 焊接工艺窗口供应商手册 | secondary | unknown | — | not-assessed | 否 |
| S-0005 | ISO 15614-1 焊接工艺评定要点 | secondary | unknown | — | not-assessed | 否 |
| S-0006 | AIAG MSA 手册（第 4 版）测量系统分析要点 | secondary | unknown | — | not-assessed | 否 |
| S-0007 | ISO 6892-1 金属材料拉伸试验方法 | secondary | unknown | — | not-assessed | 否 |
| S-0008 | 高湿环境下 GMAW 气孔缺陷的观察研究 | secondary | unknown | — | not-assessed | 否 |

## 数字与运行

- N-0001 · 电流-熔深回归斜率=0.004271 mm/A（95% CI 0.0035–0.0050（合成数据，仅验证管线））← `run:R-fde2486908#current_effect_mm_per_a`
- R-fde2486908 · success · seed=7 · `node _tmp/weld-run.mjs 7`
- R-f886ae3b61 · success · negative · seed=7 · `node _tmp/weld-run.mjs 7 --permute`

## 最近自动化审查

- A-0004 · ok=true · verdict=accept · blocking=0

> 评审包只汇总可核验记录；签名与哈希链由 review gate 单独校验。