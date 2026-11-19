# 复现包 · 工业 DOE 与测量系统：焊接工艺窗口 DOE 与测量系统确认

- 活动：rs-ad07b91f
- 问题：研究「焊接工艺窗口 DOE 与测量系统确认」的工艺窗口：先写系统边界、运行工况与安全相关功能，完成量具 R&R / 偏倚 / 线性 / 稳定性与校准溯源；再做因子实验（因子、水平、重复、随机化、区组），预先写接受准则，分析主效应/交互与测量不确定度，最后在新批次上做确认运行并给出 Cp/Cpk、追溯链与生产监测计划。
- 预注册锁定时间：2026-11-17T14:00:05.817Z
- 环境锁：Node 24.14.1 / Python 3.12 / numpy 2.1 / 固定数据生成脚本 v1

## 运行

### R-fde2486908

```bash
node _tmp/weld-run.mjs 7
```

- seed：7
- 期望指标：`{"current_effect_mm_per_a":0.004271,"mean_penetration_mm":1.014565,"rmse_mm":0.103491,"n":54}`
- 原始输出：`sha256:5597d8cb25e7060e2abebc052b6c8751b610144ab8491468a02fc1983125da64`

### R-f886ae3b61（负对照）

```bash
node _tmp/weld-run.mjs 7 --permute
```

- seed：7
- 期望指标：`{"current_effect_mm_per_a":-0.000436,"mean_penetration_mm":1.014565,"rmse_mm":0.146773,"n":54}`
- 原始输出：`sha256:1da641191fe00338db2252758fd3e0249e50de1f990882af673e609aa89ac5b3`

## 预注册参数

```json
{
  "hypothesisId": "C-0001",
  "metric": "熔深",
  "n": 54,
  "analysisPlan": "三因子两水平 DOE，线性模型含主效应与电流×速度交互；按批次区组，alpha=0.05，报告效应量与 95% CI。",
  "stoppingRule": "固定 18 个条件×3 次重复，全部完成后分析，不按中间结果提前停止。",
  "seed": 7,
  "controls": [
    "negative"
  ],
  "envLock": "Node 24.14.1 / Python 3.12 / numpy 2.1 / 固定数据生成脚本 v1",
  "alpha": "0.05",
  "power": "0.80",
  "effectSize": "current +40 A ≈ +0.17 mm penetration",
  "test": "linear model with current×speed interaction, batch block"
}
```

## 工件校验和

```text
ef828219964fa2f2db137593e3b08c4f97db58ff7252342615d792c6faf3d956  焊接电流与速度对熔深影响的实验研究
c2308acd8e6ba2e3a978de5b630b3b93c9d0159f36a8253d8445970d14e57b7e  焊接保护气流量与气孔率的金相研究
6e60eff056f6ede929c26b6bd6fed99ec7d0857825af0ba40c47be6c068e60fa  焊接工艺参数研究的系统综述
3a40558f61075cca7514a6c36a82afdbfde1ddd98da05332e4a5fb0e1a3b4060  GMAW 焊接工艺窗口供应商手册
e026bfb3a4ade7f6c9e94a5e8b267df57ab31cbe46618b4901b19b15d54d121a  ISO 15614-1 焊接工艺评定要点
bd54ed373e3246e37e4253dac1c506918c57e66b07aaecb49aa619d06a943296  AIAG MSA 手册（第 4 版）测量系统分析要点
28d94936b849815e3a9ed3fc49214212a95a3788bf9a1ff4d3b46b1854e592ea  ISO 6892-1 金属材料拉伸试验方法
30e7d651d94c5632087e90171b3ce421701923ffe44a4ef0e2a7d471d0b70ece  高湿环境下 GMAW 气孔缺陷的观察研究
9b9ccb6f117d398012b2623bfa75c1262cd3526e6e824066b9c72ad30e6f9095  manuscript
b70c46537e9dd1ff0523acd80bbdeb3efc06f686f193aeb1da7aef06921e60a9  manuscript
5597d8cb25e7060e2abebc052b6c8751b610144ab8491468a02fc1983125da64  R-fde2486908
1da641191fe00338db2252758fd3e0249e50de1f990882af673e609aa89ac5b3  R-f886ae3b61
```

> 复现判定标准：同一命令、同一种子、同一环境锁下重跑，主指标落在记录值附近，负对照不出现同等效应。