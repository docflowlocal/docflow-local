"use strict";

const crypto = require("crypto");
const path = require("path");
const AdmZip = require("adm-zip");

const FORMAT = "docflow-local-project";
const SCHEMA_VERSION = 1;
const PRIVACY_EXCLUSIONS = Object.freeze(["rows", "sourceRows", "signature", "assets"]);
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const TEMPLATE_KINDS = new Set(["DOCX", "PDF"]);
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const PROJECT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const LIMITS = Object.freeze({
  MAX_ARCHIVE_BYTES: 128 * 1024 * 1024,
  MAX_ENTRY_COUNT: 25,
  MAX_MANIFEST_BYTES: 512 * 1024,
  MAX_TEMPLATE_COUNT: 24,
  MAX_TEMPLATE_BYTES: 25 * 1024 * 1024,
  MAX_TOTAL_TEMPLATE_BYTES: 100 * 1024 * 1024,
  MAX_TOTAL_UNCOMPRESSED_BYTES: (100 * 1024 * 1024) + (512 * 1024),
  MAX_HEADER_COUNT: 1_000,
  MAX_MAPPING_COUNT: 1_000,
  MAX_RULE_COUNT: 200
});

class ProjectFormatError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProjectFormatError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProjectFormatError(code, message);
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(value, label) {
  if (!isPlainRecord(value)) fail("INVALID_MANIFEST", `${label} must be a plain object`);
  return value;
}

function ownStringKeys(value, label) {
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== "string")) {
    fail("INVALID_MANIFEST", `${label} cannot contain symbol keys`);
  }
  for (const key of keys) {
    if (DANGEROUS_KEYS.has(key)) {
      fail("UNSAFE_MANIFEST", `${label} contains a forbidden key: ${key}`);
    }
  }
  return keys;
}

function enforceKeys(value, allowed, label) {
  for (const key of ownStringKeys(value, label)) {
    if (!allowed.has(key)) fail("UNKNOWN_MANIFEST_FIELD", `${label} contains an unknown field: ${key}`);
  }
}

function stringValue(value, label, options = {}) {
  const { required = false, maxBytes = 4_096, trim = false } = options;
  if (value == null) {
    if (required) fail("INVALID_MANIFEST", `${label} is required`);
    return undefined;
  }
  if (typeof value !== "string") fail("INVALID_MANIFEST", `${label} must be a string`);
  const result = trim ? value.trim() : value;
  if (required && !result) fail("INVALID_MANIFEST", `${label} cannot be empty`);
  if (Buffer.byteLength(result, "utf8") > maxBytes) {
    fail("MANIFEST_LIMIT", `${label} exceeds the ${maxBytes}-byte limit`);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
    fail("INVALID_MANIFEST", `${label} contains control characters`);
  }
  return result;
}

function booleanValue(value, label, fallback) {
  if (value == null && fallback !== undefined) return fallback;
  if (typeof value !== "boolean") fail("INVALID_MANIFEST", `${label} must be a boolean`);
  return value;
}

function integerValue(value, label, options = {}) {
  const { min = 0, max = Number.MAX_SAFE_INTEGER, fallback } = options;
  if (value == null && fallback !== undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail("INVALID_MANIFEST", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function scalarValue(value, label, maxStringBytes = 65_536) {
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("INVALID_MANIFEST", `${label} must be finite`);
    return value;
  }
  if (typeof value === "string") return stringValue(value, label, { maxBytes: maxStringBytes });
  fail("INVALID_MANIFEST", `${label} must be a string, number, boolean or null`);
}

function stringArray(value, label, options = {}) {
  const { required = false, maxItems = 1_000, maxItemBytes = 1_024 } = options;
  if (value == null) {
    if (required) fail("INVALID_MANIFEST", `${label} is required`);
    return [];
  }
  if (!Array.isArray(value)) fail("INVALID_MANIFEST", `${label} must be an array`);
  if (value.length > maxItems) fail("MANIFEST_LIMIT", `${label} contains too many items`);
  const output = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = stringValue(value[index], `${label}[${index}]`, {
      required: true,
      trim: true,
      maxBytes: maxItemBytes
    });
    const key = item.normalize("NFC");
    if (seen.has(key)) fail("INVALID_MANIFEST", `${label} contains a duplicate value: ${item}`);
    seen.add(key);
    output.push(item);
  }
  return output;
}

function projectKeyValue(value, label, required = true) {
  const result = stringValue(value, label, { required, trim: true, maxBytes: 128 });
  if (result === undefined) return undefined;
  if (!PROJECT_KEY_PATTERN.test(result) || DANGEROUS_KEYS.has(result)) {
    fail("INVALID_PROJECT_KEY", `${label} is not a valid project key`);
  }
  return result;
}

function hashValue(value, label, required = false) {
  const result = stringValue(value, label, { required, trim: true, maxBytes: 64 });
  if (result === undefined) return undefined;
  const normalized = result.toLowerCase();
  if (!HASH_PATTERN.test(normalized)) fail("INVALID_HASH", `${label} must be a SHA-256 hex digest`);
  return normalized;
}

function isoDateValue(value, label) {
  const result = stringValue(value, label, { maxBytes: 64, trim: true });
  if (result === undefined) return undefined;
  const timestamp = Date.parse(result);
  if (!Number.isFinite(timestamp) || !/^\d{4}-\d{2}-\d{2}T/.test(result)) {
    fail("INVALID_MANIFEST", `${label} must be an ISO-8601 timestamp`);
  }
  return result;
}

function safeFilename(value, label, kind) {
  const filename = stringValue(value, label, { required: true, trim: true, maxBytes: 240 });
  if (
    filename === "."
    || filename === ".."
    || filename !== path.posix.basename(filename)
    || filename.includes("\\")
    || filename.includes("/")
    || filename.normalize("NFC") !== filename
  ) {
    fail("INVALID_TEMPLATE", `${label} must be a normalized base filename`);
  }
  const extension = path.posix.extname(filename).slice(1).toUpperCase();
  if (kind && extension !== kind) {
    fail("INVALID_TEMPLATE", `${label} extension does not match ${kind}`);
  }
  if (!TEMPLATE_KINDS.has(extension)) {
    fail("INVALID_TEMPLATE", `${label} must end in .docx or .pdf`);
  }
  return filename;
}

function kindValue(value, label, filename) {
  const inferred = filename ? path.posix.extname(filename).slice(1).toUpperCase() : "";
  const kind = value == null
    ? inferred
    : stringValue(value, label, { required: true, trim: true, maxBytes: 8 }).toUpperCase();
  if (!TEMPLATE_KINDS.has(kind)) fail("INVALID_TEMPLATE", `${label} must be DOCX or PDF`);
  return kind;
}

function normalizeMappings(value) {
  if (value == null) return {};
  const source = record(value, "manifest.workflow.mappings");
  const keys = ownStringKeys(source, "manifest.workflow.mappings");
  if (keys.length > LIMITS.MAX_MAPPING_COUNT) fail("MANIFEST_LIMIT", "Too many field mappings");
  const output = {};
  for (const target of keys) {
    stringValue(target, "mapping target", { required: true, trim: true, maxBytes: 1_024 });
    const mapping = source[target];
    if (typeof mapping === "string") {
      output[target] = stringValue(mapping, `mapping ${target}`, { maxBytes: 4_096 });
      continue;
    }
    const definition = record(mapping, `mapping ${target}`);
    enforceKeys(
      definition,
      new Set(["kind", "source", "value", "expression"]),
      `mapping ${target}`
    );
    const kind = stringValue(definition.kind, `mapping ${target}.kind`, {
      trim: true,
      maxBytes: 32
    });
    if (kind != null && !["literal", "expression", "source"].includes(kind)) {
      fail("INVALID_MANIFEST", `mapping ${target}.kind is unsupported`);
    }
    const normalized = {};
    if (kind != null) normalized.kind = kind;
    if (definition.source != null) {
      normalized.source = stringValue(definition.source, `mapping ${target}.source`, {
        required: true,
        trim: true,
        maxBytes: 4_096
      });
    }
    if (Object.prototype.hasOwnProperty.call(definition, "value")) {
      normalized.value = scalarValue(definition.value, `mapping ${target}.value`);
    }
    if (definition.expression != null) {
      normalized.expression = stringValue(definition.expression, `mapping ${target}.expression`, {
        required: true,
        trim: true,
        maxBytes: 16_384
      });
    }
    if (kind === "literal" && !Object.prototype.hasOwnProperty.call(normalized, "value")) {
      normalized.value = "";
    }
    if (kind === "expression" && !normalized.expression) {
      fail("INVALID_MANIFEST", `mapping ${target}.expression is required`);
    }
    if ((kind === "source" || kind == null) && !normalized.source) {
      fail("INVALID_MANIFEST", `mapping ${target}.source is required`);
    }
    output[target] = normalized;
  }
  return output;
}

function normalizeRequiredOverrides(value) {
  if (value == null) return {};
  const source = record(value, "manifest.workflow.requiredOverrides");
  const keys = ownStringKeys(source, "manifest.workflow.requiredOverrides");
  if (keys.length > LIMITS.MAX_MAPPING_COUNT) fail("MANIFEST_LIMIT", "Too many required-field overrides");
  const output = {};
  for (const field of keys) {
    stringValue(field, "required override field", { required: true, trim: true, maxBytes: 1_024 });
    output[field] = booleanValue(source[field], `required override ${field}`);
  }
  return output;
}

function normalizeRules(value, kind) {
  if (value == null) return [];
  const label = `manifest.workflow.${kind}Fields`;
  if (!Array.isArray(value)) fail("INVALID_MANIFEST", `${label} must be an array`);
  if (value.length > LIMITS.MAX_RULE_COUNT) fail("MANIFEST_LIMIT", `${label} contains too many rules`);
  return value.map((rule, index) => {
    const itemLabel = `${label}[${index}]`;
    const source = record(rule, itemLabel);
    const allowed = kind === "computed"
      ? new Set(["name", "expression", "digits", "scope"])
      : new Set(["name", "expression", "scope", "whenTrue", "whenFalse"]);
    enforceKeys(source, allowed, itemLabel);
    const output = {
      name: stringValue(source.name, `${itemLabel}.name`, {
        required: true,
        trim: true,
        maxBytes: 1_024
      }),
      expression: stringValue(source.expression, `${itemLabel}.expression`, {
        required: true,
        trim: true,
        maxBytes: 16_384
      })
    };
    if (source.scope != null) {
      output.scope = projectKeyValue(source.scope, `${itemLabel}.scope`);
    }
    if (kind === "computed" && source.digits != null) {
      output.digits = integerValue(source.digits, `${itemLabel}.digits`, { min: 0, max: 12 });
    }
    if (kind === "conditional") {
      if (Object.prototype.hasOwnProperty.call(source, "whenTrue")) {
        output.whenTrue = scalarValue(source.whenTrue, `${itemLabel}.whenTrue`);
      }
      if (Object.prototype.hasOwnProperty.call(source, "whenFalse")) {
        output.whenFalse = scalarValue(source.whenFalse, `${itemLabel}.whenFalse`);
      }
    }
    return output;
  });
}

function normalizeSettings(value) {
  if (value == null) return {};
  const source = record(value, "manifest.workflow.settings");
  enforceKeys(
    source,
    new Set([
      "filenamePattern",
      "folderPattern",
      "skipBlank",
      "stopOnMissing",
      "validationReport",
      "includeSourceDocx",
      "mergePdfs",
      "flattenPdf",
      "signature",
      "assets"
    ]),
    "manifest.workflow.settings"
  );
  const output = {};
  for (const key of ["filenamePattern", "folderPattern"]) {
    if (source[key] != null) {
      output[key] = stringValue(source[key], `manifest.workflow.settings.${key}`, {
        maxBytes: 4_096
      });
    }
  }
  for (const key of [
    "skipBlank",
    "stopOnMissing",
    "validationReport",
    "includeSourceDocx",
    "mergePdfs",
    "flattenPdf"
  ]) {
    if (source[key] != null) {
      output[key] = booleanValue(source[key], `manifest.workflow.settings.${key}`);
    }
  }
  // signature and assets are intentionally discarded. They must be re-selected
  // for every run so project files never become an accidental customer-data store.
  return output;
}

function normalizeWorkflowTemplate(value, index, mode) {
  const label = `manifest.workflow.templates[${index}]`;
  const source = record(value, label);
  enforceKeys(
    source,
    new Set([
      "projectKey",
      "builtIn",
      "filename",
      "kind",
      "sha256",
      "selected",
      "order",
      "entry",
      "bytes"
    ]),
    label
  );
  const builtIn = booleanValue(source.builtIn, `${label}.builtIn`, false);
  const output = {
    projectKey: projectKeyValue(source.projectKey, `${label}.projectKey`),
    builtIn,
    selected: booleanValue(source.selected, `${label}.selected`, true),
    order: integerValue(source.order, `${label}.order`, { min: 0, max: 10_000, fallback: index })
  };
  if (source.filename != null) {
    const provisionalKind = kindValue(source.kind, `${label}.kind`, source.filename);
    output.filename = safeFilename(source.filename, `${label}.filename`, provisionalKind);
    output.kind = provisionalKind;
  } else if (source.kind != null) {
    output.kind = kindValue(source.kind, `${label}.kind`);
  }
  if (source.sha256 != null) output.sha256 = hashValue(source.sha256, `${label}.sha256`);
  if (source.entry != null) {
    output.entry = safeArchivePath(source.entry, `${label}.entry`);
  }
  if (source.bytes != null) {
    output.bytes = integerValue(source.bytes, `${label}.bytes`, {
      min: 1,
      max: LIMITS.MAX_TEMPLATE_BYTES
    });
  }
  if (builtIn) {
    if (output.entry != null || output.bytes != null) {
      fail("INVALID_MANIFEST", `${label} cannot embed a built-in template`);
    }
  } else if (mode === "parse") {
    if (!output.filename || !output.kind || !output.sha256 || !output.entry || !output.bytes) {
      fail("INVALID_MANIFEST", `${label} is missing embedded-template metadata`);
    }
  }
  return output;
}

function safeArchivePath(value, label = "ZIP entry") {
  const name = stringValue(value, label, { required: true, maxBytes: 512 });
  if (
    name.includes("\\")
    || name.startsWith("/")
    || /^[A-Za-z]:/.test(name)
    || name.includes("\ufffd")
    || name.normalize("NFC") !== name
  ) {
    fail("UNSAFE_ARCHIVE_PATH", `${label} is unsafe`);
  }
  const parts = name.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) {
    fail("UNSAFE_ARCHIVE_PATH", `${label} contains path traversal`);
  }
  return name;
}

function toTemplateBuffer(value, label, copy = true) {
  if (Buffer.isBuffer(value)) return copy ? Buffer.from(value) : value;
  if (ArrayBuffer.isView(value)) {
    const shared = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    return copy ? Buffer.from(shared) : shared;
  }
  if (value instanceof ArrayBuffer) {
    const shared = Buffer.from(value);
    return copy ? Buffer.from(shared) : shared;
  }
  fail("INVALID_TEMPLATE", `${label} must be a Buffer, Uint8Array or ArrayBuffer`);
}

function normalizeTemplateInputs(templates) {
  if (templates == null) return [];
  if (!Array.isArray(templates)) fail("INVALID_TEMPLATE", "templates must be an array");
  if (templates.length > LIMITS.MAX_TEMPLATE_COUNT) {
    fail("TEMPLATE_LIMIT", `A project can contain at most ${LIMITS.MAX_TEMPLATE_COUNT} custom templates`);
  }
  const output = [];
  const keys = new Set();
  const filenames = new Set();
  const entries = new Set();
  let totalBytes = 0;
  for (let index = 0; index < templates.length; index += 1) {
    const label = `templates[${index}]`;
    const source = record(templates[index], label);
    enforceKeys(
      source,
      new Set(["projectKey", "filename", "kind", "data", "buffer", "sha256"]),
      label
    );
    if (
      Object.prototype.hasOwnProperty.call(source, "data")
      && Object.prototype.hasOwnProperty.call(source, "buffer")
    ) {
      fail("INVALID_TEMPLATE", `${label} must not contain both data and buffer`);
    }
    const rawData = Object.prototype.hasOwnProperty.call(source, "data")
      ? source.data
      : source.buffer;
    const data = toTemplateBuffer(rawData, `${label}.data`);
    if (!data.length) fail("INVALID_TEMPLATE", `${label}.data cannot be empty`);
    if (data.length > LIMITS.MAX_TEMPLATE_BYTES) {
      fail("TEMPLATE_LIMIT", `${label} exceeds the ${LIMITS.MAX_TEMPLATE_BYTES}-byte limit`);
    }
    totalBytes += data.length;
    if (totalBytes > LIMITS.MAX_TOTAL_TEMPLATE_BYTES) {
      fail("TEMPLATE_LIMIT", "Custom templates exceed the total uncompressed size limit");
    }
    const kind = kindValue(source.kind, `${label}.kind`, source.filename);
    const filename = safeFilename(source.filename, `${label}.filename`, kind);
    const digest = sha256(data);
    const suppliedHash = hashValue(source.sha256, `${label}.sha256`);
    if (suppliedHash && suppliedHash !== digest) {
      fail("HASH_MISMATCH", `${label}.sha256 does not match its data`);
    }
    const projectKey = projectKeyValue(
      source.projectKey ?? `tpl_${sha256(Buffer.concat([
        Buffer.from(`${kind}\0${filename}\0`, "utf8"),
        data
      ])).slice(0, 24)}`,
      `${label}.projectKey`
    );
    const keyCollision = projectKey.normalize("NFC").toLowerCase();
    const filenameCollision = filename.normalize("NFC").toLowerCase();
    if (keys.has(keyCollision)) fail("DUPLICATE_TEMPLATE", `Duplicate template projectKey: ${projectKey}`);
    if (filenames.has(filenameCollision)) fail("DUPLICATE_TEMPLATE", `Duplicate template filename: ${filename}`);
    keys.add(keyCollision);
    filenames.add(filenameCollision);
    const entry = `templates/${sha256(Buffer.from(projectKey, "utf8")).slice(0, 32)}.${kind.toLowerCase()}`;
    if (entries.has(entry)) fail("DUPLICATE_TEMPLATE", `Duplicate template entry: ${entry}`);
    entries.add(entry);
    output.push({ projectKey, filename, kind, data, bytes: data.length, sha256: digest, entry });
  }
  return output;
}

function normalizeProject(value, mode) {
  const source = value == null ? {} : record(value, "manifest.project");
  enforceKeys(source, new Set(["id", "name", "createdAt", "updatedAt"]), "manifest.project");
  const output = {
    name: stringValue(source.name ?? "Untitled Project", "manifest.project.name", {
      required: true,
      trim: true,
      maxBytes: 512
    })
  };
  if (source.id != null) output.id = projectKeyValue(source.id, "manifest.project.id");
  if (mode === "parse" && !output.id) fail("INVALID_MANIFEST", "manifest.project.id is required");
  if (source.createdAt != null) output.createdAt = isoDateValue(source.createdAt, "manifest.project.createdAt");
  if (source.updatedAt != null) output.updatedAt = isoDateValue(source.updatedAt, "manifest.project.updatedAt");
  return output;
}

function normalizePrivacy(value, mode) {
  if (mode === "parse" && value == null) {
    fail("INVALID_MANIFEST", "manifest.privacy is required");
  }
  if (value != null) {
    const source = record(value, "manifest.privacy");
    enforceKeys(source, new Set(["containsCustomerData", "excluded"]), "manifest.privacy");
    if (source.containsCustomerData === true) {
      fail("PRIVACY_VIOLATION", "A .docflow project cannot contain customer data");
    }
    if (source.containsCustomerData != null) {
      booleanValue(source.containsCustomerData, "manifest.privacy.containsCustomerData");
    }
    if (source.excluded != null) {
      const excluded = stringArray(source.excluded, "manifest.privacy.excluded", {
        maxItems: 16,
        maxItemBytes: 64
      });
      for (const field of PRIVACY_EXCLUSIONS) {
        if (!excluded.includes(field)) {
          fail("PRIVACY_VIOLATION", `manifest.privacy.excluded must include ${field}`);
        }
      }
    }
  }
  return {
    containsCustomerData: false,
    excluded: [...PRIVACY_EXCLUSIONS]
  };
}

function mergeWorkflowTemplates(descriptors, embeddedTemplates, mode) {
  const descriptorKeys = new Set();
  for (const descriptor of descriptors) {
    const collision = descriptor.projectKey.normalize("NFC").toLowerCase();
    if (descriptorKeys.has(collision)) {
      fail("DUPLICATE_TEMPLATE", `Duplicate workflow template projectKey: ${descriptor.projectKey}`);
    }
    descriptorKeys.add(collision);
  }
  if (mode === "parse") return descriptors;

  const embeddedByKey = new Map(embeddedTemplates.map(template => [template.projectKey, template]));
  const used = new Set();
  const output = descriptors.map(descriptor => {
    if (descriptor.builtIn) {
      if (embeddedByKey.has(descriptor.projectKey)) {
        fail("INVALID_TEMPLATE", `Built-in template ${descriptor.projectKey} cannot have embedded data`);
      }
      return descriptor;
    }
    const embedded = embeddedByKey.get(descriptor.projectKey);
    if (!embedded) {
      fail("MISSING_TEMPLATE", `Custom template ${descriptor.projectKey} has no embedded data`);
    }
    if (descriptor.filename && descriptor.filename !== embedded.filename) {
      fail("INVALID_TEMPLATE", `Template filename mismatch for ${descriptor.projectKey}`);
    }
    if (descriptor.kind && descriptor.kind !== embedded.kind) {
      fail("INVALID_TEMPLATE", `Template kind mismatch for ${descriptor.projectKey}`);
    }
    if (descriptor.sha256 && descriptor.sha256 !== embedded.sha256) {
      fail("HASH_MISMATCH", `Template hash mismatch for ${descriptor.projectKey}`);
    }
    used.add(descriptor.projectKey);
    return {
      projectKey: embedded.projectKey,
      builtIn: false,
      filename: embedded.filename,
      kind: embedded.kind,
      sha256: embedded.sha256,
      selected: descriptor.selected,
      order: descriptor.order,
      entry: embedded.entry,
      bytes: embedded.bytes
    };
  });
  let nextOrder = output.reduce((maximum, item) => Math.max(maximum, item.order), -1) + 1;
  for (const embedded of embeddedTemplates) {
    if (used.has(embedded.projectKey)) continue;
    output.push({
      projectKey: embedded.projectKey,
      builtIn: false,
      filename: embedded.filename,
      kind: embedded.kind,
      sha256: embedded.sha256,
      selected: true,
      order: nextOrder,
      entry: embedded.entry,
      bytes: embedded.bytes
    });
    nextOrder += 1;
  }
  return output;
}

function normalizeWorkflow(value, embeddedTemplates, mode) {
  if (mode === "parse" && value == null) fail("INVALID_MANIFEST", "manifest.workflow is required");
  const source = value == null ? {} : record(value, "manifest.workflow");
  enforceKeys(
    source,
    new Set([
      "expectedHeaders",
      "mappings",
      "requiredFields",
      "unconfirmedFields",
      "requiredOverrides",
      "computedFields",
      "conditionalFields",
      "templates",
      "settings",
      "rows",
      "sourceRows",
      "signature",
      "assets"
    ]),
    "manifest.workflow"
  );
  let descriptors = [];
  if (source.templates != null) {
    if (!Array.isArray(source.templates)) {
      fail("INVALID_MANIFEST", "manifest.workflow.templates must be an array");
    }
    if (source.templates.length > LIMITS.MAX_TEMPLATE_COUNT + 16) {
      fail("MANIFEST_LIMIT", "manifest.workflow.templates contains too many templates");
    }
    descriptors = source.templates.map((item, index) => normalizeWorkflowTemplate(item, index, mode));
  }
  return {
    expectedHeaders: stringArray(source.expectedHeaders, "manifest.workflow.expectedHeaders", {
      maxItems: LIMITS.MAX_HEADER_COUNT,
      maxItemBytes: 1_024
    }),
    mappings: normalizeMappings(source.mappings),
    requiredFields: stringArray(source.requiredFields, "manifest.workflow.requiredFields", {
      maxItems: LIMITS.MAX_MAPPING_COUNT,
      maxItemBytes: 1_024
    }),
    unconfirmedFields: stringArray(source.unconfirmedFields, "manifest.workflow.unconfirmedFields", {
      maxItems: LIMITS.MAX_MAPPING_COUNT,
      maxItemBytes: 1_024
    }),
    requiredOverrides: normalizeRequiredOverrides(source.requiredOverrides),
    computedFields: normalizeRules(source.computedFields, "computed"),
    conditionalFields: normalizeRules(source.conditionalFields, "conditional"),
    templates: mergeWorkflowTemplates(descriptors, embeddedTemplates, mode),
    settings: normalizeSettings(source.settings)
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const key of Object.keys(value).sort()) output[key] = canonicalize(value[key]);
  return output;
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function normalizeManifest(manifest, embeddedTemplates, mode) {
  const source = record(manifest, "manifest");
  enforceKeys(
    source,
    new Set([
      "format",
      "schemaVersion",
      "project",
      "workflow",
      "privacy",
      "rows",
      "sourceRows",
      "signature",
      "assets"
    ]),
    "manifest"
  );
  if (mode === "parse") {
    if (source.format !== FORMAT) fail("INVALID_SCHEMA", `manifest.format must be ${FORMAT}`);
    if (source.schemaVersion !== SCHEMA_VERSION) {
      fail("INVALID_SCHEMA", `Unsupported .docflow schema version: ${source.schemaVersion}`);
    }
  } else {
    if (source.format != null && source.format !== FORMAT) {
      fail("INVALID_SCHEMA", `manifest.format must be ${FORMAT}`);
    }
    if (source.schemaVersion != null && source.schemaVersion !== SCHEMA_VERSION) {
      fail("INVALID_SCHEMA", `Unsupported .docflow schema version: ${source.schemaVersion}`);
    }
  }
  const project = normalizeProject(source.project, mode);
  const workflow = normalizeWorkflow(source.workflow, embeddedTemplates, mode);
  const privacy = normalizePrivacy(source.privacy, mode);
  if (!project.id) {
    project.id = `prj_${sha256(Buffer.from(stableStringify({
      name: project.name,
      workflow
    }), "utf8")).slice(0, 24)}`;
  }
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    project,
    workflow,
    privacy
  };
}

function addDeterministicFile(archive, entryName, data) {
  archive.addFile(entryName, data);
  const entry = archive.getEntry(entryName);
  if (entry) entry.header.time = new Date("2000-01-01T00:00:00.000Z");
}

function buildProjectArchive({ manifest, templates = [] } = {}) {
  const embeddedTemplates = normalizeTemplateInputs(templates);
  const normalizedManifest = normalizeManifest(manifest, embeddedTemplates, "build");
  const manifestBuffer = Buffer.from(`${JSON.stringify(canonicalize(normalizedManifest), null, 2)}\n`, "utf8");
  if (manifestBuffer.length > LIMITS.MAX_MANIFEST_BYTES) {
    fail("MANIFEST_LIMIT", "manifest.json exceeds the uncompressed size limit");
  }
  const totalUncompressed = manifestBuffer.length
    + embeddedTemplates.reduce((total, template) => total + template.bytes, 0);
  if (totalUncompressed > LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
    fail("ARCHIVE_LIMIT", "The project exceeds the total uncompressed size limit");
  }
  const archive = new AdmZip();
  addDeterministicFile(archive, "manifest.json", manifestBuffer);
  for (const template of embeddedTemplates) addDeterministicFile(archive, template.entry, template.data);
  const buffer = archive.toBuffer();
  if (buffer.length > LIMITS.MAX_ARCHIVE_BYTES) {
    fail("ARCHIVE_LIMIT", "The compressed .docflow archive exceeds the size limit");
  }
  return buffer;
}

function zipEntrySize(entry, property, label) {
  const value = entry?.header?.[property];
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("INVALID_ARCHIVE", `${label} has an invalid ${property}`);
  }
  return value;
}

function readEntryData(entry, label) {
  try {
    const data = entry.getData();
    const declaredSize = zipEntrySize(entry, "size", label);
    if (data.length !== declaredSize) {
      fail("INVALID_ARCHIVE", `${label} uncompressed size does not match its ZIP header`);
    }
    return data;
  } catch (error) {
    if (error instanceof ProjectFormatError) throw error;
    fail("INVALID_ARCHIVE", `Cannot read ${label}: ${error.message}`);
  }
}

function parseProjectArchive(input) {
  // Do not duplicate an untrusted archive before enforcing its compressed-size
  // bound. AdmZip only reads the buffer and every returned template is copied
  // by decompression, so sharing the caller's input here is safe.
  const buffer = toTemplateBuffer(input, "project archive", false);
  if (!buffer.length) fail("INVALID_ARCHIVE", "The project archive is empty");
  if (buffer.length > LIMITS.MAX_ARCHIVE_BYTES) {
    fail("ARCHIVE_LIMIT", "The compressed .docflow archive exceeds the size limit");
  }
  let archive;
  let entries;
  try {
    archive = new AdmZip(buffer);
    entries = archive.getEntries();
  } catch (error) {
    fail("INVALID_ARCHIVE", `Cannot open .docflow archive: ${error.message}`);
  }
  if (!entries.length || entries.length > LIMITS.MAX_ENTRY_COUNT) {
    fail("ENTRY_LIMIT", `A .docflow archive must contain 1-${LIMITS.MAX_ENTRY_COUNT} entries`);
  }
  const entryByName = new Map();
  const canonicalNames = new Set();
  let totalUncompressed = 0;
  let totalCompressed = 0;
  for (const entry of entries) {
    const name = safeArchivePath(entry.entryName);
    if (entry.isDirectory) fail("UNKNOWN_ARCHIVE_ENTRY", `Directory entries are not allowed: ${name}`);
    const canonicalName = name.normalize("NFC").toLowerCase();
    if (canonicalNames.has(canonicalName)) {
      fail("DUPLICATE_ARCHIVE_ENTRY", `Duplicate ZIP entry: ${name}`);
    }
    canonicalNames.add(canonicalName);
    if (name !== "manifest.json" && !/^templates\/[a-f0-9]{32}\.(?:docx|pdf)$/.test(name)) {
      fail("UNKNOWN_ARCHIVE_ENTRY", `Unknown ZIP entry: ${name}`);
    }
    if (entry.header.encrypted) fail("INVALID_ARCHIVE", `Encrypted ZIP entries are not supported: ${name}`);
    if (![0, 8].includes(entry.header.method)) {
      fail("INVALID_ARCHIVE", `Unsupported compression method for ${name}`);
    }
    const size = zipEntrySize(entry, "size", name);
    const compressedSize = zipEntrySize(entry, "compressedSize", name);
    if (name === "manifest.json" && size > LIMITS.MAX_MANIFEST_BYTES) {
      fail("MANIFEST_LIMIT", "manifest.json exceeds the uncompressed size limit");
    }
    if (name !== "manifest.json" && size > LIMITS.MAX_TEMPLATE_BYTES) {
      fail("TEMPLATE_LIMIT", `${name} exceeds the single-template size limit`);
    }
    totalUncompressed += size;
    totalCompressed += compressedSize;
    if (totalUncompressed > LIMITS.MAX_TOTAL_UNCOMPRESSED_BYTES) {
      fail("ARCHIVE_LIMIT", "The project exceeds the total uncompressed size limit");
    }
    if (totalCompressed > LIMITS.MAX_ARCHIVE_BYTES) {
      fail("ARCHIVE_LIMIT", "The project exceeds the total compressed size limit");
    }
    entryByName.set(name, entry);
  }
  const manifestEntry = entryByName.get("manifest.json");
  if (!manifestEntry) fail("INVALID_ARCHIVE", "The project archive is missing manifest.json");
  const manifestBuffer = readEntryData(manifestEntry, "manifest.json");
  let rawManifest;
  try {
    rawManifest = JSON.parse(manifestBuffer.toString("utf8"));
  } catch (error) {
    fail("INVALID_MANIFEST", `manifest.json is not valid JSON: ${error.message}`);
  }
  const manifest = normalizeManifest(rawManifest, [], "parse");
  const expectedEntries = new Set(["manifest.json"]);
  const templates = [];
  let totalTemplateBytes = 0;
  for (const descriptor of manifest.workflow.templates) {
    if (descriptor.builtIn) continue;
    if (!/^templates\/[a-f0-9]{32}\.(?:docx|pdf)$/.test(descriptor.entry)) {
      fail("UNSAFE_ARCHIVE_PATH", `Invalid template entry for ${descriptor.projectKey}`);
    }
    const expectedExtension = `.${descriptor.kind.toLowerCase()}`;
    if (!descriptor.entry.endsWith(expectedExtension)) {
      fail("INVALID_MANIFEST", `Template entry extension mismatch for ${descriptor.projectKey}`);
    }
    if (expectedEntries.has(descriptor.entry)) {
      fail("DUPLICATE_TEMPLATE", `Duplicate manifest template entry: ${descriptor.entry}`);
    }
    expectedEntries.add(descriptor.entry);
    const entry = entryByName.get(descriptor.entry);
    if (!entry) fail("MISSING_TEMPLATE", `Missing embedded template: ${descriptor.entry}`);
    const data = readEntryData(entry, descriptor.entry);
    if (data.length !== descriptor.bytes) {
      fail("SIZE_MISMATCH", `Template size mismatch for ${descriptor.projectKey}`);
    }
    totalTemplateBytes += data.length;
    if (totalTemplateBytes > LIMITS.MAX_TOTAL_TEMPLATE_BYTES) {
      fail("TEMPLATE_LIMIT", "Custom templates exceed the total uncompressed size limit");
    }
    const digest = sha256(data);
    if (digest !== descriptor.sha256) {
      fail("HASH_MISMATCH", `Template SHA-256 mismatch for ${descriptor.projectKey}`);
    }
    templates.push({
      projectKey: descriptor.projectKey,
      filename: descriptor.filename,
      kind: descriptor.kind,
      data,
      sha256: digest
    });
  }
  for (const name of entryByName.keys()) {
    if (!expectedEntries.has(name)) fail("UNKNOWN_ARCHIVE_ENTRY", `Unknown ZIP entry: ${name}`);
  }
  return { manifest, templates };
}

module.exports = {
  FORMAT,
  LIMITS,
  PRIVACY_EXCLUSIONS,
  ProjectFormatError,
  SCHEMA_VERSION,
  buildProjectArchive,
  parseProjectArchive,
  sha256
};
