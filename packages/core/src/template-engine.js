"use strict";

// SPDX-License-Identifier: AGPL-3.0-or-later

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const AdmZip = require("adm-zip");
const Docxtemplater = require("docxtemplater");
const QRCode = require("qrcode");
const fontkit = require("@pdf-lib/fontkit");
const {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFButton,
  PDFSignature,
  PDFDict,
  PDFName,
  PDFArray,
  PDFRef
} = require("pdf-lib");
const { imageSize } = require("image-size");

const XML_PART_PATTERN = /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/;
const IMAGE_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DRAWING_NS = {
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  pic: "http://schemas.openxmlformats.org/drawingml/2006/picture",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
};
const MAX_DOCX_ENTRIES = 4096;
const MAX_DOCX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_DOCX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_DOCX_COMPRESSION_RATIO = 200;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_EDGE = 10_000;
const MAX_IMAGE_PIXELS = 40_000_000;
const ACTIVE_DOCX_ENTRY = /(?:^|\/)(?:vbaProject\.bin|activeX\/|embeddings\/|customUI\/|afchunk)/i;
const ACTIVE_PDF_KEYS = new Set([
  "/OpenAction",
  "/AA",
  "/JS",
  "/JavaScript",
  "/EmbeddedFiles",
  "/XFA",
  "/EF",
  "/RichMediaContent",
  "/RichMediaSettings"
]);
const ACTIVE_PDF_ACTIONS = new Set([
  "/JavaScript",
  "/Launch",
  "/GoToR",
  "/GoToE",
  "/SubmitForm",
  "/ImportData",
  "/Rendition",
  "/RichMediaExecute",
  "/Sound",
  "/Movie",
  "/Thread",
  "/Hide",
  "/SetOCGState",
  "/Trans"
]);
const ACTIVE_PDF_TYPES = new Set([
  "/EmbeddedFile",
  "/FileAttachment",
  "/RichMedia",
  "/Screen",
  "/Movie",
  "/Sound",
  "/3D"
]);
const ACTIVE_WORD_FIELD_COMMANDS = new Set([
  "DDE",
  "DDEAUTO",
  "INCLUDETEXT",
  "INCLUDEPICTURE",
  "LINK",
  "DATABASE",
  "RD"
]);

function assertSafeWordFieldInstructions(xml, partName) {
  const instructions = [];
  const qualified = String.raw`(?:[A-Za-z_][\w.-]*:)?`;
  const simpleFieldPattern = new RegExp(`<${qualified}fldSimple\\b([^>]*)>`, "gi");
  for (const match of String(xml).matchAll(simpleFieldPattern)) {
    const instruction = match[1].match(new RegExp(`\\b${qualified}instr\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"))?.[2];
    if (instruction) instructions.push(decodeXml(instruction));
  }

  const fields = [];
  const tokens = new RegExp(
    `<${qualified}fldChar\\b([^>]*)\\/?>|<${qualified}instrText\\b[^>]*>([\\s\\S]*?)<\\/${qualified}instrText>`,
    "gi"
  );
  for (const match of String(xml).matchAll(tokens)) {
    if (match[1] !== undefined) {
      const type = match[1].match(
        new RegExp(`\\b${qualified}fldCharType\\s*=\\s*(["'])(begin|separate|end)\\1`, "i")
      )?.[2]?.toLowerCase();
      if (type === "begin") {
        fields.push({ parts: [], captured: false });
      } else if (type === "separate" && fields.length) {
        const field = fields[fields.length - 1];
        if (!field.captured) {
          instructions.push(decodeXml(field.parts.join("")));
          field.captured = true;
        }
      } else if (type === "end" && fields.length) {
        const field = fields.pop();
        if (!field.captured) instructions.push(decodeXml(field.parts.join("")));
      }
      continue;
    }
    if (match[2] === undefined) continue;
    if (fields.length) fields[fields.length - 1].parts.push(match[2]);
    else instructions.push(decodeXml(match[2]));
  }
  for (const field of fields) {
    if (!field.captured) instructions.push(decodeXml(field.parts.join("")));
  }

  for (const instruction of instructions) {
    const command = String(instruction || "").replace(/^[^A-Za-z]+/, "").match(/^[A-Za-z]+/)?.[0]?.toUpperCase();
    if (command && ACTIVE_WORD_FIELD_COMMANDS.has(command)) {
      throw new Error(`DOCX 包含不支持的活动字段 ${command}：${partName}`);
    }
  }
}

function assertSafeDocxArchive(data) {
  let archive;
  try {
    archive = new AdmZip(data);
  } catch (_error) {
    throw new Error("DOCX 文件损坏或不是有效的 Word 文档");
  }
  const entries = archive.getEntries();
  if (entries.length > MAX_DOCX_ENTRIES) throw new Error(`DOCX 文件条目超过 ${MAX_DOCX_ENTRIES} 个安全限制`);
  let total = 0;
  for (const entry of entries) {
    const name = String(entry.entryName || "").replaceAll("\\", "/");
    if (name.startsWith("/") || name.split("/").includes("..")) throw new Error("DOCX 包含不安全的文件路径");
    if (ACTIVE_DOCX_ENTRY.test(name)) throw new Error(`DOCX 包含不支持的活动或嵌入内容：${name}`);
    const size = Number(entry.header?.size || 0);
    const compressedSize = Number(entry.header?.compressedSize || 0);
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_DOCX_ENTRY_BYTES) {
      throw new Error(`DOCX 条目 ${name} 超过 64 MB 安全限制`);
    }
    total += size;
    if (total > MAX_DOCX_UNCOMPRESSED_BYTES) throw new Error("DOCX 解压后总大小超过 200 MB 安全限制");
    if (size > 1024 * 1024 && compressedSize > 0 && size / compressedSize > MAX_DOCX_COMPRESSION_RATIO) {
      throw new Error(`DOCX 条目 ${name} 压缩比异常，已拒绝处理`);
    }
    if (name.endsWith(".rels") && size > 0) {
      const relationships = entry.getData().toString("utf8");
      for (const match of relationships.matchAll(/<(?:[A-Za-z_][\w.-]*:)?Relationship\b([^>]*)\/?>/gi)) {
        const attributes = Object.fromEntries(
          [...match[1].matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)]
            .map(attribute => [attribute[1].split(":").pop(), decodeXml(attribute[3])])
        );
        const type = String(attributes.Type || "");
        if (
          String(attributes.TargetMode || "").toLowerCase() === "external"
          && !type.endsWith("/hyperlink")
        ) {
          throw new Error(`DOCX 包含不支持的外部关系：${type || attributes.Target || name}`);
        }
        if (/(?:oleObject|package|attachedTemplate|aFChunk)$/i.test(type)) {
          throw new Error(`DOCX 包含不支持的活动关系：${type}`);
        }
      }
    }
    if (/^word\/.*\.xml$/i.test(name) && size > 0) {
      assertSafeWordFieldInstructions(entry.getData().toString("utf8"), name);
    }
  }
  return archive;
}

function assertSafePdfDocument(document) {
  const visited = new WeakSet();
  const visit = value => {
    const object = value instanceof PDFRef ? document.context.lookup(value) : value;
    if (!object || typeof object !== "object" || visited.has(object)) return;
    visited.add(object);
    if (object instanceof PDFArray) {
      for (let index = 0; index < object.size(); index += 1) visit(object.get(index));
      return;
    }
    const dictionary = object instanceof PDFDict
      ? object
      : object?.dict instanceof PDFDict
        ? object.dict
        : null;
    if (!dictionary) return;
    for (const key of dictionary.keys()) {
      const keyName = String(key);
      if (ACTIVE_PDF_KEYS.has(keyName)) throw new Error(`PDF 包含不支持的活动内容：${keyName.slice(1)}`);
    }
    for (const keyName of ["S", "Type", "Subtype"]) {
      const raw = dictionary.get(PDFName.of(keyName));
      const value = raw ? document.context.lookup(raw) : null;
      const normalized = String(value || "");
      if (ACTIVE_PDF_ACTIONS.has(normalized) || ACTIVE_PDF_TYPES.has(normalized)) {
        throw new Error(`PDF 包含不支持的活动内容：${normalized.slice(1)}`);
      }
    }
    for (const key of dictionary.keys()) visit(dictionary.get(key));
  };
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    visit(object);
  }
}

function decodeXml(value) {
  return String(value)
    .replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_match, hexadecimal, decimal) => {
      const codePoint = Number.parseInt(hexadecimal || decimal, hexadecimal ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function encodeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function visibleXmlText(xml) {
  const visible = [];
  const pattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
  for (const match of String(xml).matchAll(pattern)) {
    if (match[1] !== undefined) visible.push(match[1]);
    else if (match[0].startsWith("<w:tab")) visible.push("\t");
    else visible.push("\n");
  }
  return decodeXml(visible.join(""));
}

function parseAssetTag(rawTag) {
  const tag = String(rawTag || "").trim();
  if (/^@signature$/i.test(tag)) return { tag, kind: "signature", source: "signature" };
  const match = tag.match(/^@(image|qrcode)\s*:\s*(.+)$/i);
  if (!match) return null;
  return { tag, kind: match[1].toLowerCase(), source: match[2].trim() };
}

function splitFilterExpression(rawTag) {
  const parts = String(rawTag || "").split("|").map(part => part.trim()).filter(Boolean);
  return {
    field: parts.shift() || "",
    filters: parts
  };
}

function dateParts(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [value.getFullYear(), value.getMonth() + 1, value.getDate()];
  }
  const text = String(value ?? "").trim();
  const direct = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (direct) return [Number(direct[1]), Number(direct[2]), Number(direct[3])];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return [parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate()];
}

function formatDate(value, pattern = "YYYY-MM-DD") {
  const parts = dateParts(value);
  if (!parts) return value ?? "";
  const [year, month, day] = parts;
  return String(pattern || "YYYY-MM-DD")
    .replaceAll("YYYY", String(year).padStart(4, "0"))
    .replaceAll("MM", String(month).padStart(2, "0"))
    .replaceAll("DD", String(day).padStart(2, "0"));
}

function finiteNumber(value, filterName) {
  const normalized = typeof value === "string"
    ? value.replaceAll(",", "").replace(/[¥￥$€£]/g, "").trim()
    : value;
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw new Error(`${filterName} formatter requires a finite number`);
  return number;
}

function applyTemplateFilter(value, rawFilter, customFormatters = {}, context = {}) {
  const [rawName, ...argumentParts] = String(rawFilter || "").split(":");
  const name = rawName.trim().toLowerCase();
  const argument = argumentParts.join(":").trim();
  const customFormatter = customFormatters instanceof Map
    ? customFormatters.get(name)
    : customFormatters?.[name];
  if (typeof customFormatter === "function") {
    const formatted = customFormatter(value, argument, {
      name,
      raw: String(rawFilter || ""),
      row: context
    });
    if (formatted && typeof formatted.then === "function") {
      throw new Error(`Template formatter "${name}" must be synchronous`);
    }
    return formatted ?? "";
  }
  if (name === "trim") return String(value ?? "").trim();
  if (name === "upper") return String(value ?? "").toLocaleUpperCase();
  if (name === "lower") return String(value ?? "").toLocaleLowerCase();
  if (name === "default") return value == null || String(value).trim() === "" ? argument : value;
  if (name === "date") return formatDate(value, argument || "YYYY-MM-DD");
  if (name === "number") {
    const digits = Math.min(12, Math.max(0, Number.parseInt(argument || "2", 10) || 0));
    return finiteNumber(value, "number").toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: true
    });
  }
  if (name === "currency" || name === "money") {
    const currency = /^[A-Z]{3}$/.test(argument.toUpperCase()) ? argument.toUpperCase() : "CNY";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(finiteNumber(value, name));
  }
  if (name === "percent") {
    const digits = Math.min(12, Math.max(0, Number.parseInt(argument || "0", 10) || 0));
    return new Intl.NumberFormat("en-US", {
      style: "percent",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(finiteNumber(value, "percent"));
  }
  throw new Error(`Unsupported template formatter: ${name || rawFilter}`);
}

function extractDocxTemplateInfo(data) {
  assertSafeDocxArchive(data);
  let zip;
  try {
    zip = new PizZip(data);
  } catch (_error) {
    throw new Error("DOCX 文件损坏或不是有效的 Word 文档");
  }
  if (!zip.file("word/document.xml")) throw new Error("DOCX 缺少 word/document.xml");
  const tags = new Set();
  const fieldUsages = new Map();
  const addFieldUsage = (name, scopes) => {
    if (!name) return;
    const usages = fieldUsages.get(name) || [];
    const key = scopes.join("\u0000");
    if (!usages.some(usage => usage.key === key)) usages.push({ key, scopes: [...scopes] });
    fieldUsages.set(name, usages);
  };
  for (const filename of Object.keys(zip.files).filter(name => XML_PART_PATTERN.test(name))) {
    const text = visibleXmlText(zip.file(filename).asText());
    const scopes = [];
    for (const match of text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
      const tag = match[1].trim();
      tags.add(tag);
      const asset = parseAssetTag(tag);
      if (asset) {
        if (asset.kind !== "signature") addFieldUsage(asset.source, scopes);
        continue;
      }
      if (tag.startsWith("#")) {
        const condition = splitFilterExpression(tag.slice(1)).field;
        addFieldUsage(condition, scopes);
        if (condition) scopes.push(condition);
        continue;
      }
      if (tag.startsWith("/")) {
        const closing = splitFilterExpression(tag.slice(1)).field;
        const index = scopes.lastIndexOf(closing);
        if (index >= 0) scopes.splice(index);
        continue;
      }
      if (tag.startsWith("!")) continue;
      addFieldUsage(splitFilterExpression(tag).field, scopes);
    }
  }

  const fields = new Set();
  const conditions = new Set();
  const assets = [];
  for (const tag of tags) {
    const asset = parseAssetTag(tag);
    if (asset) {
      assets.push(asset);
      if (asset.kind !== "signature") fields.add(asset.source);
      continue;
    }
    if (tag.startsWith("#")) {
      const condition = splitFilterExpression(tag.slice(1)).field;
      if (condition) {
        conditions.add(condition);
        fields.add(condition);
      }
      continue;
    }
    if (tag.startsWith("/") || tag.startsWith("!")) continue;
    const field = splitFilterExpression(tag).field;
    if (field) fields.add(field);
  }
  return {
    fields: [...fields].sort((a, b) => a.localeCompare(b, "zh-CN")),
    fieldDetails: [...fieldUsages.entries()]
      .map(([name, usages]) => ({
        name,
        topLevel: usages.some(usage => usage.scopes.length === 0),
        scopes: usages.map(usage => usage.scopes)
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
    conditions: [...conditions].sort((a, b) => a.localeCompare(b, "zh-CN")),
    assets: assets.sort((a, b) => a.tag.localeCompare(b.tag, "zh-CN"))
  };
}

function lookupValue(scope, tag) {
  if (Object.prototype.hasOwnProperty.call(scope || {}, tag)) return scope[tag];
  const segments = String(tag).split(".").map(item => item.trim()).filter(Boolean);
  let value = scope;
  for (const segment of segments) {
    if (value == null || !Object.prototype.hasOwnProperty.call(Object(value), segment)) return "";
    value = value[segment];
  }
  return value ?? "";
}

function conditionTruthy(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  const text = String(value ?? "").trim();
  if (!text || /^(?:0|false|no|n|否|假|未|unchecked)$/i.test(text)) return false;
  if (/^(?:1|true|yes|y|是|真|勾选|checked)$/i.test(text)) return true;
  return true;
}

function assetMarker(tag) {
  return `__DOCFLOW_ASSET_${crypto.createHash("sha1").update(tag).digest("hex").slice(0, 18).toUpperCase()}__`;
}

function templateParser(tag, options = {}) {
  const normalized = decodeXml(String(tag || "")).trim();
  const asset = parseAssetTag(normalized);
  const expression = splitFilterExpression(normalized);
  return {
    get(scope) {
      if (asset) return assetMarker(asset.tag);
      let value = lookupValue(scope, expression.field);
      for (const filter of expression.filters) {
        value = applyTemplateFilter(value, filter, options.formatters, scope);
      }
      return value;
    }
  };
}

function escapeWordTextAtSigns(zip) {
  for (const filename of Object.keys(zip.files).filter(name => XML_PART_PATTERN.test(name))) {
    const xml = zip.file(filename).asText();
    zip.file(filename, xml.replace(
      /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g,
      (_match, open, text, close) => `${open}${text.replaceAll("@", "&#64;")}${close}`
    ));
  }
  return zip;
}

function parseDataUrl(value) {
  if (Buffer.isBuffer(value)) return validatedImage(value, "application/octet-stream");
  if (value && typeof value === "object" && value.data) {
    const result = parseDataUrl(value.data);
    return result ? validatedImage(result.buffer, value.mimeType || result.mimeType) : null;
  }
  const match = String(value || "").match(/^data:(image\/(?:png|jpeg|jpg));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  return validatedImage(
    Buffer.from(match[2].replace(/\s+/g, ""), "base64"),
    match[1].toLowerCase().replace("image/jpg", "image/jpeg")
  );
}

function validatedImage(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("图片文件为空或超过 5 MB 安全限制");
  }
  let measured;
  try {
    measured = imageSize(buffer);
  } catch (_error) {
    throw new Error("图片数据损坏或格式不受支持");
  }
  const width = Number(measured.width);
  const height = Number(measured.height);
  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || width < 1
    || height < 1
    || width > MAX_IMAGE_EDGE
    || height > MAX_IMAGE_EDGE
    || width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error("图片尺寸超过 10000 像素边长或 4000 万像素安全限制");
  }
  const detected = String(measured.type || "").toLowerCase();
  if (!["png", "jpg", "jpeg"].includes(detected)) throw new Error("图片仅支持 PNG 或 JPEG");
  const detectedMime = detected === "png" ? "image/png" : "image/jpeg";
  const normalizedMime = String(mimeType || "").toLowerCase().replace("image/jpg", "image/jpeg");
  if (normalizedMime.startsWith("image/") && normalizedMime !== detectedMime) {
    throw new Error("图片 MIME 类型与文件内容不一致");
  }
  return { buffer: Buffer.from(buffer), mimeType: detectedMime, width, height };
}

function normalizedAssetKey(value) {
  return String(value || "").normalize("NFC").trim().toLocaleLowerCase("en-US");
}

function resolveAssetData(asset, context, options) {
  if (asset.kind === "signature") return parseDataUrl(options.signature);
  if (asset.kind === "qrcode") return null;
  const rawValue = lookupValue(context, asset.source);
  const direct = parseDataUrl(rawValue);
  if (direct) return direct;
  const assets = options.assets || {};
  const normalizedAssets = new Map();
  for (const [key, value] of Object.entries(assets)) {
    const normalized = normalizedAssetKey(key);
    if (!normalized) continue;
    if (normalizedAssets.has(normalized) && normalizedAssets.get(normalized) !== value) {
      throw new Error(`图片资源名称冲突：${key}`);
    }
    normalizedAssets.set(normalized, value);
  }
  const rawName = String(rawValue || "");
  const candidates = [
    rawName,
    path.posix.basename(rawName.replaceAll("\\", "/")),
    path.win32.basename(rawName),
    asset.source
  ].filter(Boolean);
  for (const key of candidates) {
    const resolved = parseDataUrl(assets[key] ?? normalizedAssets.get(normalizedAssetKey(key)));
    if (resolved) return resolved;
  }
  return null;
}

function imageExtension(mimeType, buffer) {
  if (mimeType === "image/png" || buffer.subarray(1, 4).toString("ascii") === "PNG") {
    return { extension: "png", contentType: "image/png" };
  }
  if (mimeType === "image/jpeg" || (buffer[0] === 0xff && buffer[1] === 0xd8)) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }
  throw new Error("Word 图片仅支持 PNG 或 JPEG");
}

function imageDimensions(buffer, requestedWidth, requestedHeight) {
  const measured = imageSize(buffer);
  const sourceWidth = Number(measured.width) || 1;
  const sourceHeight = Number(measured.height) || 1;
  const maximumWidth = Number(requestedWidth) || 180;
  const maximumHeight = Number(requestedHeight) || 100;
  const scale = Math.min(maximumWidth / sourceWidth, maximumHeight / sourceHeight, 1);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  return { width, height, cx: Math.round(width * 9525), cy: Math.round(height * 9525) };
}

function relationshipsPath(partName) {
  return `${path.posix.dirname(partName)}/_rels/${path.posix.basename(partName)}.rels`;
}

function appendRelationship(zip, partName, target) {
  const relsName = relationshipsPath(partName);
  let xml = zip.file(relsName)?.asText()
    || `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELATIONSHIPS_NS}"></Relationships>`;
  const ids = [...xml.matchAll(/\bId\s*=\s*["']rId(\d+)["']/g)].map(match => Number(match[1]));
  const relationshipId = `rId${Math.max(0, ...ids) + 1}`;
  const relationship = `<Relationship Id="${relationshipId}" Type="${IMAGE_RELATIONSHIP}" Target="${target}"/>`;
  xml = xml.replace(/<\/Relationships>\s*$/, `${relationship}</Relationships>`);
  zip.file(relsName, xml);
  return relationshipId;
}

function ensureImageContentType(zip, extension, contentType) {
  const name = "[Content_Types].xml";
  let xml = zip.file(name)?.asText();
  if (!xml) throw new Error("DOCX 缺少 [Content_Types].xml");
  const pattern = new RegExp(`<Default\\b[^>]*\\bExtension\\s*=\\s*["']${extension}["']`, "i");
  if (!pattern.test(xml)) {
    xml = xml.replace(/<\/Types>\s*$/, `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`);
    zip.file(name, xml);
  }
}

function drawingXml(relationshipId, filename, dimensions, drawingId) {
  const { cx, cy } = dimensions;
  return `<w:drawing><wp:inline xmlns:wp="${DRAWING_NS.wp}" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${drawingId}" name="${filename}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${DRAWING_NS.a}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${DRAWING_NS.a}"><a:graphicData uri="${DRAWING_NS.pic}"><pic:pic xmlns:pic="${DRAWING_NS.pic}"><pic:nvPicPr><pic:cNvPr id="0" name="${filename}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="${DRAWING_NS.r}" r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

function replaceMarkerRun(xml, marker, drawingFactory) {
  let replacements = 0;
  const updated = xml.replace(/<w:r(?=[\s>])[\s\S]*?<\/w:r>/g, run => {
    if (!run.includes(marker)) return run;
    replacements += 1;
    const drawing = typeof drawingFactory === "function" ? drawingFactory() : drawingFactory;
    const properties = run.match(/<w:rPr[\s\S]*?<\/w:rPr>/)?.[0] || "";
    const visible = visibleXmlText(run);
    const markerIndex = visible.indexOf(marker);
    const before = markerIndex > 0 ? visible.slice(0, markerIndex) : "";
    const after = markerIndex >= 0 ? visible.slice(markerIndex + marker.length) : "";
    const textRun = value => value ? `<w:r>${properties}<w:t xml:space="preserve">${encodeXml(value)}</w:t></w:r>` : "";
    return `${textRun(before)}<w:r>${properties}${drawing}</w:r>${textRun(after)}`;
  });
  return { xml: updated.replaceAll(marker, ""), replacements };
}

async function patchDocxAssets(data, assetTags, context, options = {}) {
  const zip = new PizZip(data);
  const warnings = [];
  const parts = Object.keys(zip.files).filter(name => XML_PART_PATTERN.test(name));
  const existingDrawingIds = parts.flatMap(partName => (
    [...zip.file(partName).asText().matchAll(/<wp:docPr\b[^>]*\bid\s*=\s*["'](\d+)["']/g)].map(match => Number(match[1]))
  ));
  let drawingId = Math.max(0, ...existingDrawingIds) + 1;
  let mediaIndex = 0;
  for (const asset of assetTags) {
    const marker = assetMarker(asset.tag);
    if (!parts.some(partName => zip.file(partName).asText().includes(marker))) continue;
    let resolved;
    if (asset.kind === "qrcode") {
      const value = String(lookupValue(context, asset.source) ?? "");
      if (value) {
        resolved = {
          buffer: await QRCode.toBuffer(value, { type: "png", margin: 1, width: 360, errorCorrectionLevel: "M" }),
          mimeType: "image/png"
        };
      }
    } else {
      resolved = resolveAssetData(asset, context, options);
    }

    if (!resolved) {
      const referencedValue = asset.kind === "image" ? String(lookupValue(context, asset.source) ?? "").trim() : "";
      if (referencedValue) {
        throw new Error(`未找到 ${asset.tag} 引用的图片资源“${referencedValue}”`);
      }
      for (const partName of parts) {
        const xml = zip.file(partName).asText();
        if (xml.includes(marker)) zip.file(partName, xml.replaceAll(marker, ""));
      }
      warnings.push(`未找到 ${asset.tag} 对应的图片资源`);
      continue;
    }

    const type = imageExtension(resolved.mimeType, resolved.buffer);
    ensureImageContentType(zip, type.extension, type.contentType);
    const dimensions = imageDimensions(
      resolved.buffer,
      asset.kind === "signature" ? 190 : asset.kind === "qrcode" ? 110 : options.imageWidth,
      asset.kind === "signature" ? 72 : asset.kind === "qrcode" ? 110 : options.imageHeight
    );
    mediaIndex += 1;
    const filename = `docflow-${mediaIndex}-${crypto.randomBytes(4).toString("hex")}.${type.extension}`;
    zip.file(`word/media/${filename}`, resolved.buffer);

    for (const partName of parts) {
      const original = zip.file(partName).asText();
      if (!original.includes(marker)) continue;
      const relationshipId = appendRelationship(zip, partName, `media/${filename}`);
      const replaced = replaceMarkerRun(
        original,
        marker,
        () => drawingXml(relationshipId, filename, dimensions, drawingId++)
      );
      zip.file(partName, replaced.xml);
      if (!replaced.replacements) warnings.push(`${asset.tag} 必须单独放在 Word 文本区域中`);
    }
  }
  return {
    buffer: zip.generate({ type: "nodebuffer", compression: "DEFLATE" }),
    warnings
  };
}

async function renderDocxTemplate(templateData, context, options = {}) {
  const info = extractDocxTemplateInfo(templateData);
  const renderContext = { ...(context || {}) };
  for (const condition of info.conditions) {
    const value = lookupValue(context, condition);
    renderContext[condition] = Array.isArray(value) ? value : conditionTruthy(value);
  }
  let document;
  try {
    document = new Docxtemplater(escapeWordTextAtSigns(new PizZip(templateData)), {
      delimiters: { start: "{{", end: "}}" },
      paragraphLoop: true,
      linebreaks: true,
      parser: tag => templateParser(tag, options),
      nullGetter: () => ""
    });
    document.render(renderContext);
  } catch (error) {
    const detail = error?.properties?.errors?.map(item => item.properties?.explanation || item.message).filter(Boolean).join("；");
    throw new Error(`Word 模板渲染失败：${detail || error.message}`);
  }
  const rendered = document.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
  return patchDocxAssets(rendered, info.assets, renderContext, options);
}

function pdfFieldType(field) {
  if (field instanceof PDFTextField) return "text";
  if (field instanceof PDFCheckBox) return "checkbox";
  if (field instanceof PDFRadioGroup) return "radio";
  if (field instanceof PDFDropdown) return "dropdown";
  if (field instanceof PDFOptionList) return "option-list";
  if (field instanceof PDFButton) return "button";
  if (field instanceof PDFSignature) return "signature";
  return field.constructor?.name || "unknown";
}

async function inspectPdfTemplate(data) {
  let document;
  try {
    document = await PDFDocument.load(data, { ignoreEncryption: false, updateMetadata: false });
  } catch (error) {
    throw new Error(error.message?.includes("encrypted") ? "PDF 已加密，无法作为模板" : "PDF 文件损坏或格式不受支持");
  }
  assertSafePdfDocument(document);
  let fields = [];
  try {
    fields = document.getForm().getFields().map(field => {
      const options = typeof field.getOptions === "function" ? field.getOptions().map(String) : undefined;
      return {
        name: field.getName(),
        type: pdfFieldType(field),
        required: typeof field.isRequired === "function" ? field.isRequired() : false,
        ...(options ? { options } : {})
      };
    });
  } catch (_error) {
    fields = [];
  }
  return {
    fields,
    pageCount: document.getPageCount(),
    fillable: fields.length > 0
  };
}

function truthy(value) {
  if (typeof value === "boolean") return value;
  return /^(1|true|yes|y|是|勾选|checked)$/i.test(String(value ?? "").trim());
}

function fieldAssetDirective(name) {
  const normalized = String(name || "").trim();
  if (/^(signature|签名|stamp|印章)$/i.test(normalized)) return { kind: "signature", source: "signature" };
  const match = normalized.match(/^@?(image|qrcode)\s*:\s*(.+)$/i);
  return match ? { kind: match[1].toLowerCase(), source: match[2].trim() } : null;
}

async function resolvePdfAsset(directive, context, options) {
  if (!directive) return null;
  if (directive.kind === "qrcode") {
    const value = String(lookupValue(context, directive.source) ?? "");
    return value ? { buffer: await QRCode.toBuffer(value, { type: "png", margin: 1, width: 480 }), mimeType: "image/png" } : null;
  }
  return resolveAssetData({ ...directive, tag: directive.source }, context, options);
}

async function embedPdfImage(document, resolved) {
  if (!resolved) return null;
  const type = imageExtension(resolved.mimeType, resolved.buffer);
  return type.extension === "png"
    ? document.embedPng(resolved.buffer)
    : document.embedJpg(resolved.buffer);
}

function widgetPage(document, widget) {
  const pageReference = typeof widget.P === "function" ? widget.P() : null;
  if (pageReference) {
    const match = document.getPages().find(page => page.ref === pageReference || page.ref?.toString() === pageReference.toString());
    if (match) return match;
  }
  return document.getPages()[0];
}

async function drawAssetOverField(document, form, field, resolved) {
  const image = await embedPdfImage(document, resolved);
  if (!image) return false;
  const widgets = field.acroField?.getWidgets?.() || [];
  for (const widget of widgets) {
    const rectangle = widget.getRectangle();
    const scale = Math.min(rectangle.width / image.width, rectangle.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    widgetPage(document, widget).drawImage(image, {
      x: rectangle.x + (rectangle.width - width) / 2,
      y: rectangle.y + (rectangle.height - height) / 2,
      width,
      height
    });
  }
  form.removeField(field);
  return widgets.length > 0;
}

function resolvePdfFieldValue(name, context) {
  if (Object.prototype.hasOwnProperty.call(context, name)) return context[name];
  const directive = fieldAssetDirective(name);
  if (directive && directive.kind !== "signature") return lookupValue(context, directive.source);
  return "";
}

function fontPath() {
  return require.resolve("@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff");
}

async function fillPdfTemplate(templateData, context, options = {}) {
  const document = await PDFDocument.load(templateData, { ignoreEncryption: false, updateMetadata: false });
  assertSafePdfDocument(document);
  const form = document.getForm();
  const warnings = [];
  let needsCustomFont = false;
  for (const field of form.getFields()) {
    const name = field.getName();
    const directive = fieldAssetDirective(name);
    const value = resolvePdfFieldValue(name, context);
    try {
      if (directive) {
        const resolved = await resolvePdfAsset(directive, context, options);
        if (!resolved) {
          const referencedValue = directive.kind === "image"
            ? String(lookupValue(context, directive.source) ?? "").trim()
            : "";
          if (referencedValue) throw new Error(`缺少图片资源“${referencedValue}”`);
          warnings.push(`PDF 字段 ${name} 缺少图片资源`);
        } else if (field instanceof PDFButton) {
          field.setImage(await embedPdfImage(document, resolved));
        } else {
          const drawn = await drawAssetOverField(document, form, field, resolved);
          if (!drawn) warnings.push(`PDF 字段 ${name} 没有可定位的控件`);
        }
      } else if (field instanceof PDFTextField) {
        const text = String(value ?? "");
        field.setText(text);
        needsCustomFont ||= /[^\x00-\xff]/.test(text);
      } else if (field instanceof PDFCheckBox) {
        truthy(value) ? field.check() : field.uncheck();
      } else if (field instanceof PDFRadioGroup) {
        const option = String(value ?? "");
        needsCustomFont ||= /[^\x00-\xff]/.test(option);
        if (option) field.select(option);
        else if (typeof field.clear === "function") field.clear();
      } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        const selections = Array.isArray(value) ? value.map(String) : [String(value ?? "")].filter(Boolean);
        needsCustomFont ||= selections.some(selection => /[^\x00-\xff]/.test(selection));
        if (selections.length) field.select(selections);
        else if (typeof field.clear === "function") field.clear();
      } else if (field instanceof PDFSignature) {
        warnings.push(`PDF 数字签名字段 ${name} 未填写：MVP 仅支持图片签名，不创建数字证书签名`);
      }
    } catch (error) {
      throw new Error(`PDF 字段 ${name} 填充失败：${error.message}`);
    }
  }

  if (needsCustomFont) {
    try {
      document.registerFontkit(fontkit);
      const font = await document.embedFont(fs.readFileSync(fontPath()), { subset: true });
      form.updateFieldAppearances(font);
    } catch (error) {
      throw new Error(`PDF 中文字体嵌入失败：${error.message}`);
    }
  }
  if (options.flattenPdf !== false) form.flatten();
  const buffer = Buffer.from(await document.save({ useObjectStreams: true, addDefaultPage: false }));
  return { buffer, warnings };
}

async function mergePdfBuffers(buffers) {
  const output = await PDFDocument.create();
  for (const buffer of buffers) {
    const source = await PDFDocument.load(buffer);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach(page => output.addPage(page));
  }
  return Buffer.from(await output.save({ useObjectStreams: true }));
}

module.exports = {
  applyTemplateFilter,
  extractDocxTemplateInfo,
  fillPdfTemplate,
  inspectPdfTemplate,
  mergePdfBuffers,
  parseAssetTag,
  renderDocxTemplate,
  validateImageData: parseDataUrl
};
