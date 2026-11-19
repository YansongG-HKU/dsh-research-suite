# 迁移到 1.0

1.0 保持对 schema 1–4 的读取，不会在你未确认时改写旧项目。升级步骤：

1. 运行 `rsx_campaign action:"doctor"`，确认目标项目链、状态、工件和索引正常。
2. 运行 `rsx_campaign action:"migrate"`，带 `dryRun:true` 和治理字段，查看 `missing` 与（schema < 4 时的）`program`。
3. 去掉 `dryRun` 执行迁移；它会先写 `backups/<campaign>/backup-*.zip`，再写 `campaign.migrated`。
4. 再次 `doctor`，补齐治理字段，重新审计并取得人工批准，通过 release 闸门后导出。

完整字段、回滚步骤、锁与审计语义见 [docs/1.0.0-迁移与恢复.md](docs/1.0.0-迁移与恢复.md)；稳定契约见 [docs/1.0.0-发布契约.md](docs/1.0.0-发布契约.md)。

## 1.1 归档与恢复（不是 schema 迁移）

1.1 没有 schema 变化，不需要迁移旧项目。归档是独立生命周期动作：

1. `rsx_campaign action:"archive"` 只要求项目未归档、没有写锁；发布闸门未过或存在开放暂停也可以归档，暂停记录保留。
2. `rsx_campaign action:"unarchive"` 恢复同一项目，写 `campaign.unarchived`，事件链与工件不动；未归档时返回 `changed:false`，写入中返回 `action_blocked`。
3. 面板顶部“归档项目”列出归档项并提供恢复；组合视图只统计活跃项目，`totals.archived` 单独计数。

导出的 release/暂停规则没有改变。详见 [docs/1.1.0-操作台.md](docs/1.1.0-操作台.md)。
