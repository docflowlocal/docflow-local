"use strict";

// SPDX-License-Identifier: AGPL-3.0-or-later

const crypto = require("crypto");
const path = require("path");
const { parseTabular, MAX_INPUT_BYTES, MAX_ROWS } = require("./data");
const { applyRulesDetailed, evaluateExpression } = require("./expression");
const {
  applyTemplateFilter,
  extractDocxTemplateInfo,
  renderDocxTemplate
} = require("./template-engine");
const {
  PLUGIN_API_VERSION,
  PluginRegistry,
  createPluginRegistry
} = require("./plugin-sdk");
const {
  ERROR_CODES,
  GENERATE_REQUEST_KEYS,
  SCHEMA_VERSION,
  DocFlowError,
  assertKnownProperties,
  assertSchemaVersion
} = require("./contracts");
const { assertGenerateRequest } = require("./request-validator");

const CORE_VERSION = require("../package.json").version;
const DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_TEMPLATE_BYTES = 100 * 1024 * 1024;
const MAX_NAMING_PATTERN_LENGTH = 500;
const MAX_RELATIVE_PATH_BYTES = 240;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

class ValidationError extends DocFlowError {
  constructor(message, validation) {
    super(ERROR_CODES.VALIDATION_FAILED, message, {
      status: 422,
      details: validation
    });
    this.name = "ValidationError";
    this.validation = validation;
  }
}

function wrapError(error, code, status = 400, details = undefined) {
  if (error instanceof DocFlowError) return error;
  return new DocFlowError(code, error.message || String(error), {
    status,
    details,
    cause: error
  });
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertSafeRecord(value, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`${label} contains a forbidden key: ${key}`);
  }
  return value;
}

function bytesDescriptor(value, fallbackFilename, label, maximumBytes) {
  let filename = fallbackFilename;
  let bytes = value;
  if (isRecord(value) && ("bytes" in value || "data" in value || "content" in value)) {
    filename = value.filename || value.name || fallbackFilename;
    bytes = value.bytes ?? value.data ?? value.content;
  }
  if (typeof bytes === "string") bytes = Buffer.from(bytes);
  let buffer;
  try {
    buffer = Buffer.from(bytes || []);
  } catch (_error) {
    throw new TypeError(`${label} bytes must be a Buffer, Uint8Array, or string`);
  }
  if (!buffer.length) throw new Error(`${label} is empty`);
  if (buffer.length > maximumBytes) {
    throw new Error(`${label} exceeds the ${Math.floor(maximumBytes / 1024 / 1024)} MB limit`);
  }
  return { filename: path.basename(String(filename || fallbackFilename)), bytes: buffer };
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError("rows must be an array");
  if (rows.length > MAX_ROWS) throw new Error(`Data exceeds the ${MAX_ROWS}-row limit`);
  const parsed = parseTabular("rows.json", Buffer.from(JSON.stringify(rows)));
  return parsed;
}

function mapRow(source, mappings = {}) {
  assertSafeRecord(source, "data row");
  assertSafeRecord(mappings, "mappings");
  const row = { ...source };
  for (const [rawTarget, mapping] of Object.entries(mappings)) {
    const target = String(rawTarget || "").trim();
    if (!target) continue;
    if (FORBIDDEN_KEYS.has(target)) throw new Error(`mappings contains a forbidden target: ${target}`);
    if (typeof mapping === "string") {
      row[target] = source[mapping] ?? "";
    } else if (isRecord(mapping)) {
      if (mapping.kind === "literal") row[target] = mapping.value ?? "";
      else if (mapping.kind === "expression") row[target] = evaluateExpression(String(mapping.expression || ""), row);
      else row[target] = source[mapping.source] ?? "";
    } else if (mapping == null) {
      row[target] = "";
    } else {
      throw new TypeError(`mapping for "${target}" is invalid`);
    }
  }
  return row;
}

function patternFields(pattern) {
  const fields = new Set();
  for (const match of String(pattern || "").matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const field = match[1].split("|")[0].trim();
    if (field) fields.add(field);
  }
  return [...fields];
}

function outputPatterns(job) {
  if (job.output != null && !isRecord(job.output)) {
    throw new DocFlowError(ERROR_CODES.INVALID_REQUEST, "output must be an object");
  }
  const output = job.output || {};
  if (output.onConflict != null && !["error", "suffix", "overwrite"].includes(output.onConflict)) {
    throw new DocFlowError(
      ERROR_CODES.INVALID_REQUEST,
      'output.onConflict must be "error", "suffix", or "overwrite"'
    );
  }
  const pattern = String(output.pattern || job.namingPattern || "document-{{index}}")
    .slice(0, MAX_NAMING_PATTERN_LENGTH);
  const folderPattern = String(output.folderPattern || job.folderPattern || "")
    .slice(0, MAX_NAMING_PATTERN_LENGTH);
  return { pattern, folderPattern };
}

function valueAt(row, name) {
  if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  let value = row;
  for (const segment of String(name).split(".").map(item => item.trim()).filter(Boolean)) {
    if (value == null || !Object.prototype.hasOwnProperty.call(Object(value), segment)) return "";
    value = value[segment];
  }
  return value ?? "";
}

function renderNamingPattern(pattern, row, formatters) {
  return String(pattern).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawExpression) => {
    const [rawField, ...filters] = rawExpression.split("|");
    let value = valueAt(row, rawField.trim());
    for (const filter of filters.map(item => item.trim()).filter(Boolean)) {
      value = applyTemplateFilter(value, filter, formatters, row);
    }
    if (Array.isArray(value) || isRecord(value)) return "";
    return String(value ?? "");
  });
}

function safePathComponent(value, fallback = "document") {
  let text = String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/[\\:*?"<>|\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[ .]+|[ .]+$/g, "")
    .replace(/\.{2,}/g, ".");
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(text)) text = `_${text}`;
  return (text || fallback).slice(0, 100);
}

function boundedRelativePath(value) {
  const rawParts = String(value || "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(part => part && part !== "." && part !== "..")
    .slice(0, 12);
  const parts = rawParts.map((part, index) => safePathComponent(part, index === rawParts.length - 1 ? "document" : "folder"));
  let result = (parts.join("/") || "document").replace(/\.docx$/i, "");
  result = `${result}.docx`;
  if (Buffer.byteLength(result, "utf8") <= MAX_RELATIVE_PATH_BYTES) return result;
  const suffix = `-${sha256(Buffer.from(result)).slice(0, 10)}.docx`;
  const characters = Array.from(result.slice(0, -5));
  while (characters.length && Buffer.byteLength(`${characters.join("")}${suffix}`, "utf8") > MAX_RELATIVE_PATH_BYTES) {
    characters.pop();
  }
  return `${characters.join("").replace(/[ .]+$/, "") || "document"}${suffix}`;
}

function uniqueRelativePath(candidate, usedPaths) {
  let relativePath = boundedRelativePath(candidate);
  let key = relativePath.normalize("NFC").toLocaleLowerCase("en-US");
  if (!usedPaths.has(key)) {
    usedPaths.add(key);
    return relativePath;
  }
  const base = relativePath.slice(0, -5);
  for (let index = 2; index < Number.MAX_SAFE_INTEGER; index += 1) {
    relativePath = boundedRelativePath(`${base}-${index}.docx`);
    key = relativePath.normalize("NFC").toLocaleLowerCase("en-US");
    if (!usedPaths.has(key)) {
      usedPaths.add(key);
      return relativePath;
    }
  }
  throw new Error("Unable to create a unique output path");
}

function reserveRelativePath(candidate, usedPaths, onConflict = "suffix") {
  const normalized = boundedRelativePath(candidate);
  const key = normalized.normalize("NFC").toLocaleLowerCase("en-US");
  if (usedPaths.has(key) && onConflict === "error") {
    throw new DocFlowError(
      ERROR_CODES.OUTPUT_CONFLICT,
      `Generated output path conflicts with an earlier artifact: ${normalized}`,
      { status: 409, details: { relativePath: normalized } }
    );
  }
  // "overwrite" applies only when a host persists artifacts to an existing
  // destination. Within one streamed job every artifact remains addressable,
  // so duplicate in-job paths are still safely suffixed.
  return uniqueRelativePath(candidate, usedPaths);
}

function normalizeTransformSpecs(transforms) {
  if (transforms == null) return [];
  if (!Array.isArray(transforms)) throw new TypeError("transforms must be an array");
  return transforms.map(spec => {
    if (typeof spec === "string") return { name: spec, options: {} };
    if (!isRecord(spec) || !spec.name) throw new TypeError("each transform must have a name");
    return { name: String(spec.name), options: spec.options ?? {} };
  });
}

function normalizeRuleList(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((rule, index) => {
    if (!isRecord(rule)) throw new TypeError(`${label}[${index}] must be an object`);
    const name = String(rule.name || "").trim();
    if (!name) throw new TypeError(`${label}[${index}].name is required`);
    if (FORBIDDEN_KEYS.has(name)) throw new Error(`${label} contains a forbidden field name: ${name}`);
    if (!String(rule.expression || "").trim()) {
      throw new TypeError(`${label}[${index}].expression is required`);
    }
    return rule;
  });
}

function normalizeMappings(value) {
  if (value == null) return {};
  const normalizeMapping = (mapping, label) => {
    if (typeof mapping === "string" || mapping == null) return mapping;
    if (!isRecord(mapping)) throw new TypeError(`${label} must be a string, null, or object`);
    const allowed = new Set(["kind", "source", "value", "expression"]);
    const unknown = Object.keys(mapping).filter(key => !allowed.has(key));
    if (unknown.length) throw new TypeError(`${label} contains unknown properties: ${unknown.join(", ")}`);
    const kind = mapping.kind
      || (Object.prototype.hasOwnProperty.call(mapping, "source") ? "source" : null)
      || (Object.prototype.hasOwnProperty.call(mapping, "expression") ? "expression" : null);
    if (kind === "source") {
      if (!String(mapping.source || "").trim()) throw new TypeError(`${label}.source is required`);
      return { kind, source: String(mapping.source) };
    }
    if (kind === "expression") {
      if (!String(mapping.expression || "").trim()) throw new TypeError(`${label}.expression is required`);
      return { kind, expression: String(mapping.expression) };
    }
    if (kind === "literal") return { kind, value: mapping.value ?? "" };
    throw new TypeError(`${label}.kind must be source, expression, or literal`);
  };
  if (Array.isArray(value)) {
    const mapped = Object.create(null);
    value.forEach((entry, index) => {
      if (!isRecord(entry)) throw new TypeError("mapping entries must be objects");
      const allowed = new Set(["target", "templateField", "field", "kind", "source", "value", "expression"]);
      const unknown = Object.keys(entry).filter(key => !allowed.has(key));
      if (unknown.length) throw new TypeError(`mappings[${index}] contains unknown properties: ${unknown.join(", ")}`);
      const targetKeys = ["target", "templateField", "field"]
        .filter(key => Object.prototype.hasOwnProperty.call(entry, key));
      if (targetKeys.length !== 1) {
        throw new TypeError(`mappings[${index}] must contain exactly one target, templateField, or field`);
      }
      const target = entry[targetKeys[0]];
      if (!target) throw new TypeError("mapping entry is missing target/templateField");
      if (FORBIDDEN_KEYS.has(String(target))) throw new Error(`mappings contains a forbidden target: ${target}`);
      const mapping = Object.fromEntries(
        Object.entries(entry).filter(([key]) => !["target", "templateField", "field"].includes(key))
      );
      mapped[target] = normalizeMapping(mapping, `mappings[${index}]`);
    });
    return mapped;
  }
  const source = assertSafeRecord(value, "mappings");
  const mapped = Object.create(null);
  for (const [target, mapping] of Object.entries(source)) {
    if (!String(target).trim() || FORBIDDEN_KEYS.has(target)) {
      throw new Error(`mappings contains a forbidden or blank target: ${target}`);
    }
    mapped[target] = normalizeMapping(mapping, `mappings.${target}`);
  }
  return mapped;
}

function buildBuiltinRegistry(registry) {
  const tabular = extensions => ({
    extensions,
    parse: ({ filename, bytes }) => parseTabular(filename, bytes)
  });
  registry.registerDataSource("json", tabular([".json"]));
  registry.registerDataSource("csv", tabular([".csv"]));
  registry.registerDataSource("excel", tabular([".xlsx", ".xlsm"]));
  return registry;
}

class DocFlowEngine {
  constructor(options = {}) {
    this.registry = options.registry || buildBuiltinRegistry(createPluginRegistry());
    if (!(this.registry instanceof PluginRegistry)) {
      throw new TypeError("registry must be a PluginRegistry");
    }
    for (const plugin of options.plugins || []) this.registry.use(plugin);
  }

  async #parseData(job) {
    if (job.rows != null) {
      try {
        return await normalizeRows(job.rows);
      } catch (error) {
        throw wrapError(error, ERROR_CODES.DATA_INVALID);
      }
    }
    let input;
    try {
      input = bytesDescriptor(job.data, job.dataFilename || "data.json", "Data file", MAX_INPUT_BYTES);
    } catch (error) {
      throw wrapError(
        error,
        /exceeds/.test(error.message || "") ? ERROR_CODES.DATA_LIMIT : ERROR_CODES.DATA_INVALID,
        /exceeds/.test(error.message || "") ? 413 : 400
      );
    }
    const selectedName = job.dataSource ? String(job.dataSource) : null;
    const match = selectedName
      ? [selectedName, this.registry.getDataSource(selectedName)]
      : this.registry.findDataSource(input.filename);
    if (!match?.[1]) {
      throw new DocFlowError(
        ERROR_CODES.DATA_INVALID,
        `No data-source plugin accepts "${input.filename}"`
      );
    }
    let parsed;
    try {
      parsed = await match[1].parse({
        filename: input.filename,
        bytes: Buffer.from(input.bytes),
        options: job.dataSourceOptions || {},
        apiVersion: PLUGIN_API_VERSION
      });
    } catch (error) {
      throw wrapError(
        error,
        ["json", "csv", "excel"].includes(match[0]) ? ERROR_CODES.DATA_INVALID : ERROR_CODES.PLUGIN_FAILED
      );
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.rows)) {
      throw new DocFlowError(
        ["json", "csv", "excel"].includes(match[0]) ? ERROR_CODES.DATA_INVALID : ERROR_CODES.PLUGIN_FAILED,
        `data-source "${match[0]}" returned an invalid result`
      );
    }
    if (parsed.rows.length > MAX_ROWS) {
      throw new DocFlowError(
        ERROR_CODES.DATA_LIMIT,
        `Data exceeds the ${MAX_ROWS}-row limit`,
        { status: 413 }
      );
    }
    return {
      headers: Array.isArray(parsed.headers) ? parsed.headers.map(String) : [],
      rows: parsed.rows,
      sourceRows: Array.isArray(parsed.sourceRows)
        ? parsed.sourceRows
        : parsed.rows.map((_row, index) => index + 1),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : []
    };
  }

  #template(job) {
    let template;
    try {
      template = bytesDescriptor(
        job.template,
        job.templateFilename || "template.docx",
        "Template",
        MAX_TEMPLATE_BYTES
      );
    } catch (error) {
      throw wrapError(error, ERROR_CODES.TEMPLATE_INVALID, /exceeds/.test(error.message || "") ? 413 : 400);
    }
    if (path.extname(template.filename).toLowerCase() !== ".docx") {
      throw new DocFlowError(
        ERROR_CODES.TEMPLATE_INVALID,
        "DocFlow Core v1 generation supports one DOCX template"
      );
    }
    return template;
  }

  async inspectData(input, options = {}) {
    const job = isRecord(input) && ("data" in input || "rows" in input)
      ? input
      : { data: input, ...options };
    const parsed = await this.#parseData(job);
    return {
      schemaVersion: SCHEMA_VERSION,
      kind: "data",
      headers: parsed.headers,
      rowCount: parsed.rows.length,
      sourceRows: parsed.sourceRows,
      warnings: parsed.warnings,
      sample: parsed.rows.slice(0, Math.min(5, Number(job.sampleSize) || 5))
    };
  }

  async inspectTemplate(input, options = {}) {
    const job = isRecord(input) && ("template" in input)
      ? input
      : { template: input, ...options };
    const template = this.#template(job);
    let info;
    try {
      info = extractDocxTemplateInfo(template.bytes);
    } catch (error) {
      throw wrapError(
        error,
        /unsafe|不安全|活动|外部/.test(error.message || "")
          ? ERROR_CODES.TEMPLATE_UNSAFE
          : ERROR_CODES.TEMPLATE_INVALID
      );
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      kind: "template",
      templateKind: "DOCX",
      filename: template.filename,
      bytes: template.bytes.length,
      sha256: sha256(template.bytes),
      fields: info.fields,
      fieldDetails: info.fieldDetails,
      conditions: info.conditions,
      assets: info.assets
    };
  }

  async inspect(input = {}) {
    if (!isRecord(input)) throw new TypeError("inspect input must be an object");
    const result = {};
    if (input.data != null || input.rows != null) result.data = await this.inspectData(input);
    if (input.template != null) result.template = await this.inspectTemplate(input);
    if (!result.data && !result.template) throw new Error("inspect requires data/rows and/or template");
    return { schemaVersion: SCHEMA_VERSION, ...result };
  }

  async #prepare(job) {
    if (!isRecord(job)) throw new TypeError("generation job must be an object");
    assertGenerateRequest(job);
    assertKnownProperties(job, GENERATE_REQUEST_KEYS, "generation request");
    assertSchemaVersion(job.schemaVersion, "generation request");
    if (job.data != null) {
      const data = assertSafeRecord(job.data, "generation request data");
      const unknown = Object.keys(data).filter(key => !["filename", "mediaType", "bytes"].includes(key));
      if (!String(data.filename || "").trim() || !Object.prototype.hasOwnProperty.call(data, "bytes") || unknown.length) {
        throw new DocFlowError(
          ERROR_CODES.INVALID_REQUEST,
          "generation request data must be a {filename, bytes} descriptor",
          { details: unknown.length ? { unknownProperties: unknown } : undefined }
        );
      }
    }
    {
      const template = assertSafeRecord(job.template, "generation request template");
      const unknown = Object.keys(template).filter(key => !["filename", "mediaType", "bytes"].includes(key));
      if (!String(template.filename || "").trim() || !Object.prototype.hasOwnProperty.call(template, "bytes") || unknown.length) {
        throw new DocFlowError(
          ERROR_CODES.INVALID_REQUEST,
          "generation request template must be a {filename, bytes} descriptor",
          { details: unknown.length ? { unknownProperties: unknown } : undefined }
        );
      }
    }
    const parsed = await this.#parseData(job);
    const template = this.#template(job);
    let templateInfo;
    try {
      templateInfo = extractDocxTemplateInfo(template.bytes);
    } catch (error) {
      throw wrapError(
        error,
        /unsafe|不安全|活动|外部/.test(error.message || "")
          ? ERROR_CODES.TEMPLATE_UNSAFE
          : ERROR_CODES.TEMPLATE_INVALID
      );
    }
    const mappings = normalizeMappings(job.mappings);
    const computedFields = normalizeRuleList(job.computedFields, "computedFields");
    const conditionalFields = normalizeRuleList(job.conditionalFields, "conditionalFields");
    const transformSpecs = normalizeTransformSpecs(job.transforms);
    const rows = [];
    const preparationErrors = [];

    for (let rowIndex = 0; rowIndex < parsed.rows.length; rowIndex += 1) {
      const source = parsed.rows[rowIndex];
      try {
        let row = mapRow(source, mappings);
        row = {
          ...row,
          ...(Object.prototype.hasOwnProperty.call(row, "index") ? {} : { index: rowIndex + 1 }),
          ...(Object.prototype.hasOwnProperty.call(row, "rowIndex") ? {} : { rowIndex }),
          ...(Object.prototype.hasOwnProperty.call(row, "sourceRow") ? {} : { sourceRow: parsed.sourceRows[rowIndex] })
        };
        for (const spec of transformSpecs) {
          const transform = this.registry.getTransform(spec.name);
          if (!transform) throw new Error(`Unknown transform "${spec.name}"`);
          const transformed = await transform(row, {
            options: spec.options,
            rowIndex,
            sourceRow: parsed.sourceRows[rowIndex],
            apiVersion: PLUGIN_API_VERSION
          });
          if (transformed !== undefined) row = assertSafeRecord(transformed, `transform "${spec.name}" result`);
        }
        rows.push(row);
      } catch (error) {
        rows.push({ ...source, index: rowIndex + 1, rowIndex, sourceRow: parsed.sourceRows[rowIndex] });
        preparationErrors.push({
          rowIndex,
          field: "mapping/transform",
          kind: "preparation",
          message: error.message || String(error)
        });
      }
    }

    const ruled = applyRulesDetailed(rows, computedFields, conditionalFields);
    return {
      parsed,
      template,
      templateInfo,
      rows: ruled.rows,
      errors: [...preparationErrors, ...ruled.errors],
      formatters: this.registry.formatters()
    };
  }

  #validatePrepared(job, prepared) {
    const { pattern: namingPattern, folderPattern } = outputPatterns(job);
    if (job.requiredFields != null && !Array.isArray(job.requiredFields)) {
      throw new DocFlowError(ERROR_CODES.INVALID_REQUEST, "requiredFields must be an array");
    }
    const requiredFields = [...new Set([
      ...(job.requiredFields || []).map(value => String(value || "").trim()).filter(Boolean),
      ...patternFields(namingPattern),
      ...patternFields(folderPattern)
    ])];
    const issues = [];
    const validIndexes = [];
    const nestedArrayFields = new Set((prepared.templateInfo.fieldDetails || [])
      .filter(detail => (
        detail.topLevel === false
        && detail.scopes.length > 0
        && detail.scopes.every(scopePath => scopePath.some(scope => (
          prepared.rows.some(row => Array.isArray(valueAt(row, scope)))
        )))
      ))
      .map(detail => detail.name));
    const missingTemplateFields = prepared.templateInfo.fields.filter(field => (
      !prepared.parsed.headers.includes(field)
      && !nestedArrayFields.has(field)
      && !Object.prototype.hasOwnProperty.call(normalizeMappings(job.mappings), field)
      && !(job.computedFields || []).some(rule => String(rule?.name || "").trim() === field)
      && !(job.conditionalFields || []).some(rule => String(rule?.name || "").trim() === field)
      && !["index", "rowIndex", "sourceRow"].includes(field)
    ));

    prepared.rows.forEach((row, rowIndex) => {
      const namingFields = new Set([
        ...patternFields(namingPattern),
        ...patternFields(folderPattern)
      ]);
      const missingFields = requiredFields.filter(field => {
        const value = valueAt(row, field);
        if (value == null || (typeof value === "string" && !value.trim())) return true;
        if (namingFields.has(field)) return Array.isArray(value) || isRecord(value);
        return Array.isArray(value) && value.length === 0;
      });
      const ruleErrors = prepared.errors
        .filter(error => error.rowIndex === rowIndex)
        .map(error => ({ field: error.field, kind: error.kind, message: error.message }));
      if (missingFields.length || ruleErrors.length) {
        issues.push({
          rowIndex,
          sourceRow: prepared.parsed.sourceRows[rowIndex],
          missingFields,
          errors: ruleErrors
        });
      } else {
        validIndexes.push(rowIndex);
      }
    });

    return {
      ok: issues.length === 0 && prepared.rows.length > 0,
      rowCount: prepared.rows.length,
      validRows: validIndexes.length,
      invalidRows: issues.length,
      validIndexes,
      requiredFields,
      templateFields: prepared.templateInfo.fields,
      unmappedTemplateFields: missingTemplateFields,
      configurationErrors: prepared.rows.length ? [] : ["Data contains no rows"],
      issues,
      warnings: [
        ...prepared.parsed.warnings,
        ...missingTemplateFields.map(field => `Template field "${field}" is not present in the input schema`)
      ]
    };
  }

  async validate(job) {
    const prepared = await this.#prepare(job);
    const result = this.#validatePrepared(job, prepared);
    return {
      schemaVersion: SCHEMA_VERSION,
      ...result,
      template: {
        filename: prepared.template.filename,
        sha256: sha256(prepared.template.bytes)
      }
    };
  }

  generate(job) {
    const engine = this;
    return (async function* generateArtifacts() {
      const prepared = await engine.#prepare(job);
      const validation = engine.#validatePrepared(job, prepared);
      if (job.strict === true && !validation.ok) {
        throw new ValidationError("Generation stopped because validation failed", validation);
      }
      if (!validation.validIndexes.length) {
        throw new ValidationError("No valid rows are eligible for generation", validation);
      }
      const { pattern: namingPattern, folderPattern } = outputPatterns(job);
      const onConflict = job.output?.onConflict || "suffix";
      const usedPaths = new Set();
      for (const rowIndex of validation.validIndexes) {
        const row = prepared.rows[rowIndex];
        const renderedFolder = renderNamingPattern(folderPattern, row, prepared.formatters);
        const renderedBase = renderNamingPattern(namingPattern, row, prepared.formatters);
        const renderedName = renderedFolder ? `${renderedFolder}/${renderedBase}` : renderedBase;
        const relativePath = reserveRelativePath(renderedName, usedPaths, onConflict);
        let rendered;
        try {
          rendered = await renderDocxTemplate(prepared.template.bytes, row, {
            assets: job.assets || {},
            signature: job.signature,
            imageWidth: job.imageWidth,
            imageHeight: job.imageHeight,
            formatters: prepared.formatters
          });
        } catch (error) {
          throw wrapError(error, ERROR_CODES.TEMPLATE_INVALID, 400, {
            rowIndex,
            sourceRow: prepared.parsed.sourceRows[rowIndex]
          });
        }
        const bytes = Buffer.from(rendered.buffer);
        yield Object.freeze({
          schemaVersion: SCHEMA_VERSION,
          relativePath,
          bytes,
          mediaType: DOCX_MEDIA_TYPE,
          rowIndex,
          sha256: sha256(bytes)
        });
      }
    })();
  }

  async output(artifacts, sinkName, options = {}) {
    const sink = this.registry.getOutputSink(sinkName);
    if (!sink) throw new Error(`Unknown output-sink "${sinkName}"`);
    return sink.write(artifacts, {
      options,
      apiVersion: PLUGIN_API_VERSION
    });
  }
}

function createEngine(options = {}) {
  return new DocFlowEngine(options);
}

module.exports = {
  CORE_VERSION,
  DOCX_MEDIA_TYPE,
  ERROR_CODES,
  SCHEMA_VERSION,
  DocFlowEngine,
  DocFlowError,
  PluginRegistry,
  ValidationError,
  createEngine,
  createPluginRegistry,
  pluginApiVersion: PLUGIN_API_VERSION
};
