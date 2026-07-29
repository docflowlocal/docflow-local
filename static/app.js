const SAMPLE_ROWS = [
  {"客户简称":"远海贸易","客户名称":"上海远海国际贸易有限公司","报价编号":"QT-24031","报价日期":"2026-07-21","联系人":"林雯","邮箱":"linwen@yuanhai.cn","产品名称":"海外采购协同服务","产品说明":"供应商寻源、询价与单证协同","数量":3,"单价":12800,"优惠":1800,"税率":"13%","负责人":"陈启","交付周期":"10 个工作日","备注":"报价有效期 30 天"},
  {"客户简称":"精筑工程","客户名称":"杭州精筑工程顾问有限公司","报价编号":"QT-24032","报价日期":"2026-07-21","联系人":"周工","邮箱":"zhou@jingzhu.com","产品名称":"工程资料交付包","产品说明":"项目归档、目录校验与交付清单","数量":2,"单价":21500,"优惠":0,"税率":"9%","负责人":"沈昕","交付周期":"15 个工作日","备注":"含一次资料整改"},
  {"客户简称":"澄明财税","客户名称":"苏州澄明财税咨询有限公司","报价编号":"QT-24033","报价日期":"2026-07-21","联系人":"许经理","邮箱":"xu@cmfinance.cn","产品名称":"企业合规资料包","产品说明":"年度财税资料整理与合规检查","数量":6,"单价":4600,"优惠":1200,"税率":"6%","负责人":"顾言","交付周期":"7 个工作日","备注":"按月分批交付"},
  {"客户简称":"北辰教育","客户名称":"南京北辰教育科技有限公司","报价编号":"QT-24034","报价日期":"2026-07-21","联系人":"姜老师","邮箱":"jiang@beichen.edu.cn","产品名称":"证书批量生成服务","产品说明":"数据校验、证书生成与归档","数量":850,"单价":12,"优惠":500,"税率":"6%","负责人":"叶知","交付周期":"5 个工作日","备注":"需提供最终学员名单"},
  {"客户简称":"安证咨询","客户名称":"北京安证认证咨询有限公司","报价编号":"QT-24035","报价日期":"2026-07-21","联系人":"董老师","邮箱":"","产品名称":"认证申报文件包","产品说明":"模板套用、编号与完整性检查","数量":4,"单价":9800,"优惠":0,"税率":"6%","负责人":"何牧","交付周期":"12 个工作日","备注":"缺少联系邮箱"},
  {"客户简称":"泊寓资产","客户名称":"广州泊寓资产管理有限公司","报价编号":"QT-24036","报价日期":"2026-07-21","联系人":"赵先生","邮箱":"zhao@boyuassets.cn","产品名称":"房产挂牌资料包","产品说明":"房源卡、委托书与挂牌附件","数量":18,"单价":920,"优惠":800,"税率":"6%","负责人":"吴乔","交付周期":"6 个工作日","备注":"照片由客户提供"},
  {"客户简称":"启航人力","客户名称":"成都启航人力资源服务有限公司","报价编号":"QT-24037","报价日期":"2026-07-21","联系人":"王悦","邮箱":"wangyue@qihanghr.cn","产品名称":"员工入职资料包","产品说明":"合同、告知书、信息表与签署清单","数量":120,"单价":68,"优惠":300,"税率":"6%","负责人":"贺川","交付周期":"3 个工作日","备注":"按部门建立目录"},
  {"客户简称":"云岭建设","客户名称":"云南云岭建设项目管理有限公司","报价编号":"","报价日期":"2026-07-21","联系人":"罗工","邮箱":"luo@yunlingbuild.cn","产品名称":"竣工资料交付包","产品说明":"卷册编号、封面生成与完整性报告","数量":9,"单价":7300,"优惠":2600,"税率":"9%","负责人":"苏桐","交付周期":"20 个工作日","备注":"缺少报价编号"}
];

if (window.docflowDesktop?.isDesktop) {
  document.documentElement.classList.add("desktop-app");
  if (window.docflowDesktop.platform === "darwin") document.documentElement.classList.add("desktop-mac");
}

const I18N = window.DOCFLOW_I18N || {};
const SUPPORTED_LOCALES = ["zh-CN", "en"];
const DEFAULT_LOCALE = (() => {
  try {
    const saved = localStorage.getItem("docflow-locale");
    if (SUPPORTED_LOCALES.includes(saved)) return saved;
  } catch (_error) {
    // Desktop preferences remain available when localStorage is unavailable.
  }
  return String(navigator.language || "").toLowerCase().startsWith("zh") ? "zh-CN" : "en";
})();
const DEFAULT_FILENAME_PATTERNS = {
  "zh-CN": "{{客户简称}}-报价单-{{报价编号}}",
  en: "{{客户简称}}-Quotation-{{报价编号}}"
};
const IGNORE_MAPPING = "__DOCFLOW_IGNORE__";
const BASE_FIELD_CONFIG = [
  { template: "客户简称", source: "客户简称", aliases: ["Customer Short Name", "CustomerShortName", "Customer Abbreviation", "Client Short Name", "ClientShortName"], required: true },
  { template: "客户名称", source: "客户名称", aliases: ["Customer Name", "CustomerName", "Client Name", "ClientName", "Company Name", "CompanyName"], required: true },
  { template: "报价编号", source: "报价编号", aliases: ["Quote ID", "QuoteID", "Quote No", "QuoteNo", "Quote Number", "QuoteNumber", "Quotation ID", "QuotationID", "Quotation No", "QuotationNo", "Quotation Number", "QuotationNumber"], required: true },
  { template: "报价日期", source: "报价日期", aliases: ["Quote Date", "QuoteDate", "Quotation Date", "QuotationDate", "Date"], required: true },
  { template: "联系人", source: "联系人", aliases: ["Contact", "Contact Name", "ContactName"], required: true },
  { template: "联系邮箱", source: "邮箱", aliases: ["联系邮箱", "Email", "Email Address", "EmailAddress", "Contact Email", "ContactEmail"], required: true },
  { template: "产品名称", source: "产品名称", aliases: ["Product Name", "ProductName", "Item", "Item Name", "ItemName", "Service Name", "ServiceName"], required: true },
  { template: "数量", source: "数量", aliases: ["Quantity", "Qty"], required: true },
  { template: "单价", source: "单价", aliases: ["Unit Price", "UnitPrice", "Price"], required: true },
  { template: "优惠", source: "优惠", aliases: ["Discount"], required: false },
  { template: "税率", source: "税率", aliases: ["Tax Rate", "TaxRate", "VAT Rate", "VATRate"], required: false },
  { template: "含税总额", source: "", aliases: ["Total incl. tax", "Total Including Tax", "TotalIncludingTax", "Grand Total", "GrandTotal"], required: false }
];
const DEFAULT_HEADERS = Object.keys(SAMPLE_ROWS[0]);
const FIELD_CONFIG = BASE_FIELD_CONFIG.map(field => ({ ...field }));
const BUILTIN_TEMPLATES = [
  {
    id: "quote",
    kind: "PDF",
    builtIn: true,
    shortKey: "templates.quoteShort",
    nameKey: "templates.quotePdfName",
    tagKey: "templates.primary",
    detailKeys: ["templates.nineFields", "templates.oneRule", "templates.qr"],
    fields: BASE_FIELD_CONFIG.map(field => field.template)
  },
  {
    id: "attachment",
    kind: "PDF",
    builtIn: true,
    shortKey: "templates.attachmentShort",
    nameKey: "templates.attachmentName",
    tagKey: "templates.attachment",
    detailKeys: ["templates.fourFields", "templates.conditional", "templates.itemList"],
    fields: ["报价编号", "客户名称", "客户简称", "产品名称", "产品说明", "交付周期", "负责人", "备注"]
  }
];

const state = {
  filename: "客户报价清单_Q3.csv",
  headers: [...DEFAULT_HEADERS],
  rows: [...SAMPLE_ROWS],
  sourceRows: SAMPLE_ROWS.map((_row, index) => index + 2),
  templates: new Set(BUILTIN_TEMPLATES.map(template => template.id)),
  templateCatalog: new Map(BUILTIN_TEMPLATES.map(template => [template.id, template])),
  mappings: Object.fromEntries(BASE_FIELD_CONFIG.filter(field => field.source).map(field => [field.template, field.source])),
  requiredOverrides: new Map(),
  computedFields: [
    { name: "小计", expression: "数量 * 单价", digits: 2, scope: "quote" },
    { name: "税额", expression: "(数量 * 单价 - coalesce(优惠, 0)) * coalesce(税率, 0.13)", digits: 2, scope: "quote" },
    { name: "含税总额", expression: "round((数量 * 单价 - coalesce(优惠, 0)) * (1 + coalesce(税率, 0.13)), 2)", digits: 2, scope: "quote" }
  ],
  conditionalFields: [
    { name: "显示优惠行", expression: "coalesce(优惠, 0) > 0", scope: "quote" }
  ],
  validation: null,
  busy: false,
  signature: "",
  signatureName: "",
  assetFiles: new Map(),
  editingRule: null,
  sessionToken: "",
  sessionReady: !window.docflowDesktop?.isDesktop,
  locale: DEFAULT_LOCALE
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function t(key, variables = {}) {
  const template = I18N[state.locale]?.[key] ?? I18N["zh-CN"]?.[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}

function basename(filename) {
  return String(filename || "").replace(/\.[^.]+$/, "");
}

function normalizedAssetAlias(value) {
  return String(value || "").normalize("NFC").trim().toLowerCase();
}

function assetAliases(filename) {
  return [...new Set([
    normalizedAssetAlias(filename),
    normalizedAssetAlias(basename(filename))
  ].filter(Boolean))];
}

function numberValue(value) {
  if (typeof value === "number") return value;
  const normalized = String(value ?? "").replaceAll(",", "").replace(/[¥￥]/g, "").trim();
  if (normalized.endsWith("%")) return Number(normalized.slice(0, -1) || 0) / 100;
  const result = Number(normalized || 0);
  return Number.isFinite(result) ? result : 0;
}

function money(value) {
  return new Intl.NumberFormat(state.locale === "en" ? "en-US" : "zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2
  }).format(numberValue(value));
}

async function loadSavedLocale() {
  if (!window.docflowDesktop?.getLocale) return;
  try {
    const saved = await window.docflowDesktop.getLocale();
    if (SUPPORTED_LOCALES.includes(saved)) state.locale = saved;
  } catch (_error) {
    // Browser storage remains the fallback.
  }
}

async function loadSessionToken(force = false) {
  if (!window.docflowDesktop?.getSessionToken) {
    state.sessionReady = !window.docflowDesktop?.isDesktop;
    if (!state.sessionReady) throw new Error(t("toast.sessionFailed"));
    return "";
  }
  if (state.sessionToken && !force) return state.sessionToken;
  const token = await window.docflowDesktop.getSessionToken();
  if (typeof token !== "string" || token.length < 16) {
    state.sessionReady = false;
    throw new Error(t("toast.sessionFailed"));
  }
  state.sessionToken = token;
  state.sessionReady = true;
  return token;
}

async function apiFetch(resource, options = {}, allowRetry = true) {
  if (!state.sessionReady || (!state.sessionToken && window.docflowDesktop?.getSessionToken)) {
    await loadSessionToken();
  }
  const headers = new Headers(options.headers || {});
  if (state.sessionToken) headers.set("X-DocFlow-Token", state.sessionToken);
  const response = await fetch(resource, { ...options, headers });
  if (response.status === 401 && allowRetry && window.docflowDesktop?.getSessionToken) {
    await loadSessionToken(true);
    return apiFetch(resource, options, false);
  }
  return response;
}

function localizeEngineMessage(value) {
  const message = String(value || "").trim();
  if (state.locale !== "en" || !message || /^[A-Za-z]/.test(message)) return message;
  const replacements = [
    [/^仅支持 JSON、CSV、XLSX 或 XLSM 数据文件$/, "Only JSON, CSV, XLSX, or XLSM data files are supported."],
    [/^数据文件为空$/, "The data file is empty."],
    [/^JSON 数据不是有效的 UTF-8 JSON$/, "The JSON file is not valid UTF-8 JSON."],
    [/^JSON 数据必须是数组，或包含 rows 数组的对象$/, 'JSON must be an array or an object with a "rows" array.'],
    [/^JSON 第 (\d+) 条记录必须是对象$/, "JSON row $1 must be an object."],
    [/^JSON 包含禁止字段：(.+)$/, "JSON contains a forbidden field: $1"],
    [/^数据列超过 (\d+) 列限制$/, "The data exceeds the $1-column limit."],
    [/^数据记录超过 (\d+) 条限制$/, "The data exceeds the $1-record limit."],
    [/^CSV 包含未闭合的引号字段$/, "The CSV contains an unclosed quoted field."],
    [/^文件超过 25 MB 限制$/, "The file exceeds the 25 MB limit."],
    [/^请选择文件$/, "Choose a file first."],
    [/^模板仅支持 DOCX 或 PDF$/, "Only DOCX or PDF templates are supported."],
    [/^单次项目最多添加 (\d+) 个模板$/, "A project can contain at most $1 templates."],
    [/^模板总大小超过 100 MB 限制$/, "The combined template size exceeds the 100 MB limit."],
    [/^模板 (.+) 已失效，请重新添加$/, "Template $1 is no longer available. Add it again."],
    [/^未找到图片资源“(.+)”$/, "Image asset “$1” was not found."],
    [/^缺少图片资源“(.+)”$/, "Image asset “$1” is missing."],
    [/^必填资源字段 (.+) 为空$/, "Required asset field $1 is blank."],
    [/^内置报价单二维码内容超过 2000 字节安全限制$/, "The built-in quotation QR content exceeds the 2,000-byte safety limit."],
    [/^值“(.+)”不在 PDF 字段 (.+) 的允许选项中$/, "Value “$1” is not an allowed option for PDF field $2."],
    [/^请求数据超过 32 MB 限制$/, "The workflow request exceeds the 32 MB limit."],
    [/^请求数据格式无效$/, "The workflow request is not valid JSON."],
    [/^方法不受支持$/, "This operation is not supported."],
    [/^本地会话令牌无效$/, "The local session token is invalid."],
    [/^请求主机不受信任$/, "The request host is not trusted."],
    [/^请求来源不受信任$/, "The request origin is not trusted."]
  ];
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  if (/^Excel\b|^Excel /.test(message)) return `Excel safety check failed: ${message.replace(/^Excel\s*/, "")}`;
  if (/^DOCX\b/.test(message)) return `DOCX template safety check failed: ${message.replace(/^DOCX\s*/, "")}`;
  if (/^Word\b/.test(message)) return `Word template processing failed: ${message.replace(/^Word\s*/, "")}`;
  if (/^PDF\b/.test(message)) return `PDF template processing failed: ${message.replace(/^PDF\s*/, "")}`;
  if (/^图片/.test(message)) return `Image validation failed: ${message.replace(/^图片(?:资源)?/, "")}`;
  if (/公式|运算符|未知字段|coalesce|round/.test(message)) return `Formula error: ${message}`;
  return `Local processing error: ${message}`;
}

async function apiError(response, fallback) {
  const payload = await response.json().catch(() => null);
  return new Error(localizeEngineMessage(payload?.error || payload?.message || fallback));
}

function checked(id) {
  return Boolean(document.getElementById(id)?.checked);
}

function currentAssets() {
  const assets = {};
  for (const [filename, file] of state.assetFiles) {
    for (const alias of new Set([
      filename,
      file.baseName,
      ...(file.aliases || assetAliases(filename))
    ].filter(Boolean))) {
      assets[alias] = file.dataUrl;
    }
  }
  return assets;
}

function currentSettings() {
  return {
    filenamePattern: $("#filenamePattern").textContent.trim(),
    folderPattern: $("#folderPattern").textContent.trim(),
    signature: state.signature,
    assets: currentAssets(),
    skipBlank: checked("skipBlank"),
    stopOnMissing: checked("stopOnMissing"),
    validationReport: checked("validationReport"),
    includeSourceDocx: checked("includeSourceDocx"),
    mergePdfs: checked("mergePdfs"),
    flattenPdf: checked("flattenPdf")
  };
}

function fieldDetail(template, fieldName) {
  const details = template?.fieldDetails;
  if (Array.isArray(details)) {
    return details.find(detail => (
      typeof detail === "object"
      && String(detail.name ?? detail.field ?? detail.key ?? "") === fieldName
    )) || null;
  }
  if (details && typeof details === "object") return details[fieldName] || null;
  return null;
}

function normalizedHeader(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function autoSourceFor(templateField) {
  const base = BASE_FIELD_CONFIG.find(field => field.template === templateField);
  for (const preferred of [templateField, base?.source].filter(Boolean)) {
    const matches = state.headers.filter(header => normalizedHeader(header) === normalizedHeader(preferred));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return "";
  }
  const aliases = (base?.aliases || []).map(normalizedHeader);
  const matches = state.headers.filter(header => aliases.includes(normalizedHeader(header)));
  return matches.length === 1 ? matches[0] : "";
}

function ruleApplies(rule) {
  return !rule.scope || state.templates.has(rule.scope);
}

function activeComputedFields() {
  return state.computedFields.filter(ruleApplies);
}

function activeConditionalFields() {
  return state.conditionalFields.filter(ruleApplies);
}

function computedRuleFor(name) {
  return activeComputedFields().find(rule => rule.name === name);
}

function conditionalRuleFor(name) {
  return activeConditionalFields().find(rule => rule.name === name);
}

function extractPatternFields(pattern) {
  return [...String(pattern || "").matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)]
    .map(match => match[1].trim())
    .filter(Boolean);
}

function currentPatternFields() {
  return [...new Set([
    ...extractPatternFields($("#filenamePattern")?.textContent),
    ...extractPatternFields($("#folderPattern")?.textContent)
  ])];
}

function resolvedRequired(name, defaultRequired) {
  return state.requiredOverrides.has(name)
    ? Boolean(state.requiredOverrides.get(name))
    : Boolean(defaultRequired);
}

function rebuildFieldConfig() {
  const definitions = new Map();
  for (const templateId of state.templates) {
    const template = state.templateCatalog.get(templateId);
    for (const fieldName of template?.fields || []) {
      const name = String(fieldName || "").trim();
      if (!name) continue;
      const base = BASE_FIELD_CONFIG.find(field => field.template === name);
      const detail = fieldDetail(template, name);
      const existing = definitions.get(name);
      const defaultRequired = Boolean(
        existing?.defaultRequired
        || detail?.required === true
        || (template.builtIn && base?.required)
      );
      definitions.set(name, {
        template: name,
        source: state.mappings[name] ?? autoSourceFor(name),
        defaultRequired,
        namingField: Boolean(existing?.namingField)
      });
    }
  }
  for (const name of currentPatternFields()) {
    const existing = definitions.get(name);
    definitions.set(name, {
      template: name,
      source: state.mappings[name] ?? existing?.source ?? autoSourceFor(name),
      defaultRequired: true,
      namingField: true
    });
  }
  FIELD_CONFIG.splice(0, FIELD_CONFIG.length, ...[...definitions.values()].map(field => ({
    ...field,
    required: field.namingField ? true : resolvedRequired(field.template, field.defaultRequired)
  })));
  for (const field of FIELD_CONFIG) {
    if (computedRuleFor(field.template)) field.formula = computedRuleFor(field.template).expression;
    if (conditionalRuleFor(field.template)) field.condition = conditionalRuleFor(field.template).expression;
    if (!Object.prototype.hasOwnProperty.call(state.mappings, field.template) && !field.formula && !field.condition) {
      state.mappings[field.template] = field.source || autoSourceFor(field.template);
    }
  }
  for (const name of currentPatternFields()) {
    const field = FIELD_CONFIG.find(item => item.template === name);
    if (!field || field.defaultRequired !== true || field.required !== true || field.namingField !== true) {
      throw new Error(t("toast.payloadInvalid"));
    }
  }
}

function currentMappings() {
  return Object.fromEntries(FIELD_CONFIG
    .filter(field => !field.formula && !field.condition)
    .map(field => [
      field.template,
      state.mappings[field.template] === IGNORE_MAPPING
        ? { kind: "literal", value: "" }
        : state.mappings[field.template] || ""
    ]));
}

function currentRequiredFields() {
  return [...new Set(FIELD_CONFIG.filter(field => field.required).map(field => field.template))];
}

function workflowPayload() {
  const orderedTemplates = [...state.templateCatalog.keys()]
    .filter(templateId => state.templates.has(templateId));
  const payload = {
    locale: state.locale,
    rows: state.rows,
    sourceRows: state.sourceRows,
    requiredFields: currentRequiredFields(),
    mappings: currentMappings(),
    unconfirmedFields: [...new Set(mappingWarnings().map(field => field.template))],
    computedFields: activeComputedFields().map(rule => ({ ...rule })),
    conditionalFields: activeConditionalFields().map(rule => ({ ...rule })),
    templates: orderedTemplates,
    settings: currentSettings()
  };
  const selected = new Set(payload.templates);
  const scopedLeak = [...payload.computedFields, ...payload.conditionalFields]
    .some(rule => rule.scope && !selected.has(rule.scope));
  if (scopedLeak || !Array.isArray(payload.unconfirmedFields)) {
    throw new Error(t("toast.payloadInvalid"));
  }
  return payload;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function createWorkflowSnapshot() {
  const body = JSON.stringify(workflowPayload());
  const payload = deepFreeze(JSON.parse(body));
  if (JSON.stringify(payload) !== body || !Object.isFrozen(payload)) {
    throw new Error(t("toast.payloadInvalid"));
  }
  return Object.freeze({ payload, body });
}

function setGenerateLabel(count) {
  $("#generateSideLabel").innerHTML = t("readiness.generate", {
    count: `<b id="generateCount">${Number(count) || 0}</b>`
  });
}

function updateTemplateSummary() {
  const count = state.templates.size;
  $("#navTemplateCount").textContent = count;
  $("#templateHeading").textContent = t("templates.headingCount", { count });
  $("#folderFileCount").textContent = t("output.fileCount", { count });
  const hasSelectedDocx = [...state.templates].some(templateId => {
    const template = state.templateCatalog.get(templateId);
    return template && !template.builtIn && String(template.kind).toUpperCase() === "DOCX";
  });
  const includeSource = $("#includeSourceDocx");
  if (includeSource) {
    includeSource.disabled = !hasSelectedDocx;
    if (!hasSelectedDocx) includeSource.checked = false;
    includeSource.closest(".setting-row")?.classList.toggle("setting-unavailable", !hasSelectedDocx);
  }
  const copy = $("#includeSourceDocxCopy");
  if (copy) {
    copy.textContent = t(hasSelectedDocx
      ? "output.includeSourceDocxCopy"
      : "output.includeSourceDocxUnavailable");
  }
}

function templateAssetCount(template) {
  if (Array.isArray(template.assets)) return template.assets.length;
  if (template.assets && typeof template.assets === "object") return Object.keys(template.assets).length;
  return 0;
}

function renderTemplateCards() {
  $("#templateList").innerHTML = [...state.templateCatalog.values()].map(template => {
    const selected = state.templates.has(template.id);
    const isPdf = String(template.kind).toUpperCase() === "PDF";
    const name = template.nameKey ? t(template.nameKey) : template.filename;
    const shortName = template.shortKey ? t(template.shortKey) : t("toast.template");
    const tag = template.tagKey ? t(template.tagKey) : t("toast.custom");
    let details;
    if (template.detailKeys) {
      details = template.detailKeys.map(key => `<span>${escapeHtml(t(key))}</span>`).join("");
    } else {
      const items = [
        t("toast.placeholders", { count: template.fields?.length || 0 }),
        template.fillable ? t("templates.fillable") : t("toast.localParsed")
      ];
      const assetCount = templateAssetCount(template);
      if (assetCount) items.push(t("templates.assetCount", { count: assetCount }));
      details = items.map(item => `<span>${escapeHtml(item)}</span>`).join("");
    }
    const action = template.builtIn
      ? '<span class="template-spacer" aria-hidden="true"></span>'
      : `<button class="more-btn remove-template" type="button" aria-label="${escapeHtml(t("actions.remove"))}" title="${escapeHtml(t("actions.remove"))}">×</button>`;
    return `<article class="template-card ${selected ? "selected" : ""}" data-template="${escapeHtml(template.id)}" role="checkbox" aria-checked="${selected}" tabindex="0">
      <div class="file-thumb ${isPdf ? "pdf" : "word"}"><span>${isPdf ? "P" : "W"}</span><b>${escapeHtml(shortName)}</b><small>${escapeHtml(template.kind)}</small></div>
      <div class="template-info"><div><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong><span class="tag ${template.builtIn && template.id === "quote" ? "" : "grey"}">${escapeHtml(tag)}</span></div><p>${details}</p></div>
      ${action}<span class="selected-check">✓</span>
    </article>`;
  }).join("");
  updateTemplateSummary();
}

function firstRowPreview(field) {
  const row = state.rows[0] || {};
  if (field.formula) {
    if (field.template === "含税总额") {
      const mapped = mappedLocalRow(row);
      const subtotal = numberValue(mapped["数量"]) * numberValue(mapped["单价"]);
      const rawTaxRate = mapped["税率"];
      const taxRate = String(rawTaxRate ?? "").trim() ? numberValue(rawTaxRate) : 0.13;
      return money((subtotal - numberValue(mapped["优惠"])) * (1 + taxRate));
    }
    return "∑";
  }
  if (field.condition) return "⌁";
  const source = state.mappings[field.template];
  if (source === IGNORE_MAPPING) return t("mapping.ignored");
  const value = row[source] ?? "—";
  if (["单价", "含税总额"].includes(field.template)) return money(value);
  return value;
}

function mappingWarnings() {
  return FIELD_CONFIG.filter(field => (
    !field.formula
    && !field.condition
    && (!state.mappings[field.template] || field.warning)
  ));
}

function renderMappingRows() {
  const container = $("#mappingRows");
  container.innerHTML = FIELD_CONFIG.map(field => {
    const options = [
      `<option value="">${escapeHtml(t("mapping.unmapped"))}</option>`,
      `<option value="${IGNORE_MAPPING}" ${state.mappings[field.template] === IGNORE_MAPPING ? "selected" : ""}>${escapeHtml(t("mapping.ignore"))}</option>`,
      ...state.headers.map(header => `<option value="${escapeHtml(header)}" ${state.mappings[field.template] === header ? "selected" : ""}>${escapeHtml(header)}</option>`)
    ].join("");
    const isRule = Boolean(field.formula || field.condition);
    const isWarning = !isRule && (!state.mappings[field.template] || field.warning);
    const ruleMarkup = field.formula
      ? `<div class="formula-value">∑ ${escapeHtml(field.formula)}</div>`
      : `<div class="formula-value condition-value">⌁ ${escapeHtml(field.condition)}</div>`;
    const requirementAction = field.required
      ? t("mapping.makeOptional", { field: field.template })
      : t("mapping.makeRequired", { field: field.template });
    const requirementMarkup = isRule
      ? field.required
        ? `<span class="required-star" title="${escapeHtml(t("mapping.required"))}">*</span>`
        : ""
      : field.namingField
        ? `<button class="text-btn tag requirement-locked" type="button" disabled aria-disabled="true" aria-label="${escapeHtml(t("mapping.namingRequired", { field: field.template }))}" title="${escapeHtml(t("mapping.namingRequired", { field: field.template }))}">${escapeHtml(t("mapping.requiredShort"))}</button>`
        : `<button class="text-btn tag ${field.required ? "" : "grey"} requirement-toggle" type="button" aria-pressed="${field.required}" aria-label="${escapeHtml(requirementAction)}" title="${escapeHtml(requirementAction)}">${escapeHtml(t(field.required ? "mapping.requiredShort" : "mapping.optionalShort"))}</button>`;
    return `<div class="mapping-row" data-field="${escapeHtml(field.template)}">
      <div class="mapping-key"><code title="${escapeHtml(field.template)}">{{${escapeHtml(field.template)}}}</code>${requirementMarkup}</div>
      ${isRule ? ruleMarkup : `<select class="mapping-select" aria-label="${escapeHtml(field.template + t("mapping.sourceAria"))}">${options}</select>`}
      <div class="value-preview">${escapeHtml(firstRowPreview(field))}</div>
      <div><span class="map-status ${isWarning ? "warning" : ""}"><i>${isWarning ? "!" : "✓"}</i>${isWarning ? t("mapping.confirm") : t("mapping.ready")}</span></div>
    </div>`;
  }).join("");
  container.querySelectorAll("select").forEach(select => select.addEventListener("change", event => {
    const template = event.target.closest(".mapping-row").dataset.field;
    state.mappings[template] = event.target.value;
    const config = FIELD_CONFIG.find(item => item.template === template);
    if (config) config.warning = !event.target.value;
    state.validation = null;
    renderMappingRows();
    updateReadiness();
  }));
  container.querySelectorAll(".requirement-toggle").forEach(button => button.addEventListener("click", event => {
    const fieldName = event.currentTarget.closest(".mapping-row").dataset.field;
    const field = FIELD_CONFIG.find(item => item.template === fieldName);
    if (!field || field.formula || field.condition) return;
    state.requiredOverrides.set(fieldName, !field.required);
    state.validation = null;
    rebuildFieldConfig();
    renderMappingRows();
    updateReadiness(localValidate());
  }));
  const warnings = mappingWarnings();
  $("#mappedCount").textContent = Math.max(0, FIELD_CONFIG.length - warnings.length);
  $("#warnCount").textContent = warnings.length;
}

function renderPreviewTable() {
  const shownHeaders = state.headers.slice(0, 7);
  $("#tablePreview").innerHTML = `<table class="preview-table"><thead><tr>${shownHeaders.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${state.rows.slice(0, 8).map(row => `<tr>${shownHeaders.map(header => {
    const value = row[header];
    const present = value !== null && value !== undefined && String(value).trim() !== "";
    return `<td class="${present ? "" : "missing"}">${escapeHtml(present ? value : t("common.missing"))}</td>`;
  }).join("")}</tr>`).join("")}</tbody></table>`;
}

function mappedLocalRow(row) {
  const mapped = { ...row };
  for (const [target, source] of Object.entries(currentMappings())) {
    mapped[target] = source && typeof source === "object" && source.kind === "literal"
      ? source.value ?? ""
      : row[source] ?? "";
  }
  return mapped;
}

function localValidate() {
  const issues = [];
  const skipBlank = document.getElementById("skipBlank")?.checked !== false;
  const indexedRows = state.rows.map((source, sourceIndex) => ({ source, sourceIndex }));
  const rows = skipBlank
    ? indexedRows.filter(({ source }) => Object.values(source).some(value => String(value ?? "").trim()))
    : indexedRows;
  rows.forEach(({ source, sourceIndex }) => {
    const row = mappedLocalRow(source);
    const missing = currentRequiredFields().filter(field => !String(row[field] ?? "").trim());
    if (missing.length) {
      const providedSourceRow = Number(state.sourceRows?.[sourceIndex]);
      const sourceRow = Number.isSafeInteger(providedSourceRow) && providedSourceRow > 0
        ? providedSourceRow
        : sourceIndex + 2;
      issues.push({
        row: sourceRow,
        record: row["客户简称"] || row["客户名称"] || (state.locale === "en" ? `Record ${sourceRow - 1}` : `第 ${sourceRow - 1} 条`),
        missing,
        errors: []
      });
    }
  });
  return { total: rows.length, valid: rows.length - issues.length, invalid: issues.length, issues };
}

function updateReadiness(validation = state.validation || localValidate()) {
  state.validation = validation;
  const warningCount = mappingWarnings().length;
  const templateCount = state.templates.size;
  const configIssues = Array.isArray(validation.configIssues) ? validation.configIssues : [];
  const templatesReady = templateCount > 0 && configIssues.length === 0;
  let score = 100
    - Math.min((validation.invalid || 0) * 6, 18)
    - Math.min(warningCount * 6, 18)
    - (templateCount ? 0 : 25)
    - Math.min(configIssues.length * 10, 20);
  score = Math.max(score, 30);
  $("#scoreValue").textContent = score;
  $("#scoreCircle").style.strokeDashoffset = String(113 - 113 * score / 100);
  const totalIssues = (validation.invalid || 0) + warningCount + configIssues.length + (templateCount ? 0 : 1);
  $("#readinessTitle").textContent = totalIssues
    ? t("readiness.issues", { count: totalIssues })
    : t("readiness.ready");
  $("#readinessList").innerHTML = `
    <li class="done">${t("readiness.dataLoaded")} <span>✓</span></li>
    <li class="${templatesReady ? "done" : "attention"}">${configIssues.length ? escapeHtml(localizeEngineMessage(configIssues[0])) : t("readiness.templates", { count: templateCount })} <span>${templatesReady ? "✓" : "!"}</span></li>
    <li class="${validation.invalid ? "attention" : "done"}">${validation.invalid ? t("readiness.recordsMissing", { count: validation.invalid }) : t("readiness.allComplete")} <span>${validation.invalid ? "!" : "✓"}</span></li>
    <li class="${warningCount ? "attention" : "done"}">${warningCount ? t("readiness.mappingsNeed", { count: warningCount }) : t("readiness.mappingsComplete")} <span>${warningCount ? "!" : "✓"}</span></li>`;
  $("#metricMissing").textContent = (validation.issues || []).reduce((sum, issue) => (
    sum + (issue.missing?.length || 0) + (issue.errors?.length || 0)
  ), 0);
  setGenerateLabel(validation.valid || 0);
  updateTemplateSummary();
}

function updateMetrics() {
  $("#dataFilename").textContent = state.filename;
  $("#metricRows").textContent = state.rows.length;
  $("#metricFields").textContent = state.headers.length;
  $("#navRowCount").textContent = state.rows.length;
  renderPreviewTable();
  rebuildFieldConfig();
  renderMappingRows();
  updateReadiness(localValidate());
  updatePatternPreview();
}

function renderPattern(pattern, row = state.rows[0] || {}) {
  const mapped = mappedLocalRow(row);
  return String(pattern).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, key) => {
    const field = key.trim();
    const value = mapped[field];
    return value === null || value === undefined || String(value).trim() === ""
      ? field
      : String(value);
  });
}

function updatePatternPreview() {
  const row = state.rows[0] || {};
  $("#filenamePreview").textContent = `${renderPattern($("#filenamePattern").textContent.trim(), row)}.pdf`;
  const folders = renderPattern($("#folderPattern").textContent.trim(), row).split(/[\\/]/);
  $("#folderCustomer").textContent = folders[0] || t("common.customer");
  $("#folderQuote").textContent = folders[1] || t("common.number");
  updateTemplateSummary();
}

function renderRules() {
  const rules = [
    ...state.computedFields.map((rule, index) => ({ ...rule, type: "computed", index })),
    ...state.conditionalFields.map((rule, index) => ({ ...rule, type: "conditional", index }))
  ];
  $("#ruleList").innerHTML = rules.length ? rules.map(rule => `
    <div class="rule-row">
      <div class="rule-symbol ${rule.type === "conditional" ? "branch" : ""}">${rule.type === "conditional" ? "⌁" : "∑"}</div>
      <div><strong>${escapeHtml(rule.name)}</strong><p>${escapeHtml(rule.expression)}</p></div>
      <span>${escapeHtml([
        t(rule.type === "conditional" ? "rules.conditional" : "rules.computed"),
        rule.scope ? t("rules.quoteOnly") : ""
      ].filter(Boolean).join(" · "))}</span>
      <button class="edit-rule" type="button" data-rule-type="${rule.type}" data-rule-index="${rule.index}">${escapeHtml(t("rules.edit"))}</button>
    </div>
  `).join("") : `<div class="empty-rule-state">${escapeHtml(t("rules.empty"))}</div>`;
}

function renderAssetList() {
  const entries = [...state.assetFiles.entries()];
  $("#assetStatus").textContent = entries.length
    ? t("output.assetsReady", { count: entries.length })
    : t("output.noAssets");
  $("#assetList").innerHTML = entries.map(([filename]) => `
    <span class="asset-chip" title="${escapeHtml(filename)}">${escapeHtml(basename(filename))}<button type="button" data-remove-asset="${escapeHtml(filename)}" aria-label="${escapeHtml(t("actions.remove"))}">×</button></span>
  `).join("");
}

function clearSignature(showConfirmation = false) {
  const hadSignature = Boolean(state.signature);
  state.signature = "";
  state.signatureName = "";
  state.validation = null;
  $("#signatureInput").value = "";
  $("#signatureStatus").textContent = t("output.noSignature");
  $("#signatureRemove").hidden = true;
  updateReadiness(localValidate());
  if (showConfirmation && hadSignature) {
    showToast(t("toast.signatureRemoved"), t("toast.signatureRemovedCopy"));
  }
}

function showToast(title, copy = "") {
  $("#toastTitle").textContent = title;
  $("#toastCopy").textContent = copy;
  $("#toast").classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => $("#toast").classList.remove("show"), 3600);
}

function applyLocale(previousLocale = state.locale) {
  document.documentElement.lang = state.locale;
  document.title = t("app.title");
  $$("[data-i18n]").forEach(element => {
    if (element.id === "signatureStatus" && state.signatureName) {
      element.textContent = state.signatureName;
      return;
    }
    if (element.id === "assetStatus" && state.assetFiles.size) return;
    element.textContent = t(element.dataset.i18n);
  });
  $$("[data-i18n-aria]").forEach(element => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria));
  });
  $$("[data-i18n-placeholder]").forEach(element => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
  const pattern = $("#filenamePattern");
  if (pattern && Object.values(DEFAULT_FILENAME_PATTERNS).includes(pattern.textContent.trim())) {
    pattern.textContent = DEFAULT_FILENAME_PATTERNS[state.locale];
  } else if (pattern && pattern.textContent.trim() === DEFAULT_FILENAME_PATTERNS[previousLocale]) {
    pattern.textContent = DEFAULT_FILENAME_PATTERNS[state.locale];
  }
  $("#languageToggleLabel").textContent = state.locale === "zh-CN" ? "EN" : "中";
  $("#languageToggle").title = t("language.switch");
  $("#languageToggle").setAttribute("aria-label", t("language.switch"));
  $("#engineLabel").textContent = window.docflowDesktop?.isDesktop
    ? t("engine.desktop", { version: window.docflowDesktop.versions.electron })
    : t("engine.local");
  renderTemplateCards();
  rebuildFieldConfig();
  renderMappingRows();
  renderPreviewTable();
  renderRules();
  renderAssetList();
  updateReadiness(state.validation || localValidate());
  updatePatternPreview();
  if (!$("#validationModal").hidden && state.validation) showValidation(state.validation);
  if (!$("#ruleModal").hidden) updateRuleModalLabels();
}

async function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale) || locale === state.locale) return;
  const previousLocale = state.locale;
  state.locale = locale;
  try {
    localStorage.setItem("docflow-locale", locale);
  } catch (_error) {
    // Desktop preferences below remain available.
  }
  if (window.docflowDesktop?.setLocale) {
    try {
      await window.docflowDesktop.setLocale(locale);
    } catch (_error) {
      // Locale persistence is non-blocking.
    }
  }
  applyLocale(previousLocale);
}

function showValidation(result = localValidate()) {
  state.validation = result;
  const issues = result.issues || [];
  const configIssues = Array.isArray(result.configIssues) ? result.configIssues : [];
  const unconfirmedFields = [...new Set(mappingWarnings().map(field => field.template))];
  const ok = result.invalid === 0 && configIssues.length === 0 && unconfirmedFields.length === 0;
  $("#modalIcon").textContent = ok ? "✓" : "!";
  $("#modalIcon").style.color = ok ? "var(--teal)" : "";
  $("#modalIcon").style.background = ok ? "var(--teal-pale)" : "";
  $("#modalTitle").textContent = ok
    ? t("modal.allPassed", { count: result.total })
    : configIssues.length
      ? t("modal.configFound", { count: configIssues.length })
      : unconfirmedFields.length
        ? t("modal.mappingFound", { count: unconfirmedFields.length })
        : t("modal.found", { count: result.invalid });
  $("#modalCopy").textContent = ok
    ? t("modal.allReady")
    : configIssues.length
      ? t("modal.configCopy")
      : unconfirmedFields.length
        ? t("modal.mappingCopy")
        : t("modal.validContinue", { count: result.valid });
  $("#issueList").innerHTML = ok
    ? `<div class="no-issues">${t("modal.noMissing")}</div>`
    : [
      ...configIssues.map(message => `<div class="config-issue-item"><span>!</span><strong>${escapeHtml(localizeEngineMessage(message))}</strong></div>`),
      ...unconfirmedFields.map(field => `<div class="config-issue-item"><span>!</span><strong>${escapeHtml(t("modal.mappingIssue", { field }))}</strong></div>`),
      ...issues.map(issue => {
      const details = [
        ...(issue.missing || []),
        ...(issue.errors || []).map(localizeEngineMessage)
      ];
      return `<div class="issue-item"><span>${t("modal.row", { count: issue.row })}</span><div><strong>${escapeHtml(issue.record)}</strong><p>${t("modal.missingFields", { count: details.length })}</p></div><em>${escapeHtml(details.join(t("common.separator")))}</em></div>`;
      })
    ].join("");
  $("#modalGenerate").textContent = ok
    ? t("modal.generateGroups", { count: result.valid })
    : t("modal.generateValid", { count: result.valid });
  $("#modalGenerate").disabled = result.canGenerate === false || state.templates.size === 0 || unconfirmedFields.length > 0;
  $("#validationModal").hidden = false;
}

async function runValidation(openModal = true, snapshot = null) {
  try {
    const workflow = snapshot || createWorkflowSnapshot();
    const response = await apiFetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: workflow.body
    });
    if (!response.ok) throw await apiError(response, t("toast.validationFailed"));
    const result = await response.json();
    updateReadiness(result);
    if (openModal) showValidation(result);
    return result;
  } catch (error) {
    showToast(t("toast.validationFailed"), error.message);
    throw error;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function markRecentOutputAvailable() {
  const badge = $("#recentPackageCount");
  if (!badge) return;
  badge.textContent = "1";
  badge.hidden = false;
}

function filenameFromDisposition(disposition, fallback) {
  const encoded = String(disposition || "").match(/(?:^|;)\s*filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ""));
    } catch (_error) {
      // Fall through to the ASCII filename when RFC 5987 decoding fails.
    }
  }
  const plain = String(disposition || "").match(/(?:^|;)\s*filename\s*=\s*(?:"([^"]*)"|([^;]*))/i);
  return (plain?.[1] || plain?.[2] || "").trim() || fallback;
}

function setBusy(busy) {
  state.busy = busy;
  $$("#generateTop, #generateSide, #modalGenerate").forEach(button => {
    const unavailable = button.id === "modalGenerate"
      ? state.validation?.canGenerate === false || state.templates.size === 0 || mappingWarnings().length > 0
      : state.templates.size === 0;
    button.disabled = busy || unavailable;
  });
  $("#generateSide").classList.toggle("loading-shimmer", busy);
}

async function generatePackage() {
  if (state.busy) return;
  setBusy(true);
  try {
    if (!state.templates.size) throw new Error(t("toast.noTemplates"));
    const snapshot = createWorkflowSnapshot();
    const result = await runValidation(false, snapshot);
    const settings = snapshot.payload.settings;
    if (result.canGenerate === false || snapshot.payload.unconfirmedFields.length) {
      throw new Error(
        result.configIssues?.[0]
        || (snapshot.payload.unconfirmedFields.length ? t("toast.mappingIncomplete") : t("toast.noValid"))
      );
    }
    if (!result.valid && settings.stopOnMissing) throw new Error(t("toast.noValid"));
    if (!result.total) throw new Error(t("toast.noValid"));
    const response = await apiFetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: snapshot.body
    });
    if (!response.ok) throw await apiError(response, t("toast.generateFailed"));
    const generatedHeader = Number.parseInt(response.headers.get("X-DocFlow-Generated") || "", 10);
    const skippedHeader = Number.parseInt(response.headers.get("X-DocFlow-Skipped") || "", 10);
    const generatedCount = Number.isInteger(generatedHeader) && generatedHeader >= 0 ? generatedHeader : 0;
    const skippedCount = Number.isInteger(skippedHeader) && skippedHeader >= 0
      ? skippedHeader
      : Math.max(0, Number(result.total || 0) - generatedCount);
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const fallbackName = snapshot.payload.locale === "en" ? "DocFlow-Package" : "DocFlow-交付包";
    const filename = filenameFromDisposition(
      disposition,
      `${fallbackName}-${new Date().toISOString().slice(0, 10)}.zip`
    );
    if (window.docflowDesktop?.saveOutput) {
      const saved = await window.docflowDesktop.saveOutput(await blob.arrayBuffer(), filename);
      if (saved?.cancelled) {
        showToast(t("toast.saveCancelled"));
        return;
      }
    } else {
      downloadBlob(blob, filename);
    }
    markRecentOutputAvailable();
    $("#validationModal").hidden = true;
    showToast(t("toast.packageDone"), t("toast.packageDoneSummary", {
      generated: generatedCount,
      skipped: skippedCount
    }));
    $$(".workflow-step").forEach((step, index) => {
      if (index < 5) step.classList.add("complete");
    });
    $("#progressFill").style.width = "100%";
  } catch (error) {
    showToast(t("toast.notGenerated"), error.message);
  } finally {
    setBusy(false);
  }
}

async function importFile(file) {
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  showToast(t("toast.reading"), t("toast.localOnly", { name: file.name }));
  try {
    const response = await apiFetch("/api/import", { method: "POST", body: form });
    if (!response.ok) throw await apiError(response, t("toast.readFailed"));
    const payload = await response.json();
    state.filename = payload.filename;
    state.headers = payload.headers || [];
    state.rows = payload.rows || [];
    state.sourceRows = Array.isArray(payload.sourceRows)
      ? payload.sourceRows
      : state.rows.map((_row, index) => index + 2);
    for (const field of FIELD_CONFIG) {
      if (field.formula || field.condition) continue;
      const selected = state.mappings[field.template];
      if (selected !== IGNORE_MAPPING && !state.headers.includes(selected)) {
        state.mappings[field.template] = autoSourceFor(field.template);
      }
    }
    state.validation = null;
    updateMetrics();
    showToast(t("toast.dataLoaded"), t("toast.dataLoadedCopy", {
      rows: payload.count,
      fields: payload.headers.length
    }));
  } catch (error) {
    showToast(t("toast.importFailed"), error.message);
  } finally {
    $("#dataInput").value = "";
  }
}

async function inspectTemplate(file) {
  const form = new FormData();
  form.append("file", file);
  const response = await apiFetch("/api/template", { method: "POST", body: form });
  if (!response.ok) throw await apiError(response, t("toast.templateReadFailed"));
  const payload = await response.json();
  if (!payload.id) throw new Error(t("toast.templateReadFailed"));
  const template = {
    id: String(payload.id),
    filename: payload.filename || file.name,
    kind: String(payload.kind || "").toUpperCase(),
    fields: Array.isArray(payload.fields) ? payload.fields.map(field => String(field)) : [],
    fieldDetails: payload.fieldDetails || null,
    assets: payload.assets || [],
    fillable: Boolean(payload.fillable),
    message: payload.message || "",
    builtIn: false
  };
  state.templateCatalog.set(template.id, template);
  state.templates.add(template.id);
  for (const templateField of template.fields) {
    if (!Object.prototype.hasOwnProperty.call(state.mappings, templateField)) {
      state.mappings[templateField] = autoSourceFor(templateField);
    }
  }
  state.validation = null;
  renderTemplateCards();
  rebuildFieldConfig();
  renderMappingRows();
  updateReadiness(localValidate());
  showToast(
    t("toast.templateAdded"),
    template.fields.length
      ? t("toast.detected", { fields: template.fields.join(t("common.separator")) })
      : localizeEngineMessage(template.message) || t("toast.pdfAdded")
  );
}

async function inspectTemplates(files) {
  for (const file of files) {
    try {
      await inspectTemplate(file);
    } catch (error) {
      showToast(t("toast.templateImportFailed"), `${file.name}: ${error.message}`);
    }
  }
  $("#templateInput").value = "";
}

async function removeTemplate(templateId) {
  const template = state.templateCatalog.get(templateId);
  if (!template || template.builtIn) return;
  if (!window.confirm(t("templates.removeConfirm", { name: template.filename }))) return;
  try {
    const response = await apiFetch(`/api/template/${encodeURIComponent(templateId)}`, {
      method: "DELETE"
    });
    if (!response.ok) throw await apiError(response, t("toast.templateReadFailed"));
    state.templates.delete(templateId);
    state.templateCatalog.delete(templateId);
    state.validation = null;
    renderTemplateCards();
    rebuildFieldConfig();
    renderMappingRows();
    updateReadiness(localValidate());
    showToast(t("toast.templateRemoved"), template.filename);
  } catch (error) {
    showToast(t("toast.templateImportFailed"), error.message);
  }
}

function toggleTemplate(templateId) {
  if (!state.templateCatalog.has(templateId)) return;
  if (state.templates.has(templateId)) state.templates.delete(templateId);
  else state.templates.add(templateId);
  state.validation = null;
  renderTemplateCards();
  rebuildFieldConfig();
  renderMappingRows();
  updateReadiness(localValidate());
  updatePatternPreview();
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read image"));
    reader.readAsDataURL(file);
  });
}

function findAssetAliasConflict(files) {
  const owners = new Map();
  const candidates = [
    ...[...state.assetFiles.keys()].map((name, index) => ({ id: `saved-${index}`, name })),
    ...files.map((file, index) => ({ id: `incoming-${index}`, name: file.name }))
  ];
  for (const candidate of candidates) {
    for (const alias of assetAliases(candidate.name)) {
      const existing = owners.get(alias);
      if (existing && existing.id !== candidate.id) {
        return { alias, first: existing.name, second: candidate.name };
      }
      owners.set(alias, candidate);
    }
  }
  return null;
}

async function addAssetFiles(files) {
  const supportedTypes = new Set(["image/png", "image/jpeg"]);
  const accepted = [...files].filter(file => supportedTypes.has(file.type));
  if (!accepted.length) {
    showToast(t("toast.imageUnsupported"), t("toast.imageUnsupportedCopy"));
    $("#assetInput").value = "";
    return;
  }
  const conflict = findAssetAliasConflict(accepted);
  if (conflict) {
    showToast(t("toast.assetConflict"), t("toast.assetConflictCopy", conflict));
    $("#assetInput").value = "";
    return;
  }
  const projectedSizes = new Map(
    [...state.assetFiles.entries()].map(([filename, asset]) => [filename, asset.bytes])
  );
  accepted.forEach(file => projectedSizes.set(file.name, file.size));
  const projectedBytes = [...projectedSizes.values()].reduce((sum, bytes) => sum + bytes, 0);
  if (accepted.some(file => file.size > 4 * 1024 * 1024) || projectedBytes > 7 * 1024 * 1024) {
    showToast(t("toast.imageTooLarge"), t("toast.imageTooLargeCopy"));
    $("#assetInput").value = "";
    return;
  }
  try {
    for (const file of accepted) {
      const dataUrl = await readAsDataUrl(file);
      state.assetFiles.set(file.name, {
        baseName: basename(file.name),
        aliases: assetAliases(file.name),
        dataUrl,
        bytes: file.size
      });
    }
    renderAssetList();
    showToast(t("toast.assetsAdded"), t("toast.assetsAddedCopy", { count: accepted.length }));
  } catch (error) {
    showToast(t("toast.readFailed"), error.message);
  } finally {
    $("#assetInput").value = "";
  }
}

function removeAsset(filename) {
  state.assetFiles.delete(filename);
  renderAssetList();
}

async function openRecentOutput() {
  if (!window.docflowDesktop?.showRecentOutput) {
    showToast(t("toast.deliveryPackage"), t("toast.deliveryPackageCopy"));
    return;
  }
  try {
    const result = await window.docflowDesktop.showRecentOutput();
    if (!result?.shown) showToast(t("toast.deliveryPackage"), t("toast.noRecentOutput"));
  } catch (error) {
    showToast(t("toast.deliveryPackage"), error.message);
  }
}

function updateRuleTypeFields() {
  const conditional = $("#ruleType").value === "conditional";
  $("#ruleDigitsGroup").hidden = conditional;
  $("#ruleBranches").hidden = !conditional;
}

function updateRuleModalLabels() {
  $("#ruleModalTitle").textContent = t(state.editingRule ? "ruleEditor.editTitle" : "ruleEditor.addTitle");
}

function closeRuleEditor() {
  $("#ruleModal").hidden = true;
  $("#ruleError").hidden = true;
  state.editingRule = null;
}

function openRuleEditor(type = "computed", index = null) {
  const collection = type === "conditional" ? state.conditionalFields : state.computedFields;
  const rule = Number.isInteger(index) ? collection[index] : null;
  state.editingRule = rule ? { type, index } : null;
  $("#ruleType").value = rule ? type : type;
  $("#ruleType").disabled = Boolean(rule);
  $("#ruleName").value = rule?.name || "";
  $("#ruleExpression").value = rule?.expression || "";
  $("#ruleDigits").value = Number.isInteger(rule?.digits) ? rule.digits : 2;
  $("#ruleWhenTrue").value = rule?.whenTrue ?? "";
  $("#ruleWhenFalse").value = rule?.whenFalse ?? "";
  $("#ruleDelete").hidden = !rule;
  $("#ruleError").hidden = true;
  updateRuleTypeFields();
  updateRuleModalLabels();
  $("#ruleModal").hidden = false;
  setTimeout(() => $("#ruleName").focus(), 0);
}

function deleteEditingRule() {
  if (!state.editingRule) return;
  const { type, index } = state.editingRule;
  const collection = type === "conditional" ? state.conditionalFields : state.computedFields;
  collection.splice(index, 1);
  closeRuleEditor();
  state.validation = null;
  rebuildFieldConfig();
  renderRules();
  renderMappingRows();
  updateReadiness(localValidate());
  showToast(t("ruleEditor.deleted"));
}

function saveRule(event) {
  event.preventDefault();
  const type = $("#ruleType").value;
  const name = $("#ruleName").value.trim();
  const expression = $("#ruleExpression").value.trim();
  const errorElement = $("#ruleError");
  if (!name || !expression) {
    errorElement.textContent = t("ruleEditor.required");
    errorElement.hidden = false;
    return;
  }
  const duplicate = [
    ...state.computedFields.map((rule, index) => ({ name: rule.name, type: "computed", index })),
    ...state.conditionalFields.map((rule, index) => ({ name: rule.name, type: "conditional", index }))
  ].find(rule => (
    rule.name === name
    && (!state.editingRule || rule.type !== state.editingRule.type || rule.index !== state.editingRule.index)
  ));
  if (duplicate) {
    errorElement.textContent = t("ruleEditor.duplicate", { name });
    errorElement.hidden = false;
    return;
  }
  const rule = { name, expression };
  const existingRule = state.editingRule
    ? (type === "conditional" ? state.conditionalFields : state.computedFields)[state.editingRule.index]
    : null;
  if (existingRule?.scope) rule.scope = existingRule.scope;
  if (type === "computed") {
    const digits = Number($("#ruleDigits").value);
    if (Number.isInteger(digits) && digits >= 0 && digits <= 12) rule.digits = digits;
  } else {
    const whenTrue = $("#ruleWhenTrue").value;
    const whenFalse = $("#ruleWhenFalse").value;
    if (whenTrue !== "" || whenFalse !== "") {
      rule.whenTrue = whenTrue;
      rule.whenFalse = whenFalse;
    }
  }
  const collection = type === "conditional" ? state.conditionalFields : state.computedFields;
  if (state.editingRule) collection[state.editingRule.index] = rule;
  else collection.push(rule);
  closeRuleEditor();
  state.validation = null;
  rebuildFieldConfig();
  renderRules();
  renderMappingRows();
  updateReadiness(localValidate());
  showToast(t("ruleEditor.saved"), name);
}

function scrollToTarget(target) {
  const element = document.getElementById(target);
  if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
  $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.target === target));
}

function refreshPatternConfiguration() {
  state.validation = null;
  rebuildFieldConfig();
  renderMappingRows();
  updatePatternPreview();
  updateReadiness(localValidate());
}

function bindEvents() {
  $("#languageToggle").addEventListener("click", () => setLocale(state.locale === "zh-CN" ? "en" : "zh-CN"));
  $$(".nav-item[data-target], .workflow-step[data-target]").forEach(button => {
    button.addEventListener("click", () => scrollToTarget(button.dataset.target));
  });
  $("#replaceData").addEventListener("click", () => $("#dataInput").click());
  $("#dataInput").addEventListener("change", event => importFile(event.target.files[0]));
  $("#addTemplate").addEventListener("click", () => $("#templateInput").click());
  $("#templateInput").addEventListener("change", event => inspectTemplates(event.target.files));
  $("#templateList").addEventListener("click", event => {
    const card = event.target.closest(".template-card");
    if (!card) return;
    if (event.target.closest(".remove-template")) {
      removeTemplate(card.dataset.template);
      return;
    }
    toggleTemplate(card.dataset.template);
  });
  $("#templateList").addEventListener("keydown", event => {
    if (!["Enter", " "].includes(event.key) || event.target.closest(".remove-template")) return;
    const card = event.target.closest(".template-card");
    if (!card) return;
    event.preventDefault();
    toggleTemplate(card.dataset.template);
  });
  $("#signatureUpload").addEventListener("click", () => $("#signatureInput").click());
  $("#signatureInput").addEventListener("change", async event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024 || !["image/png", "image/jpeg"].includes(file.type)) {
      showToast(t("toast.imageTooLarge"), t("toast.imageTooLargeCopy"));
      $("#signatureInput").value = "";
      return;
    }
    try {
      state.signature = await readAsDataUrl(file);
      state.signatureName = file.name;
      state.validation = null;
      $("#signatureStatus").textContent = file.name;
      $("#signatureRemove").hidden = false;
      updateReadiness(localValidate());
      showToast(t("toast.signatureAdded"), t("toast.signatureAddedCopy"));
    } finally {
      $("#signatureInput").value = "";
    }
  });
  $("#signatureRemove").addEventListener("click", () => clearSignature(true));
  $("#assetUpload").addEventListener("click", () => $("#assetInput").click());
  $("#assetInput").addEventListener("change", event => addAssetFiles(event.target.files));
  $("#assetList").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-asset]");
    if (button) removeAsset(button.dataset.removeAsset);
  });
  $("#expandData").addEventListener("click", () => $("#dataSection").classList.toggle("expanded"));
  ["#validateTop", "#validateSide"].forEach(selector => {
    $(selector).addEventListener("click", () => runValidation(true).catch(() => {}));
  });
  ["#generateTop", "#generateSide", "#modalGenerate"].forEach(selector => {
    $(selector).addEventListener("click", generatePackage);
  });
  $$("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => { $("#validationModal").hidden = true; });
  });
  $("#validationModal").addEventListener("click", event => {
    if (event.target === $("#validationModal")) $("#validationModal").hidden = true;
  });
  ["#filenamePattern", "#folderPattern"].forEach(selector => {
    $(selector).addEventListener("input", refreshPatternConfiguration);
  });
  $$(".token-btn").forEach(button => button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.tokenTarget);
    target.textContent += "-{{客户简称}}";
    refreshPatternConfiguration();
    showToast(t("toast.fieldInserted"), t("toast.fieldInsertedCopy"));
  }));
  $("#resetSettings").addEventListener("click", () => {
    $("#filenamePattern").textContent = DEFAULT_FILENAME_PATTERNS[state.locale];
    $("#folderPattern").textContent = "{{客户简称}}/{{报价编号}}";
    $("#skipBlank").checked = true;
    $("#stopOnMissing").checked = true;
    $("#validationReport").checked = true;
    $("#includeSourceDocx").checked = false;
    $("#mergePdfs").checked = false;
    $("#flattenPdf").checked = true;
    clearSignature(false);
    refreshPatternConfiguration();
    showToast(t("toast.outputReset"), t("toast.outputResetCopy"));
  });
  $("#addRule").addEventListener("click", () => openRuleEditor("computed"));
  $("#ruleList").addEventListener("click", event => {
    const button = event.target.closest(".edit-rule");
    if (button) openRuleEditor(button.dataset.ruleType, Number(button.dataset.ruleIndex));
  });
  $("#ruleType").addEventListener("change", updateRuleTypeFields);
  $("#ruleForm").addEventListener("submit", saveRule);
  $("#ruleDelete").addEventListener("click", deleteEditingRule);
  $$("[data-close-rule-modal]").forEach(button => button.addEventListener("click", closeRuleEditor));
  $("#ruleModal").addEventListener("click", event => {
    if (event.target === $("#ruleModal")) closeRuleEditor();
  });
  ["skipBlank", "stopOnMissing", "validationReport", "includeSourceDocx", "mergePdfs", "flattenPdf"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => {
      state.validation = null;
      updateReadiness(localValidate());
      updatePatternPreview();
    });
  });
  $("#helpBtn").addEventListener("click", () => showToast(t("toast.quickStart"), t("toast.quickStartCopy")));
  $("#projectSwitch").addEventListener("click", () => showToast(t("toast.projectWorkspace"), t("toast.projectWorkspaceCopy")));
  $("#openRecent").addEventListener("click", openRecentOutput);
  $("#settingsBtn").addEventListener("click", () => showToast(t("toast.localEngine"), t("toast.localEngineCopy")));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      $("#validationModal").hidden = true;
      if (!$("#ruleModal").hidden) closeRuleEditor();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") generatePackage();
  });
}

async function initializeApp() {
  await loadSavedLocale();
  let sessionError = null;
  try {
    await loadSessionToken();
  } catch (error) {
    sessionError = error;
  }
  bindEvents();
  rebuildFieldConfig();
  applyLocale();
  if (sessionError) {
    $("#engineLabel").textContent = t("toast.sessionFailed");
    showToast(t("toast.sessionFailed"), sessionError.message);
  }
}

initializeApp().catch(error => {
  showToast(t("toast.sessionFailed"), error.message);
});
