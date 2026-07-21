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
    // localStorage may be unavailable in locked-down browser contexts.
  }
  return String(navigator.language || "").toLowerCase().startsWith("zh") ? "zh-CN" : "en";
})();
const DEFAULT_FILENAME_PATTERNS = {
  "zh-CN": "{{客户简称}}-报价单-{{报价编号}}",
  en: "{{客户简称}}-Quotation-{{报价编号}}"
};

const DEFAULT_HEADERS = Object.keys(SAMPLE_ROWS[0]);
const FIELD_CONFIG = [
  { template: "客户简称", source: "客户简称", required: true },
  { template: "客户名称", source: "客户名称", required: true },
  { template: "报价编号", source: "报价编号", required: true },
  { template: "报价日期", source: "报价日期", required: true },
  { template: "联系人", source: "联系人", required: true },
  { template: "联系邮箱", source: "邮箱", required: true },
  { template: "产品名称", source: "产品名称", required: true },
  { template: "数量", source: "数量", required: true },
  { template: "单价", source: "单价", required: true },
  { template: "含税总额", formula: "round((数量 * 单价 - 优惠) * (1 + 税率), 2)", required: false }
];

const state = {
  filename: "客户报价清单_Q3.csv",
  headers: [...DEFAULT_HEADERS],
  rows: [...SAMPLE_ROWS],
  templates: new Set(["quote", "attachment"]),
  mappings: Object.fromEntries(FIELD_CONFIG.filter(f => f.source).map(f => [f.template, f.source])),
  validation: null,
  busy: false,
  signature: "",
  signatureName: "",
  locale: DEFAULT_LOCALE
};

const computedFields = [
  { name: "小计", expression: "数量 * 单价" },
  { name: "税额", expression: "(数量 * 单价 - 优惠) * 税率" },
  { name: "含税总额", expression: "round((数量 * 单价 - 优惠) * (1 + 税率), 2)" }
];

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function t(key, variables = {}) {
  const template = I18N[state.locale]?.[key] ?? I18N["zh-CN"]?.[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(variables, name) ? String(variables[name]) : match
  ));
}

async function loadSavedLocale() {
  if (!window.docflowDesktop?.getLocale) return;
  try {
    const saved = await window.docflowDesktop.getLocale();
    if (SUPPORTED_LOCALES.includes(saved)) state.locale = saved;
  } catch (_error) {
    // Browser storage remains the fallback if desktop preferences cannot be read.
  }
}

function setGenerateLabel(count) {
  $("#generateSideLabel").innerHTML = t("readiness.generate", { count: `<b id="generateCount">${Number(count) || 0}</b>` });
}

function applyLocale(previousLocale = state.locale) {
  document.documentElement.lang = state.locale;
  document.title = t("app.title");
  $$('[data-i18n]').forEach(element => {
    if (element.id === "signatureStatus" && state.signatureName) {
      element.textContent = state.signatureName;
      return;
    }
    element.textContent = t(element.dataset.i18n);
  });
  $$('[data-i18n-aria]').forEach(element => {
    element.setAttribute("aria-label", t(element.dataset.i18nAria));
  });
  $$('[data-placeholder-count]').forEach(element => {
    element.textContent = t("toast.placeholders", { count: element.dataset.placeholderCount });
  });

  const pattern = $("#filenamePattern");
  if (pattern && Object.values(DEFAULT_FILENAME_PATTERNS).includes(pattern.textContent.trim())) {
    pattern.textContent = DEFAULT_FILENAME_PATTERNS[state.locale];
  }

  const languageToggle = $("#languageToggle");
  $("#languageToggleLabel").textContent = state.locale === "zh-CN" ? "EN" : "中";
  languageToggle.title = t("language.switch");
  languageToggle.setAttribute("aria-label", t("language.switch"));
  $("#engineLabel").textContent = window.docflowDesktop?.isDesktop
    ? t("engine.desktop", { version: window.docflowDesktop.versions.electron })
    : t("engine.local");

  renderMappingRows();
  renderPreviewTable();
  updateReadiness(state.validation || localValidate());
  updatePatternPreview();
  if (!$("#validationModal").hidden && state.validation) showValidation(state.validation);
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
    try { await window.docflowDesktop.setLocale(locale); } catch (_error) { /* non-blocking */ }
  }
  applyLocale(previousLocale);
}

function numberValue(value) {
  if (typeof value === "number") return value;
  const normalized = String(value ?? "").replaceAll(",", "").replace(/[¥￥]/g, "").trim();
  if (normalized.endsWith("%")) return Number(normalized.slice(0, -1) || 0) / 100;
  return Number(normalized || 0);
}

function money(value) {
  return new Intl.NumberFormat(state.locale === "en" ? "en-US" : "zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 }).format(numberValue(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}

function firstRowPreview(field) {
  const row = state.rows[0] || {};
  if (field.formula) {
    const subtotal = numberValue(row["数量"]) * numberValue(row["单价"]);
    const total = (subtotal - numberValue(row["优惠"])) * (1 + numberValue(row["税率"]));
    return money(total);
  }
  const source = state.mappings[field.template];
  const value = row[source] ?? "—";
  if (["单价", "含税总额"].includes(field.template)) return money(value);
  return value;
}

function renderMappingRows() {
  const container = $("#mappingRows");
  container.innerHTML = FIELD_CONFIG.map(field => {
    const options = [`<option value=''>${escapeHtml(t("mapping.unmapped"))}</option>`, ...state.headers.map(header => `<option value="${escapeHtml(header)}" ${state.mappings[field.template] === header ? "selected" : ""}>${escapeHtml(header)}</option>`)].join("");
    const isWarning = !field.formula && (!state.mappings[field.template] || field.warning);
    return `<div class="mapping-row" data-field="${escapeHtml(field.template)}">
      <div class="mapping-key"><code>{{${escapeHtml(field.template)}}}</code>${field.required ? '<span class="required-star">*</span>' : ""}</div>
      ${field.formula ? `<div class="formula-value">∑ ${escapeHtml(field.formula)}</div>` : `<select class="mapping-select" aria-label="${escapeHtml(field.template + t("mapping.sourceAria"))}">${options}</select>`}
      <div class="value-preview">${escapeHtml(firstRowPreview(field))}</div>
      <div><span class="map-status ${isWarning ? "warning" : ""}"><i>${isWarning ? "!" : "✓"}</i>${isWarning ? t("mapping.confirm") : t("mapping.ready")}</span></div>
    </div>`;
  }).join("");
  container.querySelectorAll("select").forEach(select => select.addEventListener("change", event => {
    const template = event.target.closest(".mapping-row").dataset.field;
    state.mappings[template] = event.target.value;
    const config = FIELD_CONFIG.find(item => item.template === template);
    if (config) config.warning = !event.target.value;
    renderMappingRows();
    updateReadiness();
  }));
  const warnings = FIELD_CONFIG.filter(field => !field.formula && (!state.mappings[field.template] || field.warning)).length;
  $("#mappedCount").textContent = FIELD_CONFIG.length - warnings;
  $("#warnCount").textContent = warnings;
}

function currentRequiredFields() {
  return [...new Set(FIELD_CONFIG.filter(field => field.required && !field.formula).map(field => state.mappings[field.template]).filter(Boolean))];
}

function renderPreviewTable() {
  const shownHeaders = state.headers.slice(0, 7);
  $("#tablePreview").innerHTML = `<table class="preview-table"><thead><tr>${shownHeaders.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${state.rows.slice(0, 8).map(row => `<tr>${shownHeaders.map(header => `<td class="${String(row[header] ?? "").trim() ? "" : "missing"}">${escapeHtml(row[header] || t("common.missing"))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function localValidate() {
  const issues = [];
  state.rows.forEach((row, index) => {
    const missing = currentRequiredFields().filter(field => !String(row[field] ?? "").trim());
    if (missing.length) issues.push({ row: index + 2, record: row["客户简称"] || row["客户名称"] || (state.locale === "en" ? `Record ${index + 1}` : `第 ${index + 1} 条`), missing });
  });
  return { total: state.rows.length, valid: state.rows.length - issues.length, invalid: issues.length, issues };
}

function updateReadiness(validation = localValidate()) {
  state.validation = validation;
  const mappingWarnings = FIELD_CONFIG.filter(field => !field.formula && (!state.mappings[field.template] || field.warning)).length;
  const templateCount = state.templates.size;
  let score = 100 - Math.min(validation.invalid * 6, 18) - Math.min(mappingWarnings * 6, 18) - (templateCount ? 0 : 25);
  score = Math.max(score, 30);
  $("#scoreValue").textContent = score;
  $("#scoreCircle").style.strokeDashoffset = String(113 - 113 * score / 100);
  const totalIssues = validation.invalid + mappingWarnings;
  $("#readinessTitle").textContent = totalIssues ? t("readiness.issues", { count: totalIssues }) : t("readiness.ready");
  $("#readinessList").innerHTML = `
    <li class="done">${t("readiness.dataLoaded")} <span>✓</span></li>
    <li class="${templateCount ? "done" : "attention"}">${t("readiness.templates", { count: templateCount })} <span>${templateCount ? "✓" : "!"}</span></li>
    <li class="${validation.invalid ? "attention" : "done"}">${validation.invalid ? t("readiness.recordsMissing", { count: validation.invalid }) : t("readiness.allComplete")} <span>${validation.invalid ? "!" : "✓"}</span></li>
    <li class="${mappingWarnings ? "attention" : "done"}">${mappingWarnings ? t("readiness.mappingsNeed", { count: mappingWarnings }) : t("readiness.mappingsComplete")} <span>${mappingWarnings ? "!" : "✓"}</span></li>`;
  $("#metricMissing").textContent = validation.issues.reduce((sum, issue) => sum + issue.missing.length, 0);
  setGenerateLabel(validation.valid);
}

function updateMetrics() {
  $("#dataFilename").textContent = state.filename;
  $("#metricRows").textContent = state.rows.length;
  $("#metricFields").textContent = state.headers.length;
  $("#navRowCount").textContent = state.rows.length;
  setGenerateLabel(state.rows.length);
  renderPreviewTable();
  renderMappingRows();
  updateReadiness();
  updatePatternPreview();
}

function renderPattern(pattern, row = state.rows[0] || {}) {
  return pattern.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key) => row[key.trim()] || key.trim());
}

function updatePatternPreview() {
  const row = state.rows[0] || {};
  $("#filenamePreview").textContent = `${renderPattern($("#filenamePattern").textContent.trim(), row)}.pdf`;
  const folders = renderPattern($("#folderPattern").textContent.trim(), row).split("/");
  $("#folderCustomer").textContent = folders[0] || t("common.customer");
  $("#folderQuote").textContent = folders[1] || t("common.number");
}

function showToast(title, copy = "") {
  $("#toastTitle").textContent = title;
  $("#toastCopy").textContent = copy;
  $("#toast").classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => $("#toast").classList.remove("show"), 3300);
}

function showValidation(result = localValidate()) {
  state.validation = result;
  const ok = result.invalid === 0;
  $("#modalIcon").textContent = ok ? "✓" : "!";
  $("#modalIcon").style.color = ok ? "var(--teal)" : "";
  $("#modalIcon").style.background = ok ? "var(--teal-pale)" : "";
  $("#modalTitle").textContent = ok ? t("modal.allPassed", { count: result.total }) : t("modal.found", { count: result.invalid });
  $("#modalCopy").textContent = ok ? t("modal.allReady") : t("modal.validContinue", { count: result.valid });
  $("#issueList").innerHTML = ok ? `<div class="no-issues">${t("modal.noMissing")}</div>` : result.issues.map(issue => `<div class="issue-item"><span>${t("modal.row", { count: issue.row })}</span><div><strong>${escapeHtml(issue.record)}</strong><p>${t("modal.missingFields", { count: issue.missing.length })}</p></div><em>${escapeHtml(issue.missing.join(t("common.separator")))}</em></div>`).join("");
  $("#modalGenerate").textContent = ok ? t("modal.generateGroups", { count: result.valid }) : t("modal.generateValid", { count: result.valid });
  $("#validationModal").hidden = false;
}

async function runValidation(openModal = true) {
  let result;
  try {
    const response = await fetch("/api/validate", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({ locale: state.locale, rows: state.rows, requiredFields: currentRequiredFields(), computedFields }) });
    if (!response.ok) throw new Error("local fallback");
    result = await response.json();
  } catch (_) {
    result = localValidate();
  }
  updateReadiness(result);
  if (openModal) showValidation(result);
  return result;
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

async function generatePackage() {
  if (state.busy) return;
  state.busy = true;
  $$("#generateTop, #generateSide, #modalGenerate").forEach(button => { button.disabled = true; });
  $("#generateSide").classList.add("loading-shimmer");
  try {
    const result = await runValidation(false);
    if (!result.valid) throw new Error(t("toast.noValid"));
    const payload = {
      locale: state.locale,
      rows: state.rows,
      requiredFields: currentRequiredFields(),
      computedFields,
      templates: [...state.templates],
      settings: {
        filenamePattern: $("#filenamePattern").textContent.trim(),
        folderPattern: $("#folderPattern").textContent.trim(),
        signature: state.signature
      }
    };
    const response = await fetch("/api/generate", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({error: t("toast.generateFailed")}));
      throw new Error(state.locale === "en" ? t("toast.generateFailed") : (error.error || t("toast.generateFailed")));
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
    const fallbackName = state.locale === "en" ? "DocFlow-Package" : "DocFlow-交付包";
    const filename = match ? decodeURIComponent(match[1].replaceAll('"', "")) : `${fallbackName}-${new Date().toISOString().slice(0,10)}.zip`;
    downloadBlob(blob, filename);
    $("#validationModal").hidden = true;
    showToast(t("toast.packageDone"), t("toast.packageDoneCopy", { count: result.valid }));
    $$(".workflow-step").forEach((step, index) => { if (index < 5) step.classList.add("complete"); });
    $("#progressFill").style.width = "100%";
  } catch (error) {
    showToast(t("toast.notGenerated"), error.message);
  } finally {
    state.busy = false;
    $$("#generateTop, #generateSide, #modalGenerate").forEach(button => { button.disabled = false; });
    $("#generateSide").classList.remove("loading-shimmer");
  }
}

async function importFile(file) {
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  showToast(t("toast.reading"), t("toast.localOnly", { name: file.name }));
  try {
    const response = await fetch("/api/import", { method: "POST", body: form });
    const payload = await response.json();
    if (!response.ok) throw new Error(state.locale === "en" ? t("toast.readFailed") : (payload.error || t("toast.readFailed")));
    state.filename = payload.filename;
    state.headers = payload.headers;
    state.rows = payload.rows;
    FIELD_CONFIG.forEach(field => {
      if (!field.formula && state.headers.includes(field.template)) state.mappings[field.template] = field.template;
    });
    updateMetrics();
    showToast(t("toast.dataLoaded"), t("toast.dataLoadedCopy", { rows: payload.count, fields: payload.headers.length }));
  } catch (error) {
    showToast(t("toast.importFailed"), error.message);
  } finally {
    $("#dataInput").value = "";
  }
}

async function inspectTemplate(file) {
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  try {
    const response = await fetch("/api/template", { method: "POST", body: form });
    const payload = await response.json();
    if (!response.ok) throw new Error(state.locale === "en" ? t("toast.templateReadFailed") : (payload.error || t("toast.templateReadFailed")));
    const key = `custom-${Date.now()}`;
    const article = document.createElement("article");
    article.className = "template-card selected";
    article.dataset.template = key;
    article.innerHTML = `<div class="file-thumb ${payload.kind === "PDF" ? "pdf" : "word"}"><span>${payload.kind === "PDF" ? "P" : "W"}</span><b data-i18n="toast.template">${t("toast.template")}</b><small>${escapeHtml(payload.kind)}</small></div><div class="template-info"><div><strong>${escapeHtml(payload.filename)}</strong><span class="tag grey" data-i18n="toast.custom">${t("toast.custom")}</span></div><p><span data-placeholder-count="${payload.fields.length}">${t("toast.placeholders", { count: payload.fields.length })}</span><span data-i18n="toast.localParsed">${t("toast.localParsed")}</span></p></div><button class="more-btn" aria-label="${t("actions.more")}" data-i18n-aria="actions.more">•••</button><span class="selected-check">✓</span>`;
    $("#templateList").appendChild(article);
    state.templates.add(key);
    payload.fields.forEach(templateField => {
      if (FIELD_CONFIG.some(field => field.template === templateField)) return;
      const exact = state.headers.find(header => header === templateField);
      const fuzzy = state.headers.find(header => header.includes(templateField) || templateField.includes(header));
      const source = exact || fuzzy || "";
      FIELD_CONFIG.push({ template: templateField, source, required: false });
      if (source) state.mappings[templateField] = source;
    });
    attachTemplateToggle(article);
    renderMappingRows();
    updateReadiness();
    showToast(t("toast.templateAdded"), payload.fields.length ? t("toast.detected", { fields: payload.fields.join(t("common.separator")) }) : t("toast.pdfAdded"));
  } catch (error) {
    showToast(t("toast.templateImportFailed"), error.message);
  } finally {
    $("#templateInput").value = "";
  }
}

function attachTemplateToggle(card) {
  card.addEventListener("click", event => {
    if (event.target.closest(".more-btn")) return;
    const template = card.dataset.template;
    card.classList.toggle("selected");
    card.classList.contains("selected") ? state.templates.add(template) : state.templates.delete(template);
    updateReadiness();
  });
}

function scrollToTarget(target) {
  const element = document.getElementById(target);
  if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
  $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.target === target));
}

function bindEvents() {
  $("#languageToggle").addEventListener("click", () => setLocale(state.locale === "zh-CN" ? "en" : "zh-CN"));
  $$(".nav-item[data-target], .workflow-step[data-target]").forEach(button => button.addEventListener("click", () => scrollToTarget(button.dataset.target)));
  $("#replaceData").addEventListener("click", () => $("#dataInput").click());
  $("#dataInput").addEventListener("change", event => importFile(event.target.files[0]));
  $("#addTemplate").addEventListener("click", () => $("#templateInput").click());
  $("#templateInput").addEventListener("change", event => inspectTemplate(event.target.files[0]));
  $("#signatureUpload").addEventListener("click", () => $("#signatureInput").click());
  $("#signatureInput").addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return showToast(t("toast.imageTooLarge"), t("toast.imageTooLargeCopy"));
    const reader = new FileReader();
    reader.onload = () => {
      state.signature = reader.result;
      state.signatureName = file.name;
      $("#signatureStatus").textContent = file.name;
      showToast(t("toast.signatureAdded"), t("toast.signatureAddedCopy"));
    };
    reader.readAsDataURL(file);
  });
  $$(".template-card").forEach(attachTemplateToggle);
  $("#expandData").addEventListener("click", () => $("#dataSection").classList.toggle("expanded"));
  ["#validateTop", "#validateSide"].forEach(selector => $(selector).addEventListener("click", () => runValidation(true)));
  ["#generateTop", "#generateSide", "#modalGenerate"].forEach(selector => $(selector).addEventListener("click", generatePackage));
  $$('[data-close-modal]').forEach(button => button.addEventListener("click", () => $("#validationModal").hidden = true));
  $("#validationModal").addEventListener("click", event => { if (event.target === $("#validationModal")) $("#validationModal").hidden = true; });
  ["#filenamePattern", "#folderPattern"].forEach(selector => $(selector).addEventListener("input", updatePatternPreview));
  $$(".token-btn").forEach(button => button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.tokenTarget);
    target.textContent += "-{{客户简称}}";
    updatePatternPreview();
    showToast(t("toast.fieldInserted"), t("toast.fieldInsertedCopy"));
  }));
  $("#resetSettings").addEventListener("click", () => {
    $("#filenamePattern").textContent = DEFAULT_FILENAME_PATTERNS[state.locale];
    $("#folderPattern").textContent = "{{客户简称}}/{{报价编号}}";
    updatePatternPreview();
    showToast(t("toast.outputReset"), t("toast.outputResetCopy"));
  });
  $("#addRule").addEventListener("click", () => showToast(t("toast.ruleEditor"), t("toast.ruleEditorCopy")));
  $$(".edit-rule").forEach(button => button.addEventListener("click", () => showToast(t("toast.ruleEnabled"), t("toast.ruleEnabledCopy"))));
  $("#helpBtn").addEventListener("click", () => showToast(t("toast.quickStart"), t("toast.quickStartCopy")));
  $("#projectSwitch").addEventListener("click", () => showToast(t("toast.projectWorkspace"), t("toast.projectWorkspaceCopy")));
  $("#openRecent").addEventListener("click", () => showToast(t("toast.deliveryPackage"), t("toast.deliveryPackageCopy")));
  $("#settingsBtn").addEventListener("click", () => showToast(t("toast.localEngine"), t("toast.localEngineCopy")));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") $("#validationModal").hidden = true;
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") generatePackage();
  });
}

async function initializeApp() {
  bindEvents();
  await loadSavedLocale();
  applyLocale();
}

initializeApp();
