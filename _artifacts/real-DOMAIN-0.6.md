## 领域研究档案

- 领域：**工业与工程研究**（`industrial`）
- 研究定位：把测量系统、实验设计、安全案例和追溯链当成研究的一部分：先证明量得准，再证明结论稳。
- 必填字段：32/32 已登记
- 不适用项：写 `N/A — 具体原因`（原因至少 6 字），审计与报告会保留该理由；不要留空。

### 标准与清单对齐

| 标准/框架 | 类型 | 适用性 | 生命周期 | 用途 |
| --- | --- | --- | --- | --- |
| [ISO/IEC 17025:2017](https://www.iso.org/standard/66912.html) | accreditation | 适用 | current · 2026-01-01 | 检测/校准实验室的能力、公正性与结果有效性 |
| [IATF 16949:2016](https://www.iatfglobaloversight.org/) | industry | 适用 | current · 2026-01-01 | 汽车行业质量管理体系；MSA/SPC 为常见核心工具 |
| [AIAG MSA Manual](https://www.aiag.org/) | method | 适用 | current · 2026-01-01 | 测量系统分析：偏倚、线性、稳定性、GR&R |
| [ISO 13849-1:2023](https://www.iso.org/standard/69883.html) | safety | 适用 | current · 2026-01-01 | 机械安全控制系统的性能等级（PL） |
| [IEC 61508](https://webstore.iec.ch/publication/5515) | safety | 适用 | current · 2026-01-01 | 功能安全生命周期与 SIL |
| [ISO 9001:2015](https://www.iso.org/standard/62085.html) | management-system | 适用 | current · 2026-01-01 | 质量管理体系的文件化与持续改进 |

### 报告结构建议

- 系统边界、需求与危害
- 测量系统与校准
- 实验设计（因子/水平/重复/随机化）
- 假设、不确定度与确认运行
- 安全案例与可追溯性
- 质量记录与生产监测

### 字段登记与闸门状态

| 阶段 | 字段 | 状态 | 内容/问题 |
| --- | --- | --- | --- |
| scoping | 系统边界与对象 (`system_boundary`) | 已登记 | 焊接接头、母材、夹具与测量系统边界；不包含后续涂装与长期疲劳。 |
| scoping | 运行环境与工况 (`operating_context`) | 已登记 | 车间温度 15–35°C、湿度 30–70%、两班制、设备每周维护；覆盖平焊位置。 |
| scoping | 需求与验收指标 (`requirements`) | 已登记 | 熔深≥1.2mm、气孔率<2%、抗拉强度≥母材 80%，并满足客户焊接规范。 |
| scoping | 危害与失效模式 (`hazards`) | 已登记 | 未熔透、气孔、飞溅、夹具失效、电弧与激光防护缺失。 |
| scoping | 适用标准与条款 (`standards`) | 已登记 | ISO 15614-1 焊接工艺评定；ISO 5817 焊缝质量等级 B；ISO 6892-1 拉伸。 |
| survey | 既有数据与先验试验 (`prior_art`) | 已登记 | 历史 12 个试产批次与供应商工艺窗口；已知高湿环境气孔率上升。 |
| survey | 测量计划与量具 (`measurement_plan`) | 已登记 | 熔深用金相剖切，气孔用 X 光，拉伸按 ISO 6892-1；每个条件 5 件。 |
| survey | 测量系统分析（MSA） (`msa`) | 已登记 | GR&R 熔深重复性 8.2%、再现性 6.1%，低于 10% 接受线；偏倚与线性待复核。 |
| survey | 校准与溯源 (`calibration`) | 已登记 | 金相显微镜与拉伸机年度校准，证书 CAL-2026-11，溯源至国家计量院。 |
| design | 实验设计类型 (`design_type`) | 已登记 | doe |
| design | 因子与水平 (`factors`) | 已登记 | 电流 180–240A、焊接速度 4–8mm/s、保护气流量 12–20L/min。 |
| design | 水平设置依据 (`levels`) | 已登记 | 覆盖工艺窗口边界与中心点，水平依据供应商手册和历史试产批次。 |
| design | 重复次数 (`replicates`) | 已登记 | 3 |
| design | 随机化与区组 (`randomization`) | 已登记 | 随机运行顺序，按批次区组，操作者事先不知道条件分配。 |
| design | 接受准则与判定规则 (`acceptance_criteria`) | 已登记 | 熔深≥1.2mm 且气孔率<2% 为合格；主效应显著性阈值 α=0.05。 |
| design | 安全评审 (`safety_review`) | 已登记 | 激光防护、急停与夹具双按钮回路评审通过，残余风险可接受。 |
| execute | 执行环境与设备状态 (`environment`) | 已登记 | 设备 WELD-03、夹具 F-12；环境记录每班一次，停机事件单独登记。 |
| execute | 原始数据与采集 (`raw_data`) | 已登记 | 原始 CSV 与 X 光图像存只读盘，SHA-256 登记；采集时钟与 NTP 同步。 |
| execute | 偏离与异常处理 (`deviations`) | 已登记 | 第 7 次运行保护气流量偏离 1.5L/min，已标记并保留在敏感性分析。 |
| execute | 校准记录与有效期 (`calibration_record`) | 已登记 | 试验期间校准有效至 2027-03；班前零点核查全部通过。 |
| analyze | 效应估计与显著性 (`effect_estimates`) | 已登记 | 电流主效应 +0.18mm/40A，速度 -0.09mm/(mm/s)；区间与交互见报告。 |
| analyze | 统计假设与诊断 (`assumptions`) | 已登记 | 残差正态性 Shapiro p=0.21、等方差 Levene p=0.34；独立性由随机顺序支持。 |
| analyze | 测量不确定度 (`uncertainty`) | 已登记 | 熔深扩展不确定度 U=0.06mm (k=2)，含重复性、取样与校准分量。 |
| analyze | 确认运行 (`confirmation_run`) | 已登记 | 新批次 3 次确认运行均值 1.31mm，落在预先定义的预测区间内。 |
| analyze | 过程能力与稳定性 (`capability`) | 已登记 | Cpk=1.42，控制图无越界，批间漂移小于 0.03mm。 |
| write | 报告/质量体系口径 (`reporting_standard`) | 已登记 | ISO-17025 |
| write | 试验报告 (`test_report`) | 已登记 | 按 ISO 17025 格式出具：方法、样品、条件、结果、判定与签字齐全。 |
| write | 局限与外推边界 (`limitations`) | 已登记 | 只覆盖 6mm 低碳钢平焊位置，不能外推到立焊、铝合金或厚板。 |
| write | 安全案例 (`safety_case`) | 已登记 | 安全目标为夹具失效不伤人；双回路、光栅与急停证据齐全，残余风险低。 |
| release | 追溯链 (`traceability`) | 已登记 | 样品批次→设备→校准→原始数据→报告编号全链可追溯。 |
| release | 质量记录归档 (`quality_record`) | 已登记 | 记录保存 10 年，质量部只读归档，异地备份并定期抽检。 |
| release | 安全签核 (`safety_signoff`) | 已登记 | EHS 与质量负责人联合签核，残余风险被明确接受。 |

### 审查角色

| 角色 | 要求 | 状态 |
| --- | --- | --- |
| 工程审查 (`engineering`) | 已完成 | 1 条审查 |
| 质量/安全审查 (`quality`) | 已完成 | 1 条审查 |

### 发布后监测（闭环）

| 项 | 值 |
| --- | --- |
| 状态 | active |
| 计划 | 转产前每周复核 SPC 告警、校准到期、缺陷率与安全事件；确认运行复现失败或 GR&R 超过接受线时停线并回退 analyze。 |
| 负责人 | 焊接工艺负责人 + 质量负责人 |
| 频率 | weekly |
| 信号 | spc_alert, calibration_due, defect_rate, safety_incident, mean_penetration_mm |
| 指标 / 观测 | 5 / 5 |
| 告警 / 缺口 | 0 / 0 |
| 指引 | 转产/上线后跟踪 SPC 告警、校准到期、缺陷率与安全事件；写明停线、召回与再验证触发条件。 |

| 指标 | 目标/容差 | 最新观测 | 状态 |
| --- | --- | --- | --- |
| mean_penetration_mm | 1.2 ± 0.05 | 1.31 | ok |
| spc_alert | 0 ± 0 | 0 | ok |
| calibration_due | 30 ± 0 | 104 | ok |
| defect_rate | 2 ± 0 | 0.00204 | ok |
| safety_incident | 0 ± 0 | 0 | ok |

> 说明：以上为标准/清单对齐提示，用于组织研究记录；不构成认证、法律或临床合规结论。