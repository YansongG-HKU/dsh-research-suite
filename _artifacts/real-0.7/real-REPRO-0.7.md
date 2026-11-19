# 复现包 · 0.7 真实验收：schema-3 检索协议与敏感性闸门探针

- 活动：rs-5495250c
- 问题：第三代 schema 的检索协议与敏感性记录，是否真的改变 survey 与 analyze 的闸门判定？
- 预注册锁定时间：2026-11-17T17:49:54.902Z
- 环境锁：v24.14.1 / dsh-research-suite 0.7.0

## 运行

### R-c292d0fe5f

```bash
node "F:\dsh插件创造\_artifacts\real-0.7\probe.mjs" --seed 7
```

- seed：7
- 期望指标：`{"missing_search_blocked":1,"with_search_passed":1,"missing_sensitivity_blocked":1,"with_sensitivity_passed":1,"legacy_missing_search_blocked":0,"probe_cases":5,"blocked_cases":2}`
- 原始输出：`sha256:535af21ad7d7bd37dfc25a3e5a80541a627bf0bd3fbd14bc44826db4112a4231`

### R-c8d30f8079（负对照）

```bash
node "F:\dsh插件创造\_artifacts\real-0.7\probe.mjs" --seed 7 --negative
```

- seed：7
- 期望指标：`{"legacy_missing_search_blocked":0,"blocked_cases":0}`
- 原始输出：`sha256:225b86457da8ec77ea3cb5a3db8e6e027f9b4e95f0b7bb325616c11b79a1b93f`

## 预注册参数

```json
{
  "hypothesisId": "C-0001",
  "metric": "blocked_cases",
  "n": 5,
  "analysisPlan": "逐个构造五个 schema/记录组合，读取 gate.blocking 是否含目标检查；不估计总体效应。",
  "stoppingRule": "五个预设探针全部运行后停止，不按结果追加探针。",
  "seed": 7,
  "controls": [
    "negative"
  ],
  "envLock": "v24.14.1 / dsh-research-suite 0.7.0",
  "alpha": "0.05",
  "power": "0.8",
  "effectSize": "deterministic probe; no sampling distribution",
  "test": "gate.blocking membership"
}
```

## 工件校验和

```text
a64774c8ad366b85460fd49da7fd0eae43b7af03dfcf0ce1aa53cf2e939a3c41  探针：缺检索协议
c8b726155ce406f2aab48b891f0f608d950a5302ad99994cd02e69c2cf98aa87  探针：补齐检索协议
78ca852b40608e999ff415e431c3b16f3b40081a6465b9c27ea732fec0201d25  探针：缺敏感性记录
3908933ee5548f48ed2598240e685ce8a59815ce61ba406e81d9e007437a4a0e  探针：补齐敏感性记录
2346f87312aa0532129cdf7df1c702a0c719e0dbb595d65d575aacd0e40daa16  探针：早期 schema 负对照
2a48fab12f0ae8fec349661f4202fc1d87a941e29e3943640b909122e2573a92  README 0.7 能力与边界
c2da472f0eac3474c3409ef521d5f524b45b7e1e2db24db69f697928d06f532b  研究闭环 0.7 设计
14d8f67cd3fb11f611d0e8431b89a43b240274370ef1ec1d3bc399d954e3d0b0  CHANGELOG 0.7.0
535af21ad7d7bd37dfc25a3e5a80541a627bf0bd3fbd14bc44826db4112a4231  R-c292d0fe5f
225b86457da8ec77ea3cb5a3db8e6e027f9b4e95f0b7bb325616c11b79a1b93f  R-c8d30f8079
8b2b16e4d708f81fc580b39222d166abf1b0f3a95a8cf14a49d839c398875022  manuscript
```

> 复现判定标准：同一命令、同一种子、同一环境锁下重跑，主指标落在记录值附近，负对照不出现同等效应。