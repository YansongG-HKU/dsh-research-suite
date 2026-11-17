/** Markdown research package rendered from the campaign state. */
import { STAGE_LABELS, STAGE_ORDER, TIERS } from './config.js'
import { budgetSummary } from './budget.js'
import { checkGate } from './gates.js'
import { resolveTrace, numberMatchesTrace } from './gates.js'
import { renderAuditMarkdown } from './audit.js'
import { buildMatrix, renderMatrixMarkdown } from './matrix.js'
import { auditSubjectHash } from './subject.js'
import { getDomain, renderDomainMarkdown } from './domains.js'

function cell(value) {
  return String(value ?? '')
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, ' ')
    .trim()
}

function table(headers, rows) {
  const head = `| ${headers.map(cell).join(' | ')} |`
  const sep = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.length ? rows.map((row) => `| ${row.map(cell).join(' | ')} |`).join('\n') : `| ${headers.map(() => '—').join(' | ')} |`
  return [head, sep, body].join('\n')
}

function fmt(value) {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function latestGate(state, stage) {
  const rows = (state.gates || []).filter((item) => item.stage === stage)
  return rows.length ? rows[rows.length - 1] : null
}

export function renderDeclaration(state) {
  const d = state.declaration || {}
  return [
    '# AI 使用声明 / AI Declaration',
    '',
    `- 项目：${state.title}`,
    `- 声明时间：${d.date || '—'}`,
    `- 模型 / 工具：${fmt(d.model)}`,
    `- 人工复核人：${fmt(d.humanReviewer)}`,
    `- AI 参与：${d.ai ? '是（检索、分析、写作均有参与）' : '否'}`,
    `- 水印 / 可识别标记：${d.watermark ? '已添加' : '未添加'}`,
    '',
    '本项目的全部关键数字与引用均来自台账（`{{N-xxxx}}` / `[[src:S-xxxx]]`），可用随附的 `ledger.jsonl` 与工件哈希复核。',
    '',
    '> 本声明是结构性声明，不替代同行评审；结论的可靠性由评审阶段与负对照共同约束。',
    '',
  ].join('\n')
}

export function renderReport(state, options = {}) {
  const integrity = options.integrity
  const budget = budgetSummary(state)
  const lines = []
  lines.push(`# ${state.title}`)
  lines.push('')
  lines.push(`> 研究包由科研套件（dsh-research-suite）生成。阶段：**${STAGE_LABELS[state.stage]?.zh || state.stage}** ｜ 档位 **${state.tier}** ｜ 事件 ${integrity ? integrity.events : (state.seq || 0)} 条。`)
  lines.push('')
  lines.push('## 0. 状态')
  lines.push('')
  lines.push(
    table(
      ['字段', '值'],
      [
        ['Campaign', state.id],
        ['阶段', `${STAGE_LABELS[state.stage]?.zh || state.stage} (${state.stage})`],
        ['档位', `${state.tier} · ${TIERS[state.tier]?.tokens ?? '—'} tokens 预算`],
        ['模板', state.templateId || '空白'],
        ['领域', state.domain ? `${getDomain(state.domain)?.title.zh || state.domain} (${state.domain})` : '通用流程'],
        ['创建 / 更新', `${state.createdAt} / ${state.updatedAt}`],
        ['事件链', integrity ? (integrity.chainOk ? `完整（${integrity.events} 条）` : `断裂于 seq ${integrity.brokenSeq}`) : '未校验'],
        ['工件', `${(state.artifacts || []).length} 个${integrity && integrity.artifactProblems?.length ? `，异常 ${integrity.artifactProblems.length} 个` : ''}`],
      ],
    ),
  )
  lines.push('')

  lines.push('## 1. 研究问题与边界')
  lines.push('')
  lines.push(`**问题**：${state.question || '—'}`)
  lines.push('')
  lines.push(`**边界**：${state.scope || '—'}`)
  lines.push('')
  lines.push(`**成功判据**：${state.success || '—'}`)
  lines.push('')

  if (state.domain) {
    lines.push(renderDomainMarkdown(state, { compact: true, title: '1.1 领域研究档案', includeMonitoring: false }))
    lines.push('')
  }

  const world = state.world || {}
  const worldRows = []
  for (const [kind, bucket] of Object.entries(world)) {
    if (!bucket || typeof bucket !== 'object') continue
    for (const [key, value] of Object.entries(bucket)) {
      worldRows.push([kind, key, typeof value === 'object' ? JSON.stringify(value) : String(value)])
    }
  }
  lines.push('## 2. 世界模型')
  lines.push('')
  lines.push(table(['类别', '键', '值'], worldRows))
  lines.push('')

  lines.push('## 3. 来源')
  lines.push('')
  lines.push(
    table(
      ['ID', '标题', '年份', '类型', '可信度', 'DOI / URL', '内容哈希'],
      (state.sources || []).map((item) => [
        item.id,
        item.title,
        item.year,
        item.kind,
        item.reliability,
        item.doi || item.url || '—',
        item.contentHash ? `${item.contentHash.slice(0, 12)}…` : '—',
      ]),
    ),
  )
  lines.push('')

  lines.push('## 4. 断言与证据')
  lines.push('')
  lines.push(
    table(
      ['ID', '类型', '断言', '状态', '置信度', '证据'],
      (state.claims || []).map((item) => [
        item.id,
        item.kind,
        item.statement,
        item.status,
        item.confidence,
        (state.evidence || []).filter((ev) => ev.claim === item.id).length,
      ]),
    ),
  )
  lines.push('')
  if ((state.evidence || []).length) {
    lines.push(
      table(
        ['证据', '断言', '关系', '引用', '定位', '摘录'],
        state.evidence.map((item) => [item.id, item.claim, item.relation, item.ref, item.locator, item.quote]),
      ),
    )
    lines.push('')
  }

  lines.push('## 5. 数字台账')
  lines.push('')
  lines.push(
    table(
      ['ID', '名称', '值', '单位', '不确定性', '溯源', '校验'],
      (state.numbers || []).map((item) => {
        const resolved = resolveTrace(state, item.trace)
        const match = resolved.ok ? numberMatchesTrace(item, resolved) : false
        return [item.id, item.name, item.value, item.unit, item.uncertainty, item.trace, resolved.ok && match ? 'ok' : resolved.reason || 'mismatch']
      }),
    ),
  )
  lines.push('')

  lines.push('## 6. 运行')
  lines.push('')
  lines.push(
    table(
      ['ID', '阶段', '状态', '种子', '对照', '指标', '命令'],
      (state.runs || []).map((item) => [
        item.id,
        item.stage,
        item.status,
        item.seed,
        item.control || '—',
        item.metrics ? JSON.stringify(item.metrics) : '—',
        item.command,
      ]),
    ),
  )
  lines.push('')

  lines.push('## 7. 图')
  lines.push('')
  lines.push(
    table(
      ['ID', '标题', '工件', '代码', '数据', '环境', '说明'],
      (state.figures || []).map((item) => [item.id, item.title, item.artifact, item.codeArtifact || '—', item.dataArtifact || '—', item.envArtifact || item.env || '—', item.caption]),
    ),
  )
  lines.push('')

  lines.push('## 8. 评审')
  lines.push('')
  lines.push(
    table(
      ['ID', '评审人', '对抗', '结论', '阻断问题'],
      (state.reviews || []).map((item) => [
        item.id,
        item.reviewer,
        item.adversarial ? '是' : '否',
        item.verdict,
        (item.issues || []).filter((issue) => issue.severity === 'blocking').length,
      ]),
    ),
  )
  lines.push('')

  lines.push('## 9. 闸门历史')
  lines.push('')
  lines.push(
    table(
      ['阶段', '最近结果', '通过 / 总项', '阻断项', '时间'],
      STAGE_ORDER.map((stage) => {
        const gate = latestGate(state, stage)
        return [STAGE_LABELS[stage]?.zh || stage, gate ? (gate.ok ? 'pass' : 'blocked') : '未运行', gate ? `${gate.passed}/${gate.total}` : '—', gate ? (gate.blocking || []).join(', ') : '—', gate ? gate.ts : '—']
      }),
    ),
  )
  lines.push('')

  lines.push('## 10. 预算')
  lines.push('')
  lines.push(
    table(
      ['字段', '值'],
      [
        ['档位', `${budget.tier}（建议 agents ≤ ${budget.agents}）`],
        ['tokens', `${budget.tokensUsed} / ${budget.tokensLimit}`],
        ['时长（秒）', `${budget.secondsUsed} / ${budget.secondsLimit}`],
        ['超限', budget.overruns.length ? budget.overruns.join('; ') : '无'],
      ],
    ),
  )
  lines.push('')

  lines.push('## 11. 复现命令')
  lines.push('')
  const commands = (state.runs || []).filter((item) => item.command).map((item) => `- \`${item.command}\`（${item.id}，seed ${item.seed ?? '—'}）`)
  lines.push(commands.length ? commands.join('\n') : '—')
  lines.push('')
  lines.push('事件链与工件校验：')
  lines.push('')
  lines.push('```bash')
  lines.push(`# 事件链（SHA-256，前一条的 hash 进入下一条）`)
  lines.push(`sha256sum ledger.jsonl`)
  lines.push('```')
  lines.push('')

  lines.push('## 12. 声明')
  lines.push('')
  if (state.declaration) {
    lines.push(`- 模型 / 工具：${fmt(state.declaration.model)}`)
    lines.push(`- 人工复核人：${fmt(state.declaration.humanReviewer)}`)
    lines.push(`- AI 参与：${state.declaration.ai ? '是' : '否'} ｜ 水印：${state.declaration.watermark ? '已添加' : '未添加'}`)
  } else {
    lines.push('尚未生成 AI 使用声明（`rsx_write action:"declaration"`）。')
  }
  lines.push('')

  lines.push('## 13. 当前阻断与下一步')
  lines.push('')
  const current = checkGate(state, state.stage, {
    integrity,
    verifyAudit: options.verifyAudit,
  })
  if (current.ok) {
    lines.push(`当前阶段 **${STAGE_LABELS[state.stage]?.zh || state.stage}** 已满足闸门，可以推进。`)
  } else {
    lines.push(`当前阶段 **${STAGE_LABELS[state.stage]?.zh || state.stage}** 被阻断：`)
    lines.push('')
    for (const code of current.blocking) {
      const row = current.checks.find((item) => item.code === code)
      lines.push(`- \`${code}\`：${row?.detail || ''}`)
    }
  }
  lines.push('')

  lines.push('## 14. 最近事件')
  lines.push('')
  const recent = Array.isArray(options.events) ? options.events.slice(-12) : []
  lines.push(
    table(
      ['seq', '时间', '类型', 'actor'],
      recent.map((event) => [event.seq, event.ts, event.kind, event.actor]),
    ),
  )
  lines.push('')

  const audits = Array.isArray(state.audits) ? state.audits : []
  const latestAudit = audits[audits.length - 1] || null
  if (latestAudit && latestAudit.subjectHash !== auditSubjectHash(state)) {
    lines.push('> 注意：最近一次自动化审查早于当前台账修改，结论可能已经过期；请在导出或评审前重新运行 `rsx_review action:"audit"`。')
    lines.push('')
  }
  lines.push(renderAuditMarkdown(latestAudit, { title: '15. 自动化审查' }))
  lines.push('')
  lines.push(renderMatrixMarkdown(buildMatrix(state), { title: '16. 证据抽取矩阵' }))
  lines.push('')
  lines.push('## 17. 文献与溯源文件')
  lines.push('')
  lines.push('- `references.bib`：由来源台账生成的 BibTeX（可直接导入 Zotero / Overleaf）。')
  lines.push('- `MATRIX.md` / `matrix.csv`：证据抽取矩阵的 Markdown 与 CSV 版本。')
  lines.push('- `AUDIT.md`：自动化审查的完整发现。')
  if (state.domain) lines.push('- `DOMAIN.md`：领域字段、标准对齐、审查角色与发布后监测计划。')
  lines.push('- `provenance.json`：W3C PROV-JSON（实体、活动、代理与五类 PROV 关系）。')
  lines.push('- `ro-crate-metadata.json`：RO-Crate 1.1 JSON-LD，含 figure→source 的独立 `about` 边，可用于 FAIR 交换与长期归档。')
  lines.push('')

  lines.push('## 18. 发布后监测（闭环）')
  lines.push('')
  const monitoring = state.monitoring && typeof state.monitoring === 'object' ? state.monitoring : { status: 'none' }
  lines.push(
    table(
      ['字段', '值'],
      [
        ['状态', monitoring.status || 'none'],
        ['监测计划', monitoring.plan || '未登记'],
        ['负责人', monitoring.owner || '未登记'],
        ['复查频率', monitoring.cadence || '未登记'],
        ['信号', (monitoring.signals || []).join(', ') || '未登记'],
        ['最近复查', monitoring.reviewedAt || '—'],
        ['备注', monitoring.notes || '—'],
      ],
    ),
  )
  lines.push('')
  if (state.domain) {
    lines.push('> 领域档案要求的监测字段由发布闸门检查；发布后可用 `rsx_campaign action:"monitor"` 更新计划、状态与信号。')
    lines.push('')
  }
  lines.push('---')
  lines.push('')
  lines.push('由 dsh-research-suite 生成；数字与引用以 `campaign.json` 为准。')
  lines.push('')
  return lines.join('\n')
}
