# 敏感性分析

> 每条记录一次“换一种合理设定后结论是否仍成立”。方向只描述本次分析的结果，不是对真实效应的裁决。

| ID | 关联断言 | 名称 | 方法 | 设定 | 结果 | 方向 | 追溯 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Z-0001 | C-0001 | schema-one negative control | negative-control | 把同一缺失检索的 state 标为早期 schema 后重跑 gate，隔离版本化契约的影响。 | 早期 schema 不触发 search_protocol 阻断；第三代 schema 触发。 | consistent | `run:R-c292d0fe5f#legacy_missing_search_blocked` |
