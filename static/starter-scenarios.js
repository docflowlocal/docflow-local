(() => {
  "use strict";

  const scenarios = {
    trade: {
      id: "trade",
      icon: "QT",
      title: { "zh-CN": "外贸报价", en: "Trade quotation" },
      description: { "zh-CN": "报价单、交付说明与客户目录", en: "Quotation, delivery notes, and customer folders" },
      projectName: { "zh-CN": "外贸报价交付包", en: "Trade Quotation Package" },
      eyebrow: { "zh-CN": "样例项目 / 外贸报价", en: "SAMPLE PROJECT / TRADE QUOTATION" },
      subtitle: { "zh-CN": "先修复一条缺失记录，再生成可直接交付的报价文件包。", en: "Fix one incomplete record, then generate a delivery-ready quotation package." },
      filename: "sample-trade-quotation.csv",
      filenamePattern: { "zh-CN": "{{客户简称}}-报价单-{{报价编号}}", en: "{{客户简称}}-Quotation-{{报价编号}}" },
      folderPattern: "{{客户简称}}/{{报价编号}}",
      rows: [
        { "客户简称": "海岬贸易", "客户名称": "海岬贸易示例公司", "报价编号": "QT-260801", "报价日期": "2026-08-08", "联系人": "林女士", "联系邮箱": "trade@example.com", "产品名称": "工业传感器", "产品说明": "标准型号与出口包装", "数量": 20, "单价": 86, "优惠": 120, "税率": "13%", "交付周期": "10 个工作日", "负责人": "示例销售" },
        { "客户简称": "远帆采购", "客户名称": "远帆采购示例公司", "报价编号": "QT-260802", "报价日期": "2026-08-08", "联系人": "周先生", "联系邮箱": "buyer@example.com", "产品名称": "备件组合", "产品说明": "按清单分箱交付", "数量": 8, "单价": 460, "优惠": 0, "税率": "13%", "交付周期": "15 个工作日", "负责人": "示例销售" },
        { "客户简称": "晨港供应", "客户名称": "晨港供应示例公司", "报价编号": "", "报价日期": "2026-08-08", "联系人": "陈女士", "联系邮箱": "orders@example.com", "产品名称": "控制模块", "产品说明": "含英文标签与装箱清单", "数量": 12, "单价": 315, "优惠": 80, "税率": "13%", "交付周期": "12 个工作日", "负责人": "示例销售" }
      ],
      missingFix: { rowIndex: 2, field: "报价编号", value: "QT-260803" },
      fields: [
        ["客户简称", true], ["客户名称", true], ["报价编号", true], ["报价日期", true],
        ["联系人", true], ["联系邮箱", true], ["产品名称", true], ["产品说明", false],
        ["数量", true], ["单价", true], ["优惠", false], ["税率", false],
        ["交付周期", false], ["负责人", false], ["税额", false], ["含税总额", false], ["显示优惠行", false]
      ],
      computedFields: [
        { name: "小计", expression: "数量 * 单价", digits: 2, scope: "quote" },
        { name: "税额", expression: "(数量 * 单价 - coalesce(优惠, 0)) * coalesce(税率, 0.13)", digits: 2, scope: "quote" },
        { name: "含税总额", expression: "round((数量 * 单价 - coalesce(优惠, 0)) * (1 + coalesce(税率, 0.13)), 2)", digits: 2, scope: "quote" }
      ],
      conditionalFields: [{ name: "显示优惠行", expression: "coalesce(优惠, 0) > 0", scope: "quote" }],
      templates: [
        { id: "quote", kind: "PDF", builtIn: true, short: { "zh-CN": "报价单", en: "Quote" }, name: { "zh-CN": "标准外贸报价单.pdf", en: "Trade Quotation.pdf" }, tag: { "zh-CN": "主文件", en: "Primary" }, details: { "zh-CN": ["报价字段", "金额计算", "二维码"], en: ["Quote fields", "Totals", "QR code"] } },
        { id: "attachment", kind: "PDF", builtIn: true, short: { "zh-CN": "交付说明", en: "Notes" }, name: { "zh-CN": "产品与交付说明.pdf", en: "Product Delivery Notes.pdf" }, tag: { "zh-CN": "附件", en: "Appendix" }, details: { "zh-CN": ["交付周期", "负责人", "检查清单"], en: ["Schedule", "Owner", "Checklist"] } }
      ]
    },

    engineering: {
      id: "engineering",
      icon: "EN",
      title: { "zh-CN": "工程移交", en: "Engineering handover" },
      description: { "zh-CN": "移交封面、文件登记表与修订目录", en: "Handover cover, document register, and revision folders" },
      projectName: { "zh-CN": "工程项目移交包", en: "Engineering Handover Package" },
      eyebrow: { "zh-CN": "样例项目 / 工程移交", en: "SAMPLE PROJECT / ENGINEERING HANDOVER" },
      subtitle: { "zh-CN": "校验项目编号和修订号，按项目与专业自动建立交付目录。", en: "Validate project and revision numbers, then build discipline-based delivery folders." },
      filename: "sample-engineering-handover.csv",
      filenamePattern: { "zh-CN": "{{文件编号}}-{{文件名称}}-{{修订号}}", en: "{{文件编号}}-{{文件名称}}-{{修订号}}" },
      folderPattern: "{{项目编号}}/{{专业}}",
      rows: [
        { "项目编号": "ENG-2608", "项目名称": "示例能源站改造", "建设单位": "示例建设单位", "专业": "土建", "文件编号": "ENG-C-001", "文件名称": "基础验收记录", "修订号": "R1", "移交日期": "2026-08-08", "负责人": "示例工程师", "遗留问题数": 0 },
        { "项目编号": "ENG-2608", "项目名称": "示例能源站改造", "建设单位": "示例建设单位", "专业": "电气", "文件编号": "ENG-E-014", "文件名称": "电气测试记录", "修订号": "R2", "移交日期": "2026-08-08", "负责人": "示例工程师", "遗留问题数": 2 },
        { "项目编号": "ENG-2608", "项目名称": "示例能源站改造", "建设单位": "示例建设单位", "专业": "暖通", "文件编号": "ENG-H-006", "文件名称": "系统调试报告", "修订号": "", "移交日期": "2026-08-08", "负责人": "示例工程师", "遗留问题数": 0 }
      ],
      missingFix: { rowIndex: 2, field: "修订号", value: "R1" },
      fields: [["项目编号", true], ["项目名称", true], ["建设单位", true], ["专业", true], ["文件编号", true], ["文件名称", true], ["修订号", true], ["移交日期", true], ["负责人", true], ["遗留问题数", false], ["需要整改", false]],
      computedFields: [],
      conditionalFields: [{ name: "需要整改", expression: "coalesce(遗留问题数, 0) > 0", scope: "attachment" }],
      templates: [
        { id: "quote", kind: "PDF", builtIn: true, short: { "zh-CN": "移交封面", en: "Cover" }, name: { "zh-CN": "工程移交封面.pdf", en: "Engineering Handover Cover.pdf" }, tag: { "zh-CN": "主文件", en: "Primary" }, details: { "zh-CN": ["项目编号", "修订信息", "移交日期"], en: ["Project ID", "Revision", "Handover date"] } },
        { id: "attachment", kind: "PDF", builtIn: true, short: { "zh-CN": "登记表", en: "Register" }, name: { "zh-CN": "文件移交登记表.pdf", en: "Document Handover Register.pdf" }, tag: { "zh-CN": "附件", en: "Appendix" }, details: { "zh-CN": ["专业目录", "负责人", "检查清单"], en: ["Discipline", "Owner", "Checklist"] } }
      ]
    },

    hr: {
      id: "hr",
      icon: "HR",
      title: { "zh-CN": "HR 入职", en: "HR onboarding" },
      description: { "zh-CN": "Offer、入职资料确认与部门目录", en: "Offer, onboarding confirmation, and department folders" },
      projectName: { "zh-CN": "员工入职资料包", en: "Employee Onboarding Package" },
      eyebrow: { "zh-CN": "样例项目 / HR 入职", en: "SAMPLE PROJECT / HR ONBOARDING" },
      subtitle: { "zh-CN": "按员工和部门生成 Offer 与入职材料检查包。", en: "Generate an offer and onboarding checklist for each employee and department." },
      filename: "sample-hr-onboarding.csv",
      filenamePattern: { "zh-CN": "{{员工编号}}-{{员工姓名}}-入职资料", en: "{{员工编号}}-{{员工姓名}}-Onboarding" },
      folderPattern: "{{部门}}/{{员工编号}}-{{员工姓名}}",
      rows: [
        { "员工编号": "EMP-2601", "员工姓名": "示例员工甲", "部门": "市场部", "职位": "市场专员", "入职日期": "2026-08-17", "工作地点": "上海", "联系邮箱": "employee1@example.com", "月薪": 12000, "直属经理": "示例经理", "材料齐全": "是" },
        { "员工编号": "EMP-2602", "员工姓名": "示例员工乙", "部门": "工程部", "职位": "项目工程师", "入职日期": "2026-08-24", "工作地点": "杭州", "联系邮箱": "employee2@example.com", "月薪": 18500, "直属经理": "示例经理", "材料齐全": "是" },
        { "员工编号": "EMP-2603", "员工姓名": "示例员工丙", "部门": "财务部", "职位": "财务专员", "入职日期": "", "工作地点": "苏州", "联系邮箱": "employee3@example.com", "月薪": 13500, "直属经理": "示例经理", "材料齐全": "否" }
      ],
      missingFix: { rowIndex: 2, field: "入职日期", value: "2026-08-31" },
      fields: [["员工编号", true], ["员工姓名", true], ["部门", true], ["职位", true], ["入职日期", true], ["工作地点", true], ["联系邮箱", true], ["月薪", true], ["年薪", false], ["直属经理", true], ["材料齐全", false], ["需要补充材料", false]],
      computedFields: [{ name: "年薪", expression: "月薪 * 12", digits: 2, scope: "quote" }],
      conditionalFields: [{ name: "需要补充材料", expression: "材料齐全 == '否'", scope: "attachment" }],
      templates: [
        { id: "quote", kind: "PDF", builtIn: true, short: { "zh-CN": "Offer", en: "Offer" }, name: { "zh-CN": "入职 Offer.pdf", en: "Employment Offer.pdf" }, tag: { "zh-CN": "主文件", en: "Primary" }, details: { "zh-CN": ["岗位信息", "薪酬计算", "入职日期"], en: ["Role", "Compensation", "Start date"] } },
        { id: "attachment", kind: "PDF", builtIn: true, short: { "zh-CN": "材料清单", en: "Checklist" }, name: { "zh-CN": "入职材料检查表.pdf", en: "Onboarding Checklist.pdf" }, tag: { "zh-CN": "附件", en: "Appendix" }, details: { "zh-CN": ["部门目录", "材料状态", "经理确认"], en: ["Department", "Material status", "Manager"] } }
      ]
    },

    compliance: {
      id: "compliance",
      icon: "CO",
      title: { "zh-CN": "合规材料", en: "Compliance package" },
      description: { "zh-CN": "申报封面、证据清单与完整性报告", en: "Filing cover, evidence checklist, and completeness report" },
      projectName: { "zh-CN": "合规申报材料包", en: "Compliance Filing Package" },
      eyebrow: { "zh-CN": "样例项目 / 合规材料", en: "SAMPLE PROJECT / COMPLIANCE PACKAGE" },
      subtitle: { "zh-CN": "按主体和申报编号归档，生成材料清单并检查缺失项。", en: "Archive by entity and filing ID, then generate and validate the evidence checklist." },
      filename: "sample-compliance-package.csv",
      filenamePattern: { "zh-CN": "{{申报编号}}-{{主体名称}}-合规材料", en: "{{申报编号}}-{{主体名称}}-Compliance" },
      folderPattern: "{{主体简称}}/{{申报编号}}",
      rows: [
        { "主体简称": "示例制造", "主体名称": "示例制造有限公司", "申报编号": "CMP-260801", "合规类型": "供应商审核", "证书编号": "CERT-1001", "证书到期日": "2027-08-08", "应收材料数": 8, "已收材料数": 8, "负责人": "示例顾问", "复核日期": "2026-08-08" },
        { "主体简称": "示例服务", "主体名称": "示例服务有限公司", "申报编号": "CMP-260802", "合规类型": "年度复核", "证书编号": "CERT-1002", "证书到期日": "2027-06-30", "应收材料数": 10, "已收材料数": 9, "负责人": "示例顾问", "复核日期": "2026-08-08" },
        { "主体简称": "示例科技", "主体名称": "示例科技有限公司", "申报编号": "CMP-260803", "合规类型": "认证申报", "证书编号": "", "证书到期日": "2027-12-31", "应收材料数": 12, "已收材料数": 12, "负责人": "示例顾问", "复核日期": "2026-08-08" }
      ],
      missingFix: { rowIndex: 2, field: "证书编号", value: "CERT-1003" },
      fields: [["主体简称", true], ["主体名称", true], ["申报编号", true], ["合规类型", true], ["证书编号", true], ["证书到期日", true], ["应收材料数", true], ["已收材料数", true], ["完成率", false], ["材料齐全", false], ["负责人", true], ["复核日期", true]],
      computedFields: [{ name: "完成率", expression: "round(已收材料数 / 应收材料数 * 100, 1)", digits: 1, scope: "attachment" }],
      conditionalFields: [{ name: "材料齐全", expression: "已收材料数 >= 应收材料数", scope: "attachment" }],
      templates: [
        { id: "quote", kind: "PDF", builtIn: true, short: { "zh-CN": "申报封面", en: "Cover" }, name: { "zh-CN": "合规申报封面.pdf", en: "Compliance Filing Cover.pdf" }, tag: { "zh-CN": "主文件", en: "Primary" }, details: { "zh-CN": ["主体信息", "证书编号", "复核日期"], en: ["Entity", "Certificate", "Review date"] } },
        { id: "attachment", kind: "PDF", builtIn: true, short: { "zh-CN": "证据清单", en: "Evidence" }, name: { "zh-CN": "合规证据清单.pdf", en: "Compliance Evidence Checklist.pdf" }, tag: { "zh-CN": "附件", en: "Appendix" }, details: { "zh-CN": ["材料计数", "完成率", "缺失检查"], en: ["Evidence count", "Completion", "Missing checks"] } }
      ]
    }
  };

  for (const scenario of Object.values(scenarios)) {
    scenario.fieldConfig = scenario.fields.map(([template, required]) => ({
      template,
      source: template,
      aliases: [],
      required
    }));
    delete scenario.fields;
  }

  window.DOCFLOW_STARTER_SCENARIOS = Object.freeze({
    order: Object.freeze(["trade", "engineering", "hr", "compliance"]),
    byId: Object.freeze(scenarios)
  });
})();
