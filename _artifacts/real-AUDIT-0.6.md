## 自动化审查

- 结论：**通过（无阻断、无主要问题）**
- 审查 ID：A-0004
- 审查时间：2026-11-17T16:49:24.713Z
- 对象哈希：`7c86dde835f0d983798432baef21f0b99277e9ba9e7e1df18164c2a153dc1083`
- 签名：HMAC-SHA256 / 2bf5ca3613676c83
- 计数：blocking 0 · major 0 · minor 8 · info 1

### minor

| code | 问题 | 详情 | ref |
| --- | --- | --- | --- |
| `claim_evidence_weak` | 证据引文与断言词面不匹配 | C-0001 的 E-0002（weak，覆盖率 0.083）没有覆盖断言关键词；请人工确认是否真的支持。 | C-0001 |
| `extraction_coverage` | 抽取矩阵覆盖不足 | 已覆盖 1/8 条来源，建议至少 3 条。 |  |
| `source_capture_receipt` | 捕获缺少时间回执 | S-0003 有正文哈希，但没有 capturedAt 捕获时间。 | S-0003 |
| `source_capture_receipt` | 捕获缺少时间回执 | S-0004 有正文哈希，但没有 capturedAt 捕获时间。 | S-0004 |
| `source_capture_receipt` | 捕获缺少时间回执 | S-0005 有正文哈希，但没有 capturedAt 捕获时间。 | S-0005 |
| `source_capture_receipt` | 捕获缺少时间回执 | S-0006 有正文哈希，但没有 capturedAt 捕获时间。 | S-0006 |
| `source_capture_receipt` | 捕获缺少时间回执 | S-0007 有正文哈希，但没有 capturedAt 捕获时间。 | S-0007 |
| `source_capture_receipt` | 捕获缺少时间回执 | S-0008 有正文哈希，但没有 capturedAt 捕获时间。 | S-0008 |

### info

| code | 问题 | 详情 | ref |
| --- | --- | --- | --- |
| `prereg_amended` | 预注册有带理由的修订 | 锁定哈希 eaf68ce1c6c0… → 当前 d8fe93fe1c42…；修订理由：补充统计参数与效应量记录；分析计划与样本量不变。 |  |
