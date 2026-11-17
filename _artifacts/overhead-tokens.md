# 科研套件 token 开销实测

Tokenizer: `tiktoken` cl100k_base / o200k_base（DeepSeek 分词器未公开，二者差异 <1%，作为可复现代理指标）。

## 每次请求的固定开销

| 组成 | 字符 | cl100k | o200k |
| --- | ---: | ---: | ---: |
| prompt section | 2,153 | 503 | 492 |
| rsx_campaign | 2,653 | 687 | 687 |
| rsx_template | 1,833 | 486 | 487 |
| rsx_source | 2,508 | 670 | 668 |
| rsx_claim | 1,757 | 439 | 438 |
| rsx_evidence | 1,194 | 308 | 307 |
| rsx_run | 1,836 | 469 | 468 |
| rsx_number | 1,253 | 338 | 337 |
| rsx_extract | 1,385 | 339 | 339 |
| rsx_review | 1,198 | 267 | 265 |
| rsx_artifact | 1,539 | 392 | 393 |
| rsx_figure | 1,931 | 477 | 477 |
| rsx_gate | 1,838 | 460 | 460 |
| rsx_write | 1,701 | 419 | 422 |
| **合计** | **24,779** | **6,254** | **6,240** |

测法：`node scripts/measure-overhead.mjs` 快照提示词与 9 个工具 schema，
`python scripts/measure_tokens.py --campaign <exports>` 分词；两者均可重跑。
