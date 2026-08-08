"use strict";

// SPDX-License-Identifier: AGPL-3.0-or-later

const path = require("path");
const AdmZip = require("adm-zip");
const ExcelJS = require("exceljs");
const SSF = require("ssf");

const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 500;
const MAX_JSON_DEPTH = 32;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function assertInputBuffer(data) {
  const bytes = Buffer.from(data || []);
  if (!bytes.length) throw new Error("Data file is empty");
  if (bytes.length > MAX_INPUT_BYTES) throw new Error("Data file exceeds the 25 MB limit");
  return bytes;
}

function decodeCsv(data) {
  if (data[0] === 0xff && data[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(data).replace(/^\ufeff/, "");
  }
  if (data[0] === 0xfe && data[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(data).replace(/^\ufeff/, "");
  }
  for (const encoding of ["utf-8", "gb18030"]) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(data).replace(/^\ufeff/, "");
    } catch (_error) {
      // Try the next supported encoding.
    }
  }
  return data.toString("utf8").replace(/^\ufeff/, "");
}

function detectDelimiter(text) {
  const counts = new Map([[",", 0], ["\t", 0], [";", 0]]);
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && counts.has(character)) {
      counts.set(character, counts.get(character) + 1);
    } else if (!quoted && (character === "\n" || character === "\r")) {
      break;
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0];
}

function parseCsv(data) {
  const text = decodeCsv(data);
  const delimiter = detectDelimiter(text);
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
      if (row.length > MAX_COLUMNS) throw new Error(`Data exceeds the ${MAX_COLUMNS}-column limit`);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      if (row.length > MAX_COLUMNS) throw new Error(`Data exceeds the ${MAX_COLUMNS}-column limit`);
      matrix.push(row);
      sourceRows.push(recordStartLine);
      if (matrix.length > MAX_ROWS + 1) throw new Error(`Data exceeds the ${MAX_ROWS}-row limit`);
      row = [];
      value = "";
      physicalLine += 1;
      recordStartLine = physicalLine;
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    matrix.push(row);
    sourceRows.push(recordStartLine);
  }
  return { matrix, sourceRows };
}

function assertSafeSpreadsheetArchive(data) {
  let archive;
  try {
    archive = new AdmZip(data);
  } catch (_error) {
    throw new Error("Excel file is damaged or is not a valid XLSX/XLSM workbook");
  }
  const entries = archive.getEntries();
  if (entries.length > 4096) throw new Error("Excel archive exceeds the 4,096-entry limit");
  if (!archive.getEntry("[Content_Types].xml") || !archive.getEntry("xl/workbook.xml")) {
    throw new Error("Excel archive is missing required workbook parts");
  }
  let total = 0;
  for (const entry of entries) {
    const name = String(entry.entryName || "").replaceAll("\\", "/");
    if (name.startsWith("/") || name.split("/").includes("..")) {
      throw new Error("Excel archive contains an unsafe path");
    }
    const size = Number(entry.header?.size || 0);
    const compressedSize = Number(entry.header?.compressedSize || 0);
    if (!Number.isSafeInteger(size) || size < 0 || size > 100 * 1024 * 1024) {
      throw new Error(`Excel entry ${name} exceeds the 100 MB limit`);
    }
    total += size;
    if (total > 200 * 1024 * 1024) throw new Error("Excel archive exceeds the 200 MB expanded-size limit");
    if (size > 1024 * 1024 && compressedSize > 0 && size / compressedSize > 200) {
      throw new Error(`Excel entry ${name} has an unsafe compression ratio`);
    }
  }
}

function excelCellValue(cell) {
  let value = cell.value;
  if (value == null) return "";
  if (typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "result")) value = value.result;
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
        try {
          return SSF.format(numberFormat.replace(/(^|[; ])([¥￥])(?=[#0?])/g, '$1"$2"'), value);
        } catch (_formatError) {
          // Preserve the underlying number for unsupported display formats.
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

function safeJsonValue(value, depth = 0) {
  if (depth > MAX_JSON_DEPTH) throw new Error(`JSON nesting exceeds ${MAX_JSON_DEPTH} levels`);
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("JSON contains a non-finite number");
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ROWS) throw new Error(`JSON array exceeds the ${MAX_ROWS}-item limit`);
    return value.map(item => safeJsonValue(item, depth + 1));
  }
  if (typeof value !== "object") throw new Error("JSON contains an unsupported value");
  const keys = Object.keys(value);
  if (keys.length > MAX_COLUMNS) throw new Error(`JSON object exceeds the ${MAX_COLUMNS}-field limit`);
  const result = Object.create(null);
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`JSON contains a forbidden key: ${key}`);
    result[key] = safeJsonValue(value[key], depth + 1);
  }
  return result;
}

function parseJson(data) {
  let parsed;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    parsed = JSON.parse(text);
  } catch (_error) {
    throw new Error("JSON data is not valid UTF-8 JSON");
  }
  const candidate = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(candidate)) throw new Error('JSON data must be an array or an object with a "rows" array');
  if (candidate.length > MAX_ROWS) throw new Error(`Data exceeds the ${MAX_ROWS}-row limit`);
  const rows = candidate.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`JSON row ${index + 1} must be an object`);
    }
    return safeJsonValue(row);
  });
  const headers = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  if (headers.length > MAX_COLUMNS) throw new Error(`Data exceeds the ${MAX_COLUMNS}-column limit`);
  return {
    headers,
    rows,
    sourceRows: rows.map((_row, index) => index + 1),
    warnings: []
  };
}

function rowsFromMatrix(matrix, sourceRows) {
  const headerIndex = matrix.findIndex(row => row.some(cell => String(cell).trim()));
  if (headerIndex < 0) return { headers: [], rows: [], sourceRows: [], warnings: [] };
  const headerValues = matrix[headerIndex];
  const dataMatrix = matrix.slice(headerIndex + 1);
  const dataSourceRows = sourceRows.slice(headerIndex + 1);
  if (dataMatrix.length > MAX_ROWS) throw new Error(`Data exceeds the ${MAX_ROWS}-row limit`);
  if (headerValues.length > MAX_COLUMNS) throw new Error(`Data exceeds the ${MAX_COLUMNS}-column limit`);
  const seenHeaders = new Map();
  const warnings = [];
  const headers = headerValues.map((value, index) => {
    const original = String(value).trim() || `field_${index + 1}`;
    if (FORBIDDEN_KEYS.has(original)) throw new Error(`Data contains a forbidden column name: ${original}`);
    const count = (seenHeaders.get(original) || 0) + 1;
    seenHeaders.set(original, count);
    if (count === 1) return original;
    const unique = `${original}_${count}`;
    warnings.push(`Duplicate column "${original}" was renamed to "${unique}"`);
    return unique;
  });
  const rows = dataMatrix.map(values => {
    const row = Object.create(null);
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
  return { headers, rows, warnings, sourceRows: dataSourceRows };
}

async function parseTabular(filename, input) {
  const data = assertInputBuffer(input);
  const extension = path.extname(String(filename || "")).toLowerCase();
  if (extension === ".json") return parseJson(data);
  if (![".csv", ".xlsx", ".xlsm"].includes(extension)) {
    throw new Error("Only JSON, CSV, XLSX, and XLSM data files are supported");
  }
  let matrix;
  let sourceRows;
  if (extension === ".csv") {
    ({ matrix, sourceRows } = parseCsv(data));
  } else {
    assertSafeSpreadsheetArchive(data);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(data);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return { headers: [], rows: [], sourceRows: [], warnings: [] };
    const width = worksheet.columnCount;
    if (width > MAX_COLUMNS) throw new Error(`Data exceeds the ${MAX_COLUMNS}-column limit`);
    if (worksheet.rowCount > MAX_ROWS + 1) throw new Error(`Data exceeds the ${MAX_ROWS}-row limit`);
    matrix = [];
    sourceRows = [];
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      matrix.push(Array.from({ length: width }, (_unused, index) => excelCellValue(row.getCell(index + 1))));
      sourceRows.push(row.number);
    }
  }
  return rowsFromMatrix(matrix, sourceRows);
}

module.exports = {
  MAX_COLUMNS,
  MAX_INPUT_BYTES,
  MAX_ROWS,
  parseCsv,
  parseJson,
  parseTabular
};
