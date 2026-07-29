const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Busboy = require("busboy");
const ExcelJS = require("exceljs");
const AdmZip = require("adm-zip");
const QRCode = require("qrcode");
const SSF = require("ssf");
const { PDFDocument } = require("pdf-lib");
const { parseTabular: parseCoreTabular } = require("@docflow-local/core/data");
const { applyRulesDetailed, evaluateExpression } = require("@docflow-local/core/expression");
const {
  extractDocxTemplateInfo,
  fillPdfTemplate,
  inspectPdfTemplate,
  mergePdfBuffers,
  renderDocxTemplate,
  validateImageData
} = require("@docflow-local/core/template-engine");

const APP_VERSION = require("../package.json").version;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_TEMPLATE_BYTES = 100 * 1024 * 1024;
const MAX_TEMPLATES = 24;
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 500;
const MAX_GENERATED_FILES = 2_000;
const MAX_RENDERED_DOCUMENTS = 1_000;
const MAX_DELIVERY_BYTES = 256 * 1024 * 1024;

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
    const parser = Busboy({ headers: request.headers, limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 4 } });
    let upload = null;
    let rejected = false;
    parser.on("file", (_field, stream, info) => {
      const chunks = [];
      stream.on("data", chunk => chunks.push(chunk));
      stream.on("limit", () => {
        rejected = true;
        reject(new Error("文件超过 25 MB 限制"));
      });
      stream.on("end", () => {
        if (!rejected) upload = { filename: path.basename(info.filename || "upload"), mimeType: info.mimeType, data: Buffer.concat(chunks) };
      });
    });
    parser.on("finish", () => {
      if (!rejected) upload ? resolve(upload) : reject(new Error("请选择文件"));
    });
    parser.on("error", reject);
    request.pipe(parser);
  });
}

function decodeCsv(data) {
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder("utf-16le").decode(data).replace(/^\ufeff/, "");
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder("utf-16be").decode(data).replace(/^\ufeff/, "");
  for (const encoding of ["utf-8", "gb18030"]) {
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
  const delimiterCounts = new Map([[",", 0], ["\t", 0], [";", 0]]);
  let detectingQuoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (detectingQuoted && text[index + 1] === '"') {
        index += 1;
      } else {
        detectingQuoted = !detectingQuoted;
      }
    } else if (!detectingQuoted && delimiterCounts.has(character)) {
      delimiterCounts.set(character, delimiterCounts.get(character) + 1);
    } else if (!detectingQuoted && (character === "\n" || character === "\r")) {
      break;
    }
  }
  const delimiter = [...delimiterCounts.entries()]
    .sort((left, right) => right[1] - left[1])[0][0];
  const matrix = [];
  const sourceRows = [];
  let row = [];
  let value = "";
  let quoted = false;
  let physicalLine = 1;
  let recordStartLine = 1;
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
        if (character === "\n") physicalLine += 1;
      }
    } else if (character === '"' && value === "") {
      quoted = true;
    } else if (character === delimiter) {
      row.push(value);
      if (row.length > MAX_COLUMNS) throw new Error(`数据列超过 ${MAX_COLUMNS} 列限制`);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      if (row.length > MAX_COLUMNS) throw new Error(`数据列超过 ${MAX_COLUMNS} 列限制`);
      matrix.push(row);
      sourceRows.push(recordStartLine);
      if (matrix.length > MAX_ROWS + 1) throw new Error(`数据记录超过 ${MAX_ROWS} 条限制`);
      row = [];
      value = "";
      physicalLine += 1;
      recordStartLine = physicalLine;
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("CSV 包含未闭合的引号字段");
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    if (row.length > MAX_COLUMNS) throw new Error(`数据列超过 ${MAX_COLUMNS} 列限制`);
    matrix.push(row);
    sourceRows.push(recordStartLine);
    if (matrix.length > MAX_ROWS + 1) throw new Error(`数据记录超过 ${MAX_ROWS} 条限制`);
  }
  return { matrix, sourceRows };
}

function assertSafeSpreadsheetArchive(data) {
  let archive;
  try {
    archive = new AdmZip(data);
  } catch (_error) {
    throw new Error("Excel 文件损坏或不是有效的 XLSX/XLSM 文档");
  }
  const entries = archive.getEntries();
  if (entries.length > 4096) throw new Error("Excel 文件条目超过 4096 个安全限制");
  if (!archive.getEntry("[Content_Types].xml") || !archive.getEntry("xl/workbook.xml")) {
    throw new Error("Excel 文件缺少工作簿核心部件");
  }
  let total = 0;
  for (const entry of entries) {
    const name = String(entry.entryName || "").replaceAll("\\", "/");
    if (name.startsWith("/") || name.split("/").includes("..")) throw new Error("Excel 包含不安全的文件路径");
    const size = Number(entry.header?.size || 0);
    const compressedSize = Number(entry.header?.compressedSize || 0);
    if (!Number.isSafeInteger(size) || size < 0 || size > 100 * 1024 * 1024) {
      throw new Error(`Excel 条目 ${name} 超过 100 MB 安全限制`);
    }
    total += size;
    if (total > 200 * 1024 * 1024) throw new Error("Excel 解压后总大小超过 200 MB 安全限制");
    if (size > 1024 * 1024 && compressedSize > 0 && size / compressedSize > 200) {
      throw new Error(`Excel 条目 ${name} 压缩比异常，已拒绝处理`);
    }
  }
}

function excelCellValue(cell) {
  let value = cell.value;
  if (value == null) return "";
  if (typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) {
    value = value.result;
  }
  if (value instanceof Date) {
    const localMidnight = value.getHours() === 0
      && value.getMinutes() === 0
      && value.getSeconds() === 0
      && value.getMilliseconds() === 0;
    const parts = localMidnight
      ? [value.getFullYear(), value.getMonth() + 1, value.getDate()]
      : [value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()];
    return `${String(parts[0]).padStart(4, "0")}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const numberFormat = String(cell.numFmt || "").trim();
    if (numberFormat && numberFormat.toLowerCase() !== "general") {
      try {
        return SSF.format(numberFormat, value);
      } catch (_error) {
        // A few hand-authored spreadsheets use bare CJK currency symbols,
        // which Excel accepts but SSF expects as quoted literals.
        try {
          const compatibleFormat = numberFormat.replace(/(^|[; ])([¥￥])(?=[#0?])/g, '$1"$2"');
          return SSF.format(compatibleFormat, value);
        } catch (_formatError) {
          // Preserve the underlying value when an exotic display format is unsupported.
        }
      }
    }
    return value;
  }
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map(item => item.text).join("");
    if (Object.prototype.hasOwnProperty.call(value, "text")) return value.text ?? "";
    if (Object.prototype.hasOwnProperty.call(value, "error")) return value.error ?? "";
  }
  return value;
}

async function parseTabular(filename, data) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === ".json") {
    try {
      return await parseCoreTabular(filename, data);
    } catch (error) {
      const message = String(error?.message || "JSON 数据无效")
        .replace(/^Data file is empty$/, "数据文件为空")
        .replace(/^Data file exceeds the 25 MB limit$/, "文件超过 25 MB 限制")
        .replace(/^JSON data is not valid UTF-8 JSON$/, "JSON 数据不是有效的 UTF-8 JSON")
        .replace(/^JSON data must be an array or an object with a "rows" array$/, "JSON 数据必须是数组，或包含 rows 数组的对象")
        .replace(/^JSON row (\d+) must be an object$/, "JSON 第 $1 条记录必须是对象")
        .replace(/^JSON contains a forbidden key: (.+)$/, "JSON 包含禁止字段：$1")
        .replace(/^Data exceeds the 10,000-row limit$/, "数据记录超过 10000 条限制")
        .replace(/^Data exceeds the 500-column limit$/, "数据列超过 500 列限制");
      throw new Error(message, { cause: error });
    }
  }
  if (![".csv", ".xlsx", ".xlsm"].includes(extension)) throw new Error("仅支持 JSON、CSV、XLSX 或 XLSM 数据文件");
  let matrix;
  let sourceRows;
  if (extension === ".csv") {
    ({ matrix, sourceRows } = parseCsv(data));
  } else {
    assertSafeSpreadsheetArchive(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return { headers: [], rows: [] };
    const width = worksheet.columnCount;
    if (width > MAX_COLUMNS) throw new Error(`数据列超过 ${MAX_COLUMNS} 列限制`);
    matrix = [];
    sourceRows = [];
    if (worksheet.rowCount > MAX_ROWS + 1) throw new Error(`数据记录超过 ${MAX_ROWS} 条限制`);
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const excelRow = worksheet.getRow(rowNumber);
      matrix.push(Array.from({ length: width }, (_unused, index) => excelCellValue(excelRow.getCell(index + 1))));
      sourceRows.push(excelRow.number);
    }
  }
  const headerIndex = matrix.findIndex(row => row.some(cell => String(cell).trim()));
  if (headerIndex < 0) return { headers: [], rows: [], sourceRows: [] };
  const headerValues = matrix[headerIndex];
  const dataMatrix = matrix.slice(headerIndex + 1);
  const dataSourceRows = sourceRows.slice(headerIndex + 1);
  if (dataMatrix.length > MAX_ROWS) throw new Error(`数据记录超过 ${MAX_ROWS} 条限制`);
  if (headerValues.length > MAX_COLUMNS) throw new Error(`数据列超过 ${MAX_COLUMNS} 列限制`);
  const seenHeaders = new Map();
  const warnings = [];
  const headers = headerValues.map((value, index) => {
    const original = String(value).trim() || `字段_${index + 1}`;
    const count = (seenHeaders.get(original) || 0) + 1;
    seenHeaders.set(original, count);
    if (count === 1) return original;
    const unique = `${original}_${count}`;
    warnings.push(`重复列名“${original}”已重命名为“${unique}”`);
    return unique;
  });
  const rows = dataMatrix.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  return { headers, rows, warnings, sourceRows: dataSourceRows };
}

function decodeXml(value) {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&apos;", "'");
}

function extractDocxFields(data) {
  return extractDocxTemplateInfo(data).fields;
}

function numberValue(value) {
  if (typeof value === "number") return value;
  const normalized = String(value ?? "").replaceAll(",", "").replace(/[¥￥]/g, "").trim();
  if (normalized.endsWith("%")) return Number(normalized.slice(0, -1) || 0) / 100;
  const result = Number(normalized || 0);
  return Number.isFinite(result) ? result : 0;
}

function valueOr(value, fallback) {
  return value == null || (typeof value === "string" && value.trim() === "") ? fallback : value;
}

function conditionTruthy(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  const text = String(value ?? "").trim();
  if (!text || /^(?:0|false|no|n|否|假|未|unchecked)$/i.test(text)) return false;
  if (/^(?:1|true|yes|y|是|真|勾选|checked)$/i.test(text)) return true;
  return true;
}

function localCalendarDate(value = new Date()) {
  return [
    String(value.getFullYear()).padStart(4, "0"),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0")
  ].join("-");
}

function evaluateFormula(expression, row) {
  return evaluateExpression(expression, row);
}

function applyRules(rows, computedFields = [], conditionalFields = []) {
  return applyRulesDetailed(rows, computedFields, conditionalFields).rows;
}

function validateRows(
  rows,
  requiredFields = [],
  locale = "zh-CN",
  ruleErrors = [],
  stopOnMissing = true,
  sourceRows = null,
  alwaysRequiredFields = []
) {
  const issues = [];
  const validIndexes = [];
  rows.forEach((row, index) => {
    const missing = requiredFields.filter(field => field && !String(row[field] ?? "").trim());
    const fatalMissing = missing.filter(field => alwaysRequiredFields.includes(field));
    const errors = ruleErrors.filter(error => error.rowIndex === index).map(error => `${error.field}: ${error.message}`);
    if (missing.length || errors.length) {
      const sourceRow = Number(sourceRows?.[index]) || index + 2;
      const fallback = locale === "en" ? `Record ${sourceRow - 1}` : `第 ${sourceRow - 1} 条`;
      issues.push({ row: sourceRow, record: String(row["客户简称"] || row["客户名称"] || fallback), missing, errors });
    }
    // Missing required values may be explicitly allowed, but formula and
    // mapping errors must never flow into generated customer documents.
    if (!errors.length && !fatalMissing.length && (!stopOnMissing || !missing.length)) {
      validIndexes.push(index);
    }
  });
  return { total: rows.length, valid: validIndexes.length, invalid: issues.length, issues, validIndexes };
}

function safeComponent(value, fallback = "未命名") {
  let text = String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[ .]+|[ .]+$/g, "")
    .replace(/\.{2,}/g, ".");
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(text)) text = `_${text}`;
  return (text || fallback).slice(0, 80);
}

function renderPattern(pattern, row) {
  return String(pattern).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, key) => safeComponent(row[key.trim()], ""));
}

function mapRow(source, mappings = {}) {
  const row = { ...source };
  for (const [target, mapping] of Object.entries(mappings || {})) {
    if (!target) continue;
    if (typeof mapping === "string") {
      row[target] = source[mapping] ?? row[mapping] ?? "";
    } else if (mapping && typeof mapping === "object") {
      if (mapping.kind === "literal") row[target] = mapping.value ?? "";
      else if (mapping.kind === "expression") row[target] = evaluateFormula(mapping.expression || "", row);
      else row[target] = source[mapping.source] ?? row[mapping.source] ?? "";
    }
  }
  return row;
}

function patternFields(...patterns) {
  const fields = new Set();
  for (const pattern of patterns) {
    for (const match of String(pattern || "").matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
      const field = match[1].trim();
      if (field) fields.add(field);
    }
  }
  return [...fields];
}

function requiredFieldsForPayload(payload) {
  return [...new Set([
    ...(payload.requiredFields || []).filter(Boolean),
    ...namingFieldsForPayload(payload)
  ])];
}

function namingFieldsForPayload(payload) {
  const locale = payload.locale === "en" ? "en" : "zh-CN";
  const settings = payload.settings || {};
  const filenamePattern = settings.filenamePattern
    || (locale === "en" ? "{{客户简称}}-Quotation-{{报价编号}}" : "{{客户简称}}-报价单-{{报价编号}}");
  const folderPattern = settings.folderPattern || "{{客户简称}}/{{报价编号}}";
  return patternFields(filenamePattern, folderPattern);
}

function prepareRows(payload) {
  const settings = payload.settings || {};
  const entries = (payload.rows || [])
    .map((row, index) => {
      const provided = Number(payload.sourceRows?.[index]);
      const sourceRow = Number.isSafeInteger(provided) && provided > 0 && provided <= 10_000_000
        ? provided
        : index + 2;
      return { row, sourceRow };
    })
    .filter(entry => settings.skipBlank === false || !isBlankRow(entry.row));
  const mappingErrors = [];
  const mappedRows = entries.map((entry, rowIndex) => {
    try {
      return mapRow(entry.row, payload.mappings || {});
    } catch (error) {
      mappingErrors.push({ rowIndex, field: "mapping", kind: "mapping", message: error.message });
      return { ...entry.row };
    }
  });
  const ruled = applyRulesDetailed(mappedRows, payload.computedFields || [], payload.conditionalFields || []);
  return {
    rows: ruled.rows,
    sourceRows: entries.map(entry => entry.sourceRow),
    errors: [...mappingErrors, ...ruled.errors]
  };
}

function unconfirmedMappingFields(payload) {
  const fields = new Set((payload.unconfirmedFields || []).map(value => String(value || "").trim()).filter(Boolean));
  for (const [field, mapping] of Object.entries(payload.mappings || {})) {
    if (mapping === "") fields.add(field);
  }
  return [...fields];
}

function outputFolder(pattern, row) {
  const rendered = renderPattern(pattern, row);
  const parts = rendered.split(/[\\/]+/).map(part => safeComponent(part, "")).filter(Boolean).slice(0, 12);
  return parts.join("/");
}

function outputBase(pattern, row) {
  const rendered = renderPattern(pattern, row).replace(/\.(?:pdf|docx)$/i, "");
  return safeComponent(rendered);
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function isBlankRow(row) {
  return !Object.values(row || {}).some(value => String(value ?? "").trim());
}

function fieldAssetDirectiveForResponse(name) {
  const normalized = String(name || "").trim();
  if (/^(signature|签名|stamp|印章)$/i.test(normalized)) {
    return { tag: normalized, kind: "signature", source: "signature" };
  }
  const match = normalized.match(/^@?(image|qrcode)\s*:\s*(.+)$/i);
  return match ? { tag: normalized, kind: match[1].toLowerCase(), source: match[2].trim() } : null;
}

function publicPdfFieldInspection(fields) {
  const details = new Map();
  const assets = [];
  for (const field of fields || []) {
    const directive = fieldAssetDirectiveForResponse(field.name);
    if (directive) {
      assets.push({ ...directive, required: Boolean(field.required), pdfFieldName: field.name });
      if (directive.kind === "signature") continue;
    }
    const name = directive?.source || field.name;
    const existing = details.get(name);
    details.set(name, {
      name,
      type: directive?.kind || field.type,
      required: Boolean(existing?.required || field.required),
      pdfFieldName: field.name,
      ...(Array.isArray(field.options) ? { options: field.options } : {})
    });
  }
  return { fields: [...details.keys()], fieldDetails: [...details.values()], assets };
}

function assetKey(value) {
  return String(value || "").normalize("NFC").trim().toLocaleLowerCase("en-US");
}

function assetCandidates(value, source) {
  const raw = String(value || "");
  return [
    raw,
    path.posix.basename(raw.replaceAll("\\", "/")),
    path.win32.basename(raw),
    source
  ].map(assetKey).filter(Boolean);
}

function availableAssetKeys(settings) {
  return new Set(Object.keys(settings.assets || {}).map(assetKey).filter(Boolean));
}

function settingsAssetError(settings = {}) {
  try {
    let totalBytes = 0;
    const uniqueData = new Set([
      ...(settings.signature ? [settings.signature] : []),
      ...Object.values(settings.assets || {})
    ]);
    for (const value of uniqueData) {
      const image = validateImageData(value);
      if (!image) throw new Error("图片必须是 PNG 或 JPEG data URL");
      totalBytes += image.buffer.length;
      if (totalBytes > 20 * 1024 * 1024) throw new Error("图片资源解码后总大小超过 20 MB 安全限制");
    }
    return null;
  } catch (error) {
    return error.message || "图片资源无效";
  }
}

function templateInputErrors(rows, templates, settings = {}, requiredFields = null) {
  const errors = [];
  const required = requiredFields ? new Set(requiredFields) : null;
  const availableAssets = availableAssetKeys(settings);
  const signatureValid = /^data:image\/(?:png|jpeg|jpg);base64,/i.test(String(settings.signature || ""));
  rows.forEach((row, rowIndex) => {
    for (const template of templates || []) {
      if (template.builtIn === "quote" && Buffer.byteLength(quoteQrValue(row), "utf8") > 2_000) {
        errors.push({
          rowIndex,
          field: "二维码内容",
          kind: "template",
          message: "内置报价单二维码内容超过 2000 字节安全限制"
        });
      }
      for (const asset of template.assets || []) {
        if (asset.kind === "signature") {
          if (asset.required && !signatureValid) {
            errors.push({ rowIndex, field: asset.pdfFieldName || "signature", kind: "template", message: "必填签名/印章图片尚未上传" });
          } else if (settings.signature && !signatureValid) {
            errors.push({ rowIndex, field: asset.pdfFieldName || "signature", kind: "template", message: "签名/印章图片格式无效" });
          }
          continue;
        }
        const value = row[asset.source];
        const text = String(value ?? "").trim();
        const assetRequired = asset.kind === "signature"
          ? asset.required
          : required
            ? required.has(asset.source)
            : asset.required;
        if (assetRequired && !text) {
          errors.push({ rowIndex, field: asset.source, kind: "template", message: `必填资源字段 ${asset.source} 为空` });
          continue;
        }
        if (asset.kind === "qrcode" && Buffer.byteLength(text, "utf8") > 2_000) {
          errors.push({ rowIndex, field: asset.source, kind: "template", message: `二维码字段 ${asset.source} 超过 2000 字节安全限制` });
        }
        if (asset.kind === "image" && /^data:image\//i.test(text)) {
          try {
            if (!validateImageData(text)) throw new Error("图片 data URL 格式无效");
          } catch (error) {
            errors.push({ rowIndex, field: asset.source, kind: "template", message: error.message });
          }
        }
        if (
          asset.kind === "image"
          && text
          && !/^data:image\/(?:png|jpeg|jpg);base64,/i.test(text)
          && !assetCandidates(text, asset.source).some(candidate => availableAssets.has(candidate))
        ) {
          errors.push({ rowIndex, field: asset.source, kind: "template", message: `未找到图片资源“${text}”` });
        }
      }
      if (String(template.kind).toUpperCase() !== "PDF") continue;
      for (const detail of template.fieldDetails || []) {
        if (!["radio", "dropdown", "option-list"].includes(detail.type) || !Array.isArray(detail.options)) continue;
        const raw = row[detail.name];
        const selections = Array.isArray(raw) ? raw.map(String) : [String(raw ?? "")].filter(Boolean);
        for (const selection of selections) {
          if (!detail.options.includes(selection)) {
            errors.push({
              rowIndex,
              field: detail.name,
              kind: "template",
              message: `值“${selection}”不在 PDF 字段 ${detail.name} 的允许选项中`
            });
          }
        }
      }
    }
  });
  return errors;
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
  const subtotal = numberValue(valueOr(row["小计"], quantity * unitPrice));
  const discount = numberValue(row["优惠"]);
  const taxRate = numberValue(valueOr(row["税率"], "13%"));
  const tax = numberValue(valueOr(row["税额"], Math.max(subtotal - discount, 0) * taxRate));
  const total = numberValue(valueOr(row["含税总额"], Math.max(subtotal - discount, 0) + tax));
  const showDiscount = Object.prototype.hasOwnProperty.call(row, "显示优惠行")
    ? conditionTruthy(row["显示优惠行"])
    : discount > 0;
  const qrValue = quoteQrValue(row, total);
  if (Buffer.byteLength(qrValue, "utf8") > 2_000) {
    throw new Error("内置报价单二维码内容超过 2000 字节安全限制");
  }
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
    <header class="hero"><div class="mark">DF</div><div><h1>${L.title}</h1><div class="sub">DOCFLOW LOCAL · QUOTATION</div></div><div class="meta">${L.number}&nbsp; ${escapeHtml(row["报价编号"] || "—")}<br>${L.date}&nbsp; ${escapeHtml(valueOr(row["报价日期"], localCalendarDate()))}</div></header>
    <main class="content"><section class="customer"><div><div class="label">${L.preparedFor}</div><div class="customer-name">${escapeHtml(row["客户名称"] || row["客户简称"] || "—")}</div></div><div><div class="label">${L.contactInfo}</div><div class="contact">${L.contact}: ${escapeHtml(row["联系人"] || "—")}<br>${L.email}: ${escapeHtml(row["联系邮箱"] || row["邮箱"] || "—")}</div></div></section>
    <table><colgroup><col style="width:24%"><col style="width:37%"><col style="width:10%"><col style="width:14%"><col style="width:15%"></colgroup><thead><tr><th>${L.item}</th><th>${L.description}</th><th>${L.quantity}</th><th>${L.unitPrice}</th><th>${L.amount}</th></tr></thead><tbody><tr><td>${escapeHtml(row["产品名称"] || L.defaultItem)}</td><td>${escapeHtml(row["产品说明"] || L.defaultDescription)}</td><td>${escapeHtml(valueOr(row["数量"], 1))}</td><td>${money(unitPrice, locale)}</td><td>${money(subtotal, locale)}</td></tr></tbody></table>
    <div class="summary"><div class="sum-row"><span>${L.subtotal}</span><span>${money(subtotal, locale)}</span></div>${showDiscount ? `<div class="sum-row"><span>${L.discount}</span><span>${money(-discount, locale)}</span></div>` : ""}<div class="sum-row"><span>${L.tax} (${Math.round(taxRate * 100)}%)</span><span>${money(tax, locale)}</span></div><div class="sum-row total"><span>${L.total}</span><span>${money(total, locale)}</span></div></div></main>
    <section class="note"><strong>${L.terms}</strong>${escapeHtml(row["备注"] || L.defaultNote)}<br>${L.localNote}</section>
    <section class="signatures"><div class="sign-line"><span>${L.customerApproval}</span></div><div class="sign-line">${signatureMarkup}<span>${L.authorizedSignature}</span></div></section>
    <div class="qr"><img src="${qrImage}">${L.qr}</div><footer><span>DOCFLOW LOCAL · PRIVATE BY DESIGN</span><span>${L.page}</span></footer>
  </body></html>`;
}

function quoteQrValue(row, total = null) {
  return String(
    row["二维码内容"]
    || `quote:${row["报价编号"] || ""}|customer:${row["客户简称"] || ""}|total:${Number.isFinite(total) ? total.toFixed(2) : numberValue(row["含税总额"]).toFixed(2)}`
  );
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
  const safe = /^\s*[=+\-@]/.test(text) || /^[\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

async function generateBundle(payload, renderPdf) {
  const locale = payload.locale === "en" ? "en" : "zh-CN";
  const settings = payload.settings || {};
  const assetError = settingsAssetError(settings);
  if (assetError) throw new Error(`图片资源校验失败：${assetError}`);
  const requestedTemplates = Array.isArray(payload.templates) ? [...new Set(payload.templates.filter(Boolean))] : [];
  if (!requestedTemplates.length) throw new Error(locale === "en" ? "Select at least one template." : "请至少选择一个模板");
  const unconfirmedFields = unconfirmedMappingFields(payload);
  if (unconfirmedFields.length) {
    throw new Error(
      locale === "en"
        ? `Confirm or explicitly ignore these mappings: ${unconfirmedFields.join(", ")}`
        : `请确认或明确忽略以下字段映射：${unconfirmedFields.join("、")}`
    );
  }
  if ((payload.rows || []).length > MAX_ROWS) throw new Error(`数据记录超过 ${MAX_ROWS} 条限制`);

  const renderers = typeof renderPdf === "function"
    ? { renderHtmlToPdf: renderPdf }
    : (renderPdf || {});
  if (typeof renderers.renderHtmlToPdf !== "function" && requestedTemplates.some(id => id === "quote" || id === "attachment")) {
    throw new Error("内置模板缺少 HTML → PDF 渲染器");
  }

  const prepared = prepareRows(payload);
  const rows = prepared.rows;
  const stopOnMissing = settings.stopOnMissing !== false;
  let validation = validateRows(
    rows,
    requiredFieldsForPayload(payload),
    locale,
    prepared.errors,
    stopOnMissing,
    prepared.sourceRows,
    namingFieldsForPayload(payload)
  );
  if (!validation.valid) throw new Error(locale === "en" ? "No records are eligible for generation." : "没有可生成的有效记录");

  const resolveTemplate = typeof renderers.resolveTemplate === "function"
    ? renderers.resolveTemplate
    : async id => payload.templateRegistry?.[id] || null;
  const templates = [];
  for (const id of requestedTemplates) {
    if (id === "quote") {
      templates.push({ id, kind: "BUILTIN", filename: locale === "en" ? "Standard Quotation" : "标准报价单", builtIn: "quote" });
    } else if (id === "attachment") {
      templates.push({ id, kind: "BUILTIN", filename: locale === "en" ? "Project Appendix" : "项目附件", builtIn: "attachment" });
    } else {
      const template = await resolveTemplate(id);
      if (!template?.data) throw new Error(`模板 ${id} 已失效，请重新添加`);
      if (String(template.kind).toUpperCase() === "PDF" && typeof template.fillable !== "boolean") {
        const inspection = await inspectPdfTemplate(template.data);
        templates.push({ ...template, fillable: inspection.fillable, pageCount: inspection.pageCount });
      } else {
        templates.push(template);
      }
    }
  }

  const preflightErrors = templateInputErrors(rows, templates, settings, payload.requiredFields || []);
  if (preflightErrors.length) {
    validation = validateRows(
      rows,
      requiredFieldsForPayload(payload),
      locale,
      [...prepared.errors, ...preflightErrors],
      stopOnMissing,
      prepared.sourceRows,
      namingFieldsForPayload(payload)
    );
    if (!validation.valid) {
      throw new Error(locale === "en" ? "No records passed template resource validation." : "没有记录通过模板资源校验");
    }
  }

  const projectedFilesPerRecord = templates.length
    + (settings.includeSourceDocx === true ? templates.filter(template => String(template.kind).toUpperCase() === "DOCX" && !template.builtIn).length : 0)
    + (settings.mergePdfs === true && templates.length > 1 ? 1 : 0);
  const projectedFiles = validation.valid * projectedFilesPerRecord;
  const projectedRenders = validation.valid * templates.filter(template => template.builtIn || String(template.kind).toUpperCase() === "DOCX").length;
  if (projectedFiles > MAX_GENERATED_FILES || projectedRenders > MAX_RENDERED_DOCUMENTS) {
    const message = locale === "en"
      ? `This job is too large for the in-memory MVP (${projectedFiles} files / ${projectedRenders} rendered documents). Split it into smaller batches.`
      : `本次任务超出内存版 MVP 的安全批量限制（${projectedFiles} 个文件 / ${projectedRenders} 份渲染文档），请拆分为较小批次。`;
    throw new Error(message);
  }

  const filenamePattern = String(settings.filenamePattern || (locale === "en" ? "{{客户简称}}-Quotation-{{报价编号}}" : "{{客户简称}}-报价单-{{报价编号}}")).slice(0, 500);
  const folderPattern = String(settings.folderPattern || "{{客户简称}}/{{报价编号}}").slice(0, 500);
  const archive = new AdmZip();
  const generated = [];
  const warnings = [];
  const generationIssues = [];
  const usedPathKeys = new Set();
  const integrityFiles = [];
  let deliveryBytes = 0;

  function boundedPath(candidate) {
    let normalized = candidate.replace(/^\/+/, "").replace(/\/+/g, "/");
    if (Buffer.byteLength(normalized, "utf8") > 220) {
      const extension = path.posix.extname(normalized);
      const suffix = `-${sha256(Buffer.from(normalized)).slice(0, 10)}${extension}`;
      const characters = Array.from(normalized.slice(0, -extension.length));
      while (characters.length && Buffer.byteLength(`${characters.join("")}${suffix}`, "utf8") > 220) characters.pop();
      const prefix = characters.join("");
      normalized = `${prefix.replace(/[ .]+$/, "")}${suffix}`;
    }
    return normalized;
  }

  function pathKey(candidate) {
    return candidate.normalize("NFC").toLocaleLowerCase("en-US");
  }

  function uniquePath(candidate) {
    let normalized = boundedPath(candidate);
    let key = pathKey(normalized);
    if (!usedPathKeys.has(key)) {
      usedPathKeys.add(key);
      return normalized;
    }
    const extension = path.posix.extname(normalized);
    const base = normalized.slice(0, -extension.length);
    let index = 2;
    let result;
    do {
      result = boundedPath(`${base}-${index}${extension}`);
      key = pathKey(result);
      index += 1;
    } while (usedPathKeys.has(key));
    usedPathKeys.add(key);
    return result;
  }

  async function verifyPdf(buffer, label) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 100 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error(`${label} 未生成有效 PDF`);
    }
    try {
      const document = await PDFDocument.load(buffer, { updateMetadata: false });
      if (document.getPageCount() < 1) throw new Error("没有页面");
      return document.getPageCount();
    } catch (error) {
      throw new Error(`${label} PDF 完整性校验失败：${error.message}`);
    }
  }

  function verifyDocx(buffer, label) {
    try {
      const document = new AdmZip(buffer);
      if (!document.getEntry("word/document.xml") || !document.getEntry("[Content_Types].xml")) throw new Error("缺少 Word 核心部件");
    } catch (error) {
      throw new Error(`${label} DOCX 完整性校验失败：${error.message}`);
    }
  }

  function addOutput(candidate, buffer, metadata = {}) {
    if (!Buffer.isBuffer(buffer)) throw new Error(`输出 ${candidate} 不是有效的二进制文件`);
    if (deliveryBytes + buffer.length > MAX_DELIVERY_BYTES) {
      throw new Error("交付包未压缩文件总量超过 256 MB 安全限制，请拆分批次");
    }
    deliveryBytes += buffer.length;
    const filename = uniquePath(candidate);
    archive.addFile(filename, buffer);
    const file = {
      path: filename,
      bytes: buffer.length,
      sha256: sha256(buffer),
      ...metadata
    };
    integrityFiles.push(file);
    return file;
  }

  for (const index of validation.validIndexes) {
    const row = rows[index];
    const folder = outputFolder(folderPattern, row);
    const base = outputBase(filenamePattern, row);
    const prefix = folder ? `${folder}/` : "";
    const record = String(row["客户简称"] || row["客户名称"] || (locale === "en" ? `Record ${index + 1}` : `第 ${index + 1} 条`));
    const artifacts = [];
    try {
      const pdfs = [];
      for (const template of templates) {
        let pdf;
        let sourceDocx = null;
        let suffix = "";
        if (template.builtIn === "quote") {
          pdf = await renderers.renderHtmlToPdf(await quoteHtml(row, settings.signature || "", locale));
        } else if (template.builtIn === "attachment") {
          suffix = locale === "en" ? "project-appendix" : "项目附件";
          pdf = await renderers.renderHtmlToPdf(attachmentHtml(row, locale));
        } else if (String(template.kind).toUpperCase() === "DOCX") {
          suffix = safeComponent(path.parse(template.filename).name, locale === "en" ? "document" : "文档");
          const rendered = await renderDocxTemplate(template.data, row, settings);
          sourceDocx = rendered.buffer;
          warnings.push(...rendered.warnings.map(message => `${template.filename} / ${record}: ${message}`));
          verifyDocx(sourceDocx, template.filename);
          if (typeof renderers.renderDocxToPdf !== "function") throw new Error("缺少 Word → PDF 本地渲染器");
          pdf = await renderers.renderDocxToPdf(sourceDocx);
        } else if (String(template.kind).toUpperCase() === "PDF") {
          suffix = safeComponent(path.parse(template.filename).name, locale === "en" ? "form" : "表单");
          if (template.fillable === false) {
            // Preserve static PDFs byte-for-byte, including any existing
            // certificate signature. Inspection still enforces the active
            // content policy before the file enters the template registry.
            await inspectPdfTemplate(template.data);
            pdf = Buffer.from(template.data);
          } else {
            const filled = await fillPdfTemplate(template.data, row, settings);
            pdf = filled.buffer;
            warnings.push(...filled.warnings.map(message => `${template.filename} / ${record}: ${message}`));
          }
        } else {
          throw new Error(`不支持的模板类型：${template.kind}`);
        }

        const pageCount = await verifyPdf(pdf, template.filename);
        const fileBase = suffix ? `${base}-${suffix}` : base;
        artifacts.push({
          candidate: `${prefix}${fileBase}.pdf`,
          buffer: pdf,
          metadata: { mediaType: "application/pdf", pages: pageCount, templateId: template.id }
        });
        pdfs.push(pdf);

        if (sourceDocx && settings.includeSourceDocx === true) {
          artifacts.push({
            candidate: `${prefix}${fileBase}.docx`,
            buffer: sourceDocx,
            metadata: {
              mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              templateId: template.id
            }
          });
        }
      }

      if (settings.mergePdfs === true && pdfs.length > 1) {
        const merged = await mergePdfBuffers(pdfs);
        const pageCount = await verifyPdf(merged, `${base} merged`);
        artifacts.push({
          candidate: `${prefix}${base}-${locale === "en" ? "combined" : "合并"}.pdf`,
          buffer: merged,
          metadata: { mediaType: "application/pdf", pages: pageCount, combined: true }
        });
      }
      const recordBytes = artifacts.reduce((sum, artifact) => sum + artifact.buffer.length, 0);
      if (deliveryBytes + recordBytes > MAX_DELIVERY_BYTES) {
        throw new Error("交付包未压缩文件总量超过 256 MB 安全限制，请拆分批次");
      }
      const recordFiles = artifacts.map(artifact => addOutput(artifact.candidate, artifact.buffer, artifact.metadata));
      generated.push({
        sourceRow: prepared.sourceRows[index],
        record,
        files: recordFiles
      });
    } catch (error) {
      if (/安全限制/.test(error.message || "")) throw error;
      generationIssues.push({
        row: prepared.sourceRows[index],
        record,
        missing: [],
        errors: [error.message || String(error)]
      });
    }
  }
  if (!generated.length && generationIssues.length) {
    throw new Error(
      locale === "en"
        ? `All records failed during document rendering: ${generationIssues[0].errors[0]}`
        : `所有记录在文档渲染阶段失败：${generationIssues[0].errors[0]}`
    );
  }

  const allIssues = [...validation.issues, ...generationIssues];
  validation.generationIssues = generationIssues;
  validation.generated = generated.length;
  validation.skipped = rows.length - generated.length;
  const supportingFiles = [];
  if (settings.validationReport !== false) {
    const reportRows = [
      locale === "en" ? ["Source Row", "Record", "Missing Fields", "Rule / Generation Errors"] : ["数据行", "记录", "缺失字段", "规则 / 生成错误"],
      ...allIssues.map(issue => [
        issue.row,
        issue.record,
        issue.missing.join(locale === "en" ? ", " : "、"),
        (issue.errors || []).join(locale === "en" ? "; " : "；")
      ])
    ];
    const report = Buffer.from(`\ufeff${reportRows.map(row => row.map(csvCell).join(",")).join("\r\n")}`, "utf8");
    supportingFiles.push(addOutput(
      locale === "en" ? "validation-report.csv" : "校验报告.csv",
      report,
      { mediaType: "text/csv", role: "validation-report" }
    ));
  }

  const manifest = {
    product: "DocFlow Local Desktop",
    version: APP_VERSION,
    locale,
    generatedAt: new Date().toISOString(),
    privacy: "All processing completed locally.",
    input: {
      rows: (payload.rows || []).length,
      processedRows: rows.length,
      sha256: sha256(Buffer.from(JSON.stringify(payload.rows || [])))
    },
    templates: templates.map(template => ({
      id: template.id,
      filename: template.filename,
      kind: template.kind,
      sha256: template.sha256 || (template.data ? sha256(template.data) : null)
    })),
    summary: {
      records: generated.length,
      documents: generated.reduce((sum, item) => sum + item.files.length, 0),
      skipped: rows.length - generated.length,
      rowsWithIssues: allIssues.length,
      warnings: warnings.length
    },
    warnings,
    validation: {
      requiredFields: requiredFieldsForPayload(payload),
      issues: allIssues.map(issue => ({
        row: issue.row,
        missing: issue.missing || [],
        errors: issue.errors || []
      }))
    },
    files: integrityFiles,
    supportingFiles,
    items: generated
  };
  const manifestName = locale === "en" ? "delivery-manifest.json" : "交付清单.json";
  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
  if (deliveryBytes + manifestBuffer.length > MAX_DELIVERY_BYTES) {
    throw new Error("交付包未压缩文件总量超过 256 MB 安全限制，请拆分批次");
  }
  archive.addFile(manifestName, manifestBuffer);
  const buffer = archive.toBuffer();

  const reopened = new AdmZip(buffer);
  for (const expected of integrityFiles) {
    const entry = reopened.getEntry(expected.path);
    if (!entry) throw new Error(`交付包完整性校验失败：缺少 ${expected.path}`);
    const content = entry.getData();
    if (content.length !== expected.bytes || sha256(content) !== expected.sha256) {
      throw new Error(`交付包完整性校验失败：${expected.path} 校验和不一致`);
    }
  }
  if (!reopened.getEntry(manifestName)) throw new Error("交付包完整性校验失败：缺少交付清单");
  return { buffer, validation, generated, warnings, manifest };
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

async function createLocalEngine({ staticDir, renderPdf, renderHtmlToPdf, renderDocxToPdf }) {
  const token = crypto.randomBytes(24).toString("hex");
  let origin = "";
  const templateStore = new Map();
  let templateBytes = 0;
  const htmlRenderer = renderHtmlToPdf || renderPdf;

  function authorized(request) {
    const supplied = String(request.headers["x-docflow-token"] || "");
    if (supplied.length !== token.length) return false;
    return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
  }

  function publicTemplate(template) {
    return {
      id: template.id,
      filename: template.filename,
      kind: template.kind,
      bytes: template.data.length,
      sha256: template.sha256,
      fields: template.fields,
      fieldDetails: template.fieldDetails,
      assets: template.assets,
      fillable: template.fillable,
      pageCount: template.pageCount
    };
  }

  function removeTemplate(id) {
    const template = templateStore.get(id);
    if (!template) return false;
    templateBytes -= template.data.length;
    templateStore.delete(id);
    return true;
  }

  async function inspectTemplateData(filename, data, requestedId = "") {
    const safeFilename = path.basename(String(filename || "template"));
    const bytes = Buffer.from(data || []);
    const extension = path.extname(safeFilename).toLowerCase();
    if (![".docx", ".pdf"].includes(extension)) throw new Error("模板仅支持 DOCX 或 PDF");
    if (!bytes.length || bytes.length > MAX_TEMPLATE_BYTES) throw new Error("模板大小超出支持范围");
    let inspection;
    if (extension === ".docx") {
      const info = extractDocxTemplateInfo(bytes);
      await renderDocxTemplate(
        bytes,
        Object.fromEntries(info.fields.map(field => [field, ""])),
        {}
      );
      inspection = {
        fields: info.fields,
        fieldDetails: info.fields.map(name => ({ name, type: "text", required: false })),
        assets: info.assets,
        fillable: true,
        pageCount: null
      };
    } else {
      const info = await inspectPdfTemplate(bytes);
      const publicFields = publicPdfFieldInspection(info.fields);
      inspection = {
        ...publicFields,
        fillable: info.fillable,
        pageCount: info.pageCount
      };
    }
    const id = /^template-[a-f0-9]{24}$/i.test(String(requestedId || ""))
      ? String(requestedId)
      : `template-${crypto.randomBytes(12).toString("hex")}`;
    return {
      id,
      filename: safeFilename,
      kind: extension.slice(1).toUpperCase(),
      data: bytes,
      sha256: sha256(bytes),
      ...inspection
    };
  }

  async function replaceTemplates(entries) {
    if (!Array.isArray(entries)) throw new Error("项目模板列表无效");
    if (entries.length > MAX_TEMPLATES) throw new Error(`单次项目最多添加 ${MAX_TEMPLATES} 个模板`);
    const incomingBytes = entries.reduce((sum, entry) => sum + Buffer.byteLength(entry?.data || []), 0);
    if (incomingBytes > MAX_TEMPLATE_BYTES) throw new Error("模板总大小超过 100 MB 限制");
    const inspected = [];
    const projectKeys = new Set();
    for (const entry of entries) {
      const projectKey = String(entry?.projectKey || "");
      if (!/^[a-z0-9][a-z0-9._-]{7,79}$/i.test(projectKey) || projectKeys.has(projectKey)) {
        throw new Error("项目模板标识无效或重复");
      }
      projectKeys.add(projectKey);
      const template = await inspectTemplateData(entry.filename, entry.data);
      if (entry.sha256 && template.sha256 !== String(entry.sha256).toLowerCase()) {
        throw new Error(`模板 ${template.filename} 完整性校验失败`);
      }
      inspected.push({ projectKey, template });
    }
    templateStore.clear();
    templateBytes = 0;
    for (const { template } of inspected) {
      templateStore.set(template.id, template);
      templateBytes += template.data.length;
    }
    return inspected.map(({ projectKey, template }) => ({
      projectKey,
      ...publicTemplate(template)
    }));
  }

  function exportTemplates(entries) {
    if (!Array.isArray(entries)) throw new Error("项目模板列表无效");
    const projectKeys = new Set();
    return entries.map(entry => {
      const id = String(entry?.id || "");
      const projectKey = String(entry?.projectKey || "");
      if (!/^[a-z0-9][a-z0-9._-]{7,79}$/i.test(projectKey) || projectKeys.has(projectKey)) {
        throw new Error("项目模板标识无效或重复");
      }
      projectKeys.add(projectKey);
      const template = templateStore.get(id);
      if (!template) throw new Error(`模板 ${id} 已失效，请重新添加`);
      return {
        projectKey,
        filename: template.filename,
        kind: template.kind,
        sha256: template.sha256,
        data: Buffer.from(template.data)
      };
    });
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, origin || "http://127.0.0.1");
      if (url.pathname.startsWith("/api/")) {
        if (!authorized(request)) {
          sendJson(response, 401, { error: "本地会话令牌无效" });
          return;
        }
        const expectedHost = origin ? new URL(origin).host : request.headers.host;
        if (request.headers.host !== expectedHost) {
          sendJson(response, 403, { error: "请求主机不受信任" });
          return;
        }
        if (request.headers.origin && request.headers.origin !== origin) {
          sendJson(response, 403, { error: "请求来源不受信任" });
          return;
        }
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, mode: "desktop", version: APP_VERSION, runtime: "electron", templates: templateStore.size });
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
        if (templateStore.size >= MAX_TEMPLATES) throw new Error(`单次项目最多添加 ${MAX_TEMPLATES} 个模板`);
        if (templateBytes + upload.data.length > MAX_TEMPLATE_BYTES) throw new Error("模板总大小超过 100 MB 限制");
        const template = await inspectTemplateData(upload.filename, upload.data);
        templateStore.set(template.id, template);
        templateBytes += upload.data.length;
        sendJson(response, 200, {
          ...publicTemplate(template),
          message: template.kind === "DOCX"
            ? "已识别并保留 DOCX 模板；生成时将使用原始版式"
            : template.fillable
              ? "已识别 PDF 表单字段"
              : "PDF 没有表单字段，将作为静态模板逐条复制"
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/templates") {
        sendJson(response, 200, { templates: [...templateStore.values()].map(publicTemplate) });
        return;
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/api/template/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/template/".length));
        if (!removeTemplate(id)) {
          sendJson(response, 404, { error: "模板不存在或已移除" });
          return;
        }
        sendJson(response, 200, { ok: true, id });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/validate") {
        const payload = await readJson(request);
        const settings = payload.settings || {};
        const prepared = prepareRows(payload);
        const rows = prepared.rows;
        const configIssues = [];
        const selected = Array.isArray(payload.templates) ? payload.templates : [];
        const selectedTemplates = selected.map(id => {
          if (id === "quote") return { id, kind: "BUILTIN", builtIn: "quote", assets: [] };
          if (id === "attachment") return { id, kind: "BUILTIN", builtIn: "attachment", assets: [] };
          return templateStore.get(id);
        }).filter(Boolean);
        if (!selected.length) configIssues.push(payload.locale === "en" ? "Select at least one template." : "请至少选择一个模板");
        const assetError = settingsAssetError(settings);
        if (assetError) configIssues.push(`图片资源校验失败：${assetError}`);
        const unconfirmedFields = unconfirmedMappingFields(payload);
        if (unconfirmedFields.length) {
          configIssues.push(
            payload.locale === "en"
              ? `Confirm or explicitly ignore these mappings: ${unconfirmedFields.join(", ")}`
              : `请确认或明确忽略以下字段映射：${unconfirmedFields.join("、")}`
          );
        }
        for (const id of selected) {
          if (!["quote", "attachment"].includes(id) && !templateStore.has(id)) configIssues.push(`模板 ${id} 已失效，请重新添加`);
        }
        const templateErrors = templateInputErrors(rows, selectedTemplates, settings, payload.requiredFields || []);
        const result = validateRows(
          rows,
          requiredFieldsForPayload(payload),
          payload.locale === "en" ? "en" : "zh-CN",
          [...prepared.errors, ...templateErrors],
          settings.stopOnMissing !== false,
          prepared.sourceRows,
          namingFieldsForPayload(payload)
        );
        sendJson(response, 200, { ...result, rows, configIssues, canGenerate: result.valid > 0 && configIssues.length === 0 });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/generate") {
        const payload = await readJson(request);
        const result = await generateBundle(payload, {
          renderHtmlToPdf: htmlRenderer,
          renderDocxToPdf,
          resolveTemplate: async id => templateStore.get(id) || null
        });
        const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
        const filename = `${payload.locale === "en" ? "DocFlow-Package" : "DocFlow-交付包"}-${stamp}.zip`;
        response.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Length": result.buffer.length,
          "Content-Disposition": `attachment; filename="DocFlow-package-${stamp}.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "X-DocFlow-Generated": String(result.generated.length),
          "X-DocFlow-Skipped": String(result.manifest.summary.skipped),
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
    exportTemplates,
    replaceTemplates,
    close: callback => {
      templateStore.clear();
      templateBytes = 0;
      return server.close(callback);
    }
  };
}

module.exports = {
  createLocalEngine,
  parseTabular,
  extractDocxFields,
  applyRules,
  validateRows,
  generateBundle,
  mapRow,
  safeComponent
};
