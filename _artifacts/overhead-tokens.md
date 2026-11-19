# 科研套件 token 开销实测

Tokenizer: `tiktoken` cl100k_base / o200k_base（DeepSeek 分词器未公开，二者差异 <1%，作为可复现代理指标）。

## 每次请求的固定开销

| 组成 | 字符 | cl100k | o200k |
| --- | ---: | ---: | ---: |
| prompt section | 4,676 | 1,062 | 1,048 |
| rsx_campaign | 8,793 | 2,162 | 2,165 |
| rsx_search | 1,494 | 372 | 372 |
| rsx_template | 2,079 | 538 | 538 |
| rsx_source | 6,080 | 1,580 | 1,577 |
| rsx_claim | 3,463 | 843 | 836 |
| rsx_evidence | 1,194 | 308 | 307 |
| rsx_run | 2,025 | 507 | 506 |
| rsx_number | 1,253 | 338 | 337 |
| rsx_extract | 1,385 | 339 | 339 |
| rsx_review | 1,767 | 382 | 382 |
| rsx_artifact | 1,539 | 392 | 393 |
| rsx_figure | 1,931 | 477 | 477 |
| rsx_domain | 1,596 | 373 | 373 |
| rsx_gate | 4,033 | 963 | 963 |
| rsx_program | 5,393 | 1,338 | 1,329 |
| rsx_write | 2,389 | 586 | 590 |
| **合计** | **51,090** | **12,560** | **12,532** |

测法：`node scripts/measure-overhead.mjs` 快照提示词与 16 个工具 schema，
`python scripts/measure_tokens.py --campaign <exports>` 分词；两者均可重跑。
