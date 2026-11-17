# 科研套件 token 开销实测

Tokenizer: `tiktoken` cl100k_base / o200k_base（DeepSeek 分词器未公开，二者差异 <1%，作为可复现代理指标）。

## 每次请求的固定开销

| 组成 | 字符 | cl100k | o200k |
| --- | ---: | ---: | ---: |
| prompt section | 2,800 | 653 | 640 |
| rsx_campaign | 4,047 | 1,039 | 1,034 |
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
| rsx_domain | 1,459 | 344 | 343 |
| rsx_gate | 2,240 | 551 | 552 |
| rsx_write | 1,743 | 429 | 432 |
| **合计** | **29,052** | **7,269** | **7,248** |

## 单项目读取开销

| 文件 | 字符 | cl100k | o200k |
| --- | ---: | ---: | ---: |
| REPORT.md | 7,168 | 4,308 | 3,716 |
| campaign.json | 37,219 | 14,538 | 13,378 |
| ledger.jsonl | 17,315 | 8,221 | 7,999 |
| declaration.md | 304 | 220 | 180 |

测法：`node scripts/measure-overhead.mjs` 快照提示词与 14 个工具 schema，
`python scripts/measure_tokens.py --campaign <exports>` 分词；两者均可重跑。
