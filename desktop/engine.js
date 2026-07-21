const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Busboy = require("busboy");
const ExcelJS = require("exceljs");
const AdmZip = require("adm-zip");
const QRCode = require("qrcode");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function sendJson(response, status, data) {
  const body = Buffer.from(JSON.stringify(data));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

function readJson(request, limit = 32 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("请求数据超过 32 MB 限制"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (_error) {
        reject(new Error("请求数据格式无效"));
      }
    });
    request.on("error", reject);
  });
}

function readUpload(request) {
  return new Promise((resolve, reject) => {
    const parser = Busboy({ headers: request.headers, limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
    let upload = null;
    parser.on("file", (_field, stream, info) => {
      const chunks = [];
      stream.on("data", chunk => chunks.push(chunk));
      stream.on("limit", () => reject(new Error("文件超过 25 MB 限制")));
      stream.on("end", () => {
        upload = { filename: info.filename || "upload", mimeType: info.mimeType, data: Buffer.concat(chunks) };
      });
    });
    parser.on("finish", () => upload ? resolve(upload) : reject(new Error("请选择文件")));
    parser.on("error", reject);
    request.pipe(parser);
  });
}

function decodeCsv(data) {
  for (const encoding of ["utf-8", "gb18030", "utf-16le"]) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(data).replace(/^\ufeff/, "");
    } catch (_error) {
      continue;
    }
  }
  return data.toString("utf8").replace(/^\ufeff/, "");
}

function parseCsv(data) {
  const text = decodeCsv(data);
  const matrix = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"' && value === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      matrix.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    matrix.push(row);
  }
  return matrix;
}

function excelCellValue(cell) {
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "result")) return value.result ?? "";
    if (Array.isArray(value.richText)) return value.richText.map(item => item.text).join("");
    if (Object.prototype.hasOwnProperty.call(value, "text")) return value.text ?? "";
  }
  return value;
}

async function parseTabular(filename, data) {
  const extension = path.extname(filename).toLowerCase();
  if (![".csv", ".xlsx", ".xlsm"].includes(extension)) throw new Error("仅支持 CSV、XLSX 或 XLSM 数据文件");
  let matrix;
  if (extension === ".csv") {
    matrix = parseCsv(data);
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return { headers: [], rows: [] };
    const width = worksheet.actualColumnCount || worksheet.columnCount;
    matrix = [];
    worksheet.eachRow({ includeEmpty: false }, excelRow => {
      matrix.push(Array.from({ length: width }, (_unused, index) => excelCellValue(excelRow.getCell(index + 1))));
    });
  }
  matrix = matrix.filter(row => row.some(cell => String(cell).trim()));
  if (!matrix.length) return { headers: [], rows: [] };
  const headers = matrix[0].map((value, index) => String(value).trim() || `字段_${index + 1}`);
  const rows = matrix.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  return { headers, rows };
}

function decodeXml(value) {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&apos;", "'");
}

function extractDocxFields(data) {
  const archive = new AdmZip(data);
  const fields = new Set();
  archive.getEntries().filter(entry => /^word\/.*\.xml$/.test(entry.entryName)).forEach(entry => {
    const visible = decodeXml(entry.getData().toString("utf8").replace(/<[^>]+>/g, ""));
    for (const match of visible.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) fields.add(match[1].trim());
  });
  return [...fields].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function numberValue(value) {
  if (typeof value === "number") return value;
  const normalized = String(value ?? "").replaceAll(",", "").replace(/[¥￥]/g, "").trim();
  if (normalized.endsWith("%")) return Number(normalized.slice(0, -1) || 0) / 100;
  const result = Number(normalized || 0);
  return Number.isFinite(result) ? result : 0;
}

function evaluateFormula(expression, row) {
  let normalized = String(expression);
  const fields = Object.keys(row).sort((a, b) => b.length - a.length);
  for (const field of fields) {
    normalized = normalized.replaceAll(field, String(numberValue(row[field])));
  }
  if (!/^[\d\s+*/%().,\-A-Za-z_]+$/.test(normalized)) throw new Error("公式包含不支持的字符");
  const identifiers = normalized.match(/[A-Za-z_]+/g) || [];
  if (identifiers.some(name => !["round", "min", "max", "abs"].includes(name))) throw new Error("公式函数不受支持");
  const round = (value, digits = 0) => {
    const scale = 10 ** Number(digits);
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
  };
  return Function("round", "min", "max", "abs", `"use strict"; return (${normalized});`)(round, Math.min, Math.max, Math.abs);
}

function applyRules(rows, computedFields = []) {
  return rows.map(source => {
    const row = { ...source };
    for (const field of computedFields) {
      if (!field.name || !field.expression) continue;
      try {
        row[field.name] = evaluateFormula(field.expression, row);
      } catch (_error) {
        row[field.name] = "";
      }
    }
    return row;
  });
}

function validateRows(rows, requiredFields = [], locale = "zh-CN") {
  const issues = [];
  const validIndexes = [];
  rows.forEach((row, index) => {
    const missing = requiredFields.filter(field => field && !String(row[field] ?? "").trim());
    if (missing.length) {
      const fallback = locale === "en" ? `Record ${index + 1}` : `第 ${index + 1} 条`;
      issues.push({ row: index + 2, record: String(row["客户简称"] || row["客户名称"] || fallback), missing });
    } else {
      validIndexes.push(index);
    }
  });
  return { total: rows.length, valid: validIndexes.length, invalid: issues.length, issues, validIndexes };
}

function safeComponent(value, fallback = "未命名") {
  const text = String(value ?? "").trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, "-").replace(/\s+/g, " ").replace(/^[ .]+|[ .]+$/g, "");
  return (text || fallback).slice(0, 96);
}

function renderPattern(pattern, row) {
  return String(pattern).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, key) => safeComponent(row[key.trim()], key.trim()));
}

function money(value, locale = "zh-CN") {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 }).format(numberValue(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function baseStyles() {
  return `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 210mm; min-height: 297mm; color: #14263a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { position: relative; background: white; }
  `;
}

async function quoteHtml(row, signature, locale = "zh-CN") {
  const L = locale === "en" ? {
    title: "Quotation", number: "Quote No.", date: "Date", preparedFor: "Prepared For", contactInfo: "Contact Information",
    contact: "Contact", email: "Email", item: "Item", description: "Description", quantity: "Qty", unitPrice: "Unit Price", amount: "Amount",
    subtotal: "Subtotal", discount: "Discount", tax: "Tax", total: "Total incl. tax", terms: "Terms & Notes",
    defaultItem: "Professional Services", defaultDescription: "Delivered within the scope confirmed by both parties.",
    defaultNote: "This quotation is valid for 30 days. Scope and payment terms are subject to mutual confirmation.",
    localNote: "Generated locally by DocFlow Local. No customer data was uploaded to the cloud.",
    customerApproval: "Customer Approval / Date", authorizedSignature: "Authorized Signature / Date", qr: "Scan to verify quote", page: "Page 1 of 1"
  } : {
    title: "报价单", number: "编号", date: "日期", preparedFor: "报价对象", contactInfo: "联系信息",
    contact: "联系人", email: "邮箱", item: "项目", description: "规格/说明", quantity: "数量", unitPrice: "单价", amount: "金额",
    subtotal: "小计", discount: "优惠", tax: "税额", total: "含税总额", terms: "条款与说明",
    defaultItem: "专业服务", defaultDescription: "按双方确认范围交付",
    defaultNote: "本报价有效期 30 天；交付范围与付款方式以双方确认内容为准。",
    localNote: "本文件由 DocFlow Local 在本机生成，数据未上传至云端。",
    customerApproval: "客户确认 / 日期", authorizedSignature: "授权签名 / 日期", qr: "扫码核验报价信息", page: "第 1 页 / 共 1 页"
  };
  const quantity = numberValue(row["数量"]);
  const unitPrice = numberValue(row["单价"]);
  const subtotal = numberValue(row["小计"] || quantity * unitPrice);
  const discount = numberValue(row["优惠"]);
  const taxRate = numberValue(row["税率"] || "13%");
  const tax = numberValue(row["税额"] || Math.max(subtotal - discount, 0) * taxRate);
  const total = numberValue(row["含税总额"] || Math.max(subtotal - discount, 0) + tax);
  const qrValue = String(row["二维码内容"] || `quote:${row["报价编号"] || ""}|customer:${row["客户简称"] || ""}|total:${total.toFixed(2)}`);
  const qrImage = await QRCode.toDataURL(qrValue, { margin: 1, width: 150, color: { dark: "#101820", light: "#ffffff" } });
  const signatureMarkup = signature && signature.startsWith("data:image/") ? `<img class="signature" src="${signature}">` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles()}
    .hero { height: 38mm; padding: 11mm 18mm; color: white; background: #12243a; display: flex; align-items: flex-start; }
    .mark { width: 16mm; height: 16mm; border-radius: 4mm; display: grid; place-items: center; background: #0b918b; font: 700 16px Arial; margin-right: 8mm; }
    h1 { margin: 0; font-size: 25px; font-weight: 700; letter-spacing: 1px; }
    .sub { margin-top: 2mm; color: #bac6d2; font-size: 9px; }
    .meta { margin-left: auto; font-size: 10px; line-height: 2; text-align: right; }
    .content { padding: 15mm 18mm 0; }
    .customer { height: 32mm; display: grid; grid-template-columns: 1.1fr 1fr; gap: 15mm; }
    .label { color: #788798; font-size: 9px; margin-bottom: 3mm; }
    .customer-name { font-size: 16px; font-weight: 700; }
    .contact { font-size: 10px; line-height: 1.9; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
    th { height: 10mm; padding: 0 4mm; color: white; background: #12243a; border-right: 1px solid #667588; text-align: left; font-weight: 500; }
    th:nth-last-child(-n+3), td:nth-last-child(-n+3) { text-align: right; }
    td { height: 20mm; padding: 0 4mm; background: #f5f7f9; border: 1px solid #d8e0e7; }
    .summary { width: 75mm; margin: 13mm 0 0 auto; font-size: 10px; }
    .sum-row { height: 7mm; display: flex; justify-content: space-between; align-items: center; }
    .sum-row span:first-child { color: #748497; }
    .total { height: 12mm; margin-top: 1mm; border-top: 1px solid #d7e0e6; color: #07948d; font-size: 16px; font-weight: 700; }
    .note { position: absolute; left: 18mm; right: 18mm; top: 184mm; height: 37mm; padding: 8mm; border-radius: 4mm; background: #ecf7f6; font-size: 9px; line-height: 2; color: #607389; }
    .note strong { display: block; margin-bottom: 3mm; color: #14263a; font-size: 10px; }
    .signatures { position: absolute; left: 18mm; right: 57mm; bottom: 35mm; display: flex; gap: 13mm; }
    .sign-line { position: relative; flex: 1; height: 18mm; border-bottom: 1px solid #8397ac; }
    .sign-line span { position: absolute; top: 20mm; color: #77889b; font-size: 8px; }
    .signature { position: absolute; right: 5mm; bottom: 2mm; width: 32mm; height: 16mm; object-fit: contain; }
    .qr { position: absolute; right: 18mm; bottom: 24mm; width: 25mm; text-align: center; color: #788899; font-size: 7px; }
    .qr img { width: 23mm; height: 23mm; display: block; margin: auto auto 2mm; }
    footer { position: absolute; left: 18mm; right: 18mm; bottom: 13mm; display: flex; justify-content: space-between; color: #95a3b1; font-size: 7px; }
  </style></head><body>
    <header class="hero"><div class="mark">DF</div><div><h1>${L.title}</h1><div class="sub">DOCFLOW LOCAL · QUOTATION</div></div><div class="meta">${L.number}&nbsp; ${escapeHtml(row["报价编号"] || "—")}<br>${L.date}&nbsp; ${escapeHtml(row["报价日期"] || new Date().toISOString().slice(0, 10))}</div></header>
    <main class="content"><section class="customer"><div><div class="label">${L.preparedFor}</div><div class="customer-name">${escapeHtml(row["客户名称"] || row["客户简称"] || "—")}</div></div><div><div class="label">${L.contactInfo}</div><div class="contact">${L.contact}: ${escapeHtml(row["联系人"] || "—")}<br>${L.email}: ${escapeHtml(row["邮箱"] || "—")}</div></div></section>
    <table><colgroup><col style="width:24%"><col style="width:37%"><col style="width:10%"><col style="width:14%"><col style="width:15%"></colgroup><thead><tr><th>${L.item}</th><th>${L.description}</th><th>${L.quantity}</th><th>${L.unitPrice}</th><th>${L.amount}</th></tr></thead><tbody><tr><td>${escapeHtml(row["产品名称"] || L.defaultItem)}</td><td>${escapeHtml(row["产品说明"] || L.defaultDescription)}</td><td>${escapeHtml(row["数量"] || 1)}</td><td>${money(unitPrice, locale)}</td><td>${money(subtotal, locale)}</td></tr></tbody></table>
    <div class="summary"><div class="sum-row"><span>${L.subtotal}</span><span>${money(subtotal, locale)}</span></div>${discount > 0 ? `<div class="sum-row"><span>${L.discount}</span><span>${money(-discount, locale)}</span></div>` : ""}<div class="sum-row"><span>${L.tax} (${Math.round(taxRate * 100)}%)</span><span>${money(tax, locale)}</span></div><div class="sum-row total"><span>${L.total}</span><span>${money(total, locale)}</span></div></div></main>
    <section class="note"><strong>${L.terms}</strong>${escapeHtml(row["备注"] || L.defaultNote)}<br>${L.localNote}</section>
    <section class="signatures"><div class="sign-line"><span>${L.customerApproval}</span></div><div class="sign-line">${signatureMarkup}<span>${L.authorizedSignature}</span></div></section>
    <div class="qr"><img src="${qrImage}">${L.qr}</div><footer><span>DOCFLOW LOCAL · PRIVATE BY DESIGN</span><span>${L.page}</span></footer>
  </body></html>`;
}

function attachmentHtml(row, locale = "zh-CN") {
  const L = locale === "en" ? {
    title: "Delivery Appendix · Project Details", scope: "Project Scope", customer: "Customer", description: "Description",
    schedule: "Delivery Schedule", owner: "Owner", notes: "Notes", checklist: "Delivery Checklist",
    checks: ["Required fields are complete", "Primary file opens correctly", "Appendix matches the customer number", "Package folders follow the naming rules"],
    defaultDescription: "Delivered according to the confirmed requirements.", defaultSchedule: "10 business days after confirmation",
    defaultOwner: "Project Delivery Team", defaultNotes: "Milestones will be confirmed at project kickoff.", generated: "Generated locally by DocFlow Local", appendix: "Appendix 1"
  } : {
    title: "交付附件 · 项目明细", scope: "项目范围", customer: "客户", description: "项目说明",
    schedule: "交付周期", owner: "负责人", notes: "备注", checklist: "交付检查",
    checks: ["资料字段完整", "主文件可正常打开", "附件与客户编号一致", "交付包目录符合命名规则"],
    defaultDescription: "按确认的需求清单执行。", defaultSchedule: "合同确认后 10 个工作日",
    defaultOwner: "项目交付组", defaultNotes: "具体里程碑以项目启动会确认为准。", generated: "由 DocFlow Local 在本机生成", appendix: "附件 1"
  };
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseStyles()}
    header { height: 26mm; padding: 8mm 18mm; color: white; background: #12243a; display: flex; justify-content: space-between; font-size: 10px; }
    header strong { font-size: 19px; }
    main { padding: 12mm 18mm; }
    h1 { margin: 0; padding-left: 6mm; border-left: 2.2mm solid #0b918b; font-size: 16px; }
    .details { margin: 12mm 0 0 7mm; color: #627286; font-size: 11px; line-height: 3; }
    .check { position: absolute; left: 18mm; right: 18mm; bottom: 38mm; height: 43mm; padding: 8mm; border: 1px solid #d8e0e7; border-radius: 4mm; }
    .check strong { display: block; margin-bottom: 4mm; font-size: 10px; }
    .item { display: inline-flex; width: 49%; align-items: center; gap: 3mm; color: #34475b; font-size: 10px; line-height: 2.4; }
    .box { width: 3.5mm; height: 3.5mm; border: 1px solid #b8c6d2; }
    footer { position: absolute; left: 18mm; right: 18mm; bottom: 15mm; display: flex; justify-content: space-between; color: #95a3b1; font-size: 7px; }
  </style></head><body><header><strong>${L.title}</strong><span>${escapeHtml(row["报价编号"] || "—")}</span></header><main><h1>${escapeHtml(row["产品名称"] || L.scope)}</h1><div class="details">${L.customer}: ${escapeHtml(row["客户名称"] || row["客户简称"] || "—")}<br>${L.description}: ${escapeHtml(row["产品说明"] || L.defaultDescription)}<br>${L.schedule}: ${escapeHtml(row["交付周期"] || L.defaultSchedule)}<br>${L.owner}: ${escapeHtml(row["负责人"] || L.defaultOwner)}<br>${L.notes}: ${escapeHtml(row["备注"] || L.defaultNotes)}</div></main><section class="check"><strong>${L.checklist}</strong>${L.checks.map(check => `<div class="item"><i class="box"></i>${check}</div>`).join("")}</section><footer><span>${L.generated}</span><span>${L.appendix}</span></footer></body></html>`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function generateBundle(payload, renderPdf) {
  const locale = payload.locale === "en" ? "en" : "zh-CN";
  const rows = applyRules(payload.rows || [], payload.computedFields || []);
  const validation = validateRows(rows, payload.requiredFields || [], locale);
  const settings = payload.settings || {};
  const filenamePattern = settings.filenamePattern || (locale === "en" ? "{{客户简称}}-Quotation-{{报价编号}}" : "{{客户简称}}-报价单-{{报价编号}}");
  const folderPattern = settings.folderPattern || "{{客户简称}}/{{报价编号}}";
  const templates = payload.templates?.length ? payload.templates : ["quote", "attachment"];
  const archive = new AdmZip();
  const generated = [];
  const usedPaths = new Set();

  function uniquePath(candidate) {
    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate);
      return candidate;
    }
    const extension = path.posix.extname(candidate);
    const base = candidate.slice(0, -extension.length);
    let index = 2;
    while (usedPaths.has(`${base}-${index}${extension}`)) index += 1;
    const result = `${base}-${index}${extension}`;
    usedPaths.add(result);
    return result;
  }

  for (const index of validation.validIndexes) {
    const row = rows[index];
    const folder = renderPattern(folderPattern, row).split("/").filter(Boolean).map(part => safeComponent(part)).join("/");
    const base = safeComponent(renderPattern(filenamePattern, row));
    const recordFiles = [];
    if (templates.includes("quote")) {
      const pdf = await renderPdf(await quoteHtml(row, settings.signature || "", locale));
      const filename = uniquePath(`${folder}/${base}.pdf`);
      archive.addFile(filename, pdf);
      recordFiles.push(filename);
    }
    if (templates.includes("attachment")) {
      const pdf = await renderPdf(attachmentHtml(row, locale));
      const filename = uniquePath(`${folder}/${base}-${locale === "en" ? "project-appendix" : "项目附件"}.pdf`);
      archive.addFile(filename, pdf);
      recordFiles.push(filename);
    }
    generated.push({ record: row["客户简称"] || row["客户名称"], files: recordFiles });
  }

  const reportRows = [locale === "en" ? ["Source Row", "Record", "Missing Fields"] : ["数据行", "记录", "缺失字段"], ...validation.issues.map(issue => [issue.row, issue.record, issue.missing.join(locale === "en" ? ", " : "、")])];
  archive.addFile(locale === "en" ? "validation-report.csv" : "校验报告.csv", Buffer.from(`\ufeff${reportRows.map(row => row.map(csvCell).join(",")).join("\r\n")}`, "utf8"));
  const manifest = {
    product: "DocFlow Local Desktop",
    version: "0.3.1",
    locale,
    generatedAt: new Date().toISOString(),
    privacy: "All processing completed locally.",
    summary: { records: generated.length, files: generated.reduce((sum, item) => sum + item.files.length, 0), skipped: validation.invalid },
    items: generated
  };
  archive.addFile(locale === "en" ? "delivery-manifest.json" : "交付清单.json", Buffer.from(JSON.stringify(manifest, null, 2)));
  return { buffer: archive.toBuffer(), validation, generated };
}

function serveStatic(response, staticDir, requestPath) {
  const relative = requestPath === "/" ? "index.html" : decodeURIComponent(requestPath.slice(1));
  const resolved = path.resolve(staticDir, relative);
  if (!resolved.startsWith(path.resolve(staticDir) + path.sep) && resolved !== path.resolve(staticDir, "index.html")) {
    sendJson(response, 403, { error: "拒绝访问" });
    return;
  }
  fs.readFile(resolved, (error, data) => {
    if (error) {
      sendJson(response, 404, { error: "未找到" });
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(resolved)] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-cache",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });
    response.end(data);
  });
}

async function createLocalEngine({ staticDir, renderPdf }) {
  const token = crypto.randomBytes(24).toString("hex");
  let origin = "";
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin || "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, mode: "desktop", version: "0.3.1", runtime: "electron" });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/import") {
        const upload = await readUpload(request);
        const result = await parseTabular(upload.filename, upload.data);
        sendJson(response, 200, { filename: upload.filename, ...result, count: result.rows.length });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/template") {
        const upload = await readUpload(request);
        const extension = path.extname(upload.filename).toLowerCase();
        const fields = extension === ".docx" ? extractDocxFields(upload.data) : [];
        sendJson(response, 200, { filename: upload.filename, kind: extension.slice(1).toUpperCase(), fields, message: extension === ".docx" ? "已识别 DOCX 占位符" : "PDF 模板已加入；坐标映射将在模板编辑器中配置" });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/validate") {
        const payload = await readJson(request);
        const rows = applyRules(payload.rows || [], payload.computedFields || []);
        sendJson(response, 200, { ...validateRows(rows, payload.requiredFields || [], payload.locale === "en" ? "en" : "zh-CN"), rows });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/generate") {
        const payload = await readJson(request);
        const result = await generateBundle(payload, renderPdf);
        const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
        const filename = `${payload.locale === "en" ? "DocFlow-Package" : "DocFlow-交付包"}-${stamp}.zip`;
        response.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Length": result.buffer.length,
          "Content-Disposition": `attachment; filename="DocFlow-package-${stamp}.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "X-DocFlow-Generated": String(result.generated.length),
          "X-DocFlow-Skipped": String(result.validation.invalid),
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        });
        response.end(result.buffer);
        return;
      }
      if (request.method !== "GET") {
        sendJson(response, 405, { error: "方法不受支持" });
        return;
      }
      serveStatic(response, staticDir, url.pathname);
    } catch (error) {
      console.error("Local engine error:", error);
      if (!response.headersSent) sendJson(response, 400, { error: error.message || "本地处理失败" });
      else response.end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    token,
    close: () => server.close()
  };
}

module.exports = {
  createLocalEngine,
  parseTabular,
  extractDocxFields,
  applyRules,
  validateRows,
  generateBundle
};
