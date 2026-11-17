# 科研套件 token 开销实测

Tokenizer: `tiktoken` cl100k_base / o200k_base（DeepSeek 分词器未公开，二者差异 <1%，作为可复现代理指标）。

## 每次请求的固定开销

| 组成 | 字符 | cl100k | o200k |
| --- | ---: | ---: | ---: |
| prompt section | 3,059 | 707 | 694 |
| rsx_campaign | 4,931 | 1,247 | 1,244 |
| rsx_template | 2,079 | 538 | 538 |
| rsx_source | 2,508 | 670 | 668 |
| rsx_claim | 1,757 | 439 | 438 |
| rsx_evidence | 1,194 | 308 | 307 |
| rsx_run | 1,836 | 469 | 468 |
| rsx_number | 1,253 | 338 | 337 |
| rsx_extract | 1,385 | 339 | 339 |
| rsx_review | 1,281 | 283 | 282 |
| rsx_artifact | 1,539 | 392 | 393 |
| rsx_figure | 1,931 | 477 | 477 |
| rsx_domain | 1,596 | 373 | 373 |
| rsx_gate | 3,003 | 711 | 711 |
| rsx_write | 1,769 | 435 | 438 |
| **合计** | **31,121** | **7,726** | **7,707** |

## 单项目读取开销

| 文件 | 字符 | cl100k | o200k |
| --- | ---: | ---: | ---: |
| REPORT.md | 8,743 | 5,420 | 4,651 |
| campaign.json | 46,989 | 17,827 | 16,485 |
| ledger.jsonl | 21,522 | 10,114 | 9,888 |
| declaration.md | 304 | 220 | 180 |

测法：`node scripts/measure-overhead.mjs` 快照提示词与 14 个工具 schema，
`python scripts/measure_tokens.py --campaign <exports>` 分词；两者均可重跑。
