"use strict";

const { constants: FS_CONSTANTS } = require("fs");
const fs = require("fs/promises");
const path = require("path");
const { writeFileAtomically } = require("./project-io");

const FORMAT = "docflow-local-recipe";
const SCHEMA_VERSION = 1;
const MAX_RECIPE_BYTES = 512 * 1024;
const MAX_FIELDS = 1_000;
const MAX_RULES = 200;
const MAX_TEMPLATE_REQUIREMENTS = 40;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const TEMPLATE_KINDS = new Set(["BUILTIN", "DOCX", "PDF"]);
const ASSET_KINDS = new Set(["image", "qrcode", "signature"]);
const PRIVACY_EXCLUSIONS = Object.freeze([
  "rows",
  "sourceRows",
  "originalFilenames",
  "templateBinary",
  "templateContent",
  "signatures",
  "images",
  "generatedContent"
]);

class ProjectRecipeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProjectRecipeError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProjectRecipeError(code, message);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function objectValue(value, label) {
  if (!isPlainObject(value)) fail("INVALID_RECIPE", `${label} must be a plain object`);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || DANGEROUS_KEYS.has(key)) {
      fail("UNSAFE_RECIPE", `${label} contains a forbidden key`);
    }
  }
  return value;
}

function exactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("UNKNOWN_RECIPE_FIELD", `${label} contains an unknown field: ${key}`);
  }
}

function stringValue(value, label, { required = false, maxBytes = 4_096, trim = false } = {}) {
  if (value == null) {
    if (required) fail("INVALID_RECIPE", `${label} is required`);
    return undefined;
  }
  if (typeof value !== "string") fail("INVALID_RECIPE", `${label} must be a string`);
  const result = trim ? value.trim() : value;
  if (required && !result) fail("INVALID_RECIPE", `${label} cannot be empty`);
  if (Buffer.byteLength(result, "utf8") > maxBytes) fail("RECIPE_LIMIT", `${label} is too large`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) {
    fail("INVALID_RECIPE", `${label} contains control characters`);
  }
  return result;
}

function booleanValue(value, label, fallback) {
  if (value == null && fallback !== undefined) return fallback;
  if (typeof value !== "boolean") fail("INVALID_RECIPE", `${label} must be a boolean`);
  return value;
}

function integerValue(value, label, { min = 0, max = 10_000, fallback } = {}) {
  if (value == null && fallback !== undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    fail("INVALID_RECIPE", `${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function safeId(value, label) {
  const id = stringValue(value, label, { required: true, trim: true, maxBytes: 80 });
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(id) || DANGEROUS_KEYS.has(id)) {
    fail("INVALID_RECIPE", `${label} is not a safe identifier`);
  }
  return id;
}

function stringArray(value, label, maximum = MAX_FIELDS) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maximum) {
    fail("RECIPE_LIMIT", `${label} contains too many fields`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const normalized = stringValue(item, `${label}[${index}]`, {
      required: true,
      trim: true,
      maxBytes: 1_024
    });
    const key = normalized.normalize("NFC");
    if (seen.has(key)) fail("INVALID_RECIPE", `${label} contains duplicate values`);
    seen.add(key);
    return normalized;
  });
}

function normalizeMappings(value) {
  if (value == null) return {};
  const source = objectValue(value, "recipe.workflow.mappings");
  const keys = Object.keys(source);
  if (keys.length > MAX_FIELDS) fail("RECIPE_LIMIT", "Too many recipe mappings");
  const mappings = {};
  for (const target of keys) {
    stringValue(target, "mapping target", { required: true, trim: true, maxBytes: 1_024 });
    const mapping = source[target];
    if (typeof mapping === "string") {
      mappings[target] = stringValue(mapping, `mapping ${target}`, { maxBytes: 1_024 });
      continue;
    }
    const definition = objectValue(mapping, `mapping ${target}`);
    exactKeys(definition, new Set(["kind", "source", "expression"]), `mapping ${target}`);
    const kind = stringValue(definition.kind, `mapping ${target}.kind`, {
      required: true,
      trim: true,
      maxBytes: 32
    });
    if (kind === "source") {
      mappings[target] = {
        kind,
        source: stringValue(definition.source, `mapping ${target}.source`, {
          required: true,
          trim: true,
          maxBytes: 1_024
        })
      };
    } else if (kind === "expression") {
      mappings[target] = {
        kind,
        expression: stringValue(definition.expression, `mapping ${target}.expression`, {
          required: true,
          trim: true,
          maxBytes: 16_384
        })
      };
    } else {
      // Literal mappings are intentionally excluded: their values can be
      // customer data even when the rest of the recipe is structurally safe.
      fail("PRIVACY_VIOLATION", `mapping ${target} must not contain a literal value`);
    }
  }
  return mappings;
}

function normalizeRequiredOverrides(value) {
  if (value == null) return {};
  const source = objectValue(value, "recipe.workflow.requiredOverrides");
  if (Object.keys(source).length > MAX_FIELDS) fail("RECIPE_LIMIT", "Too many required overrides");
  const result = {};
  for (const [field, required] of Object.entries(source)) {
    stringValue(field, "required override field", { required: true, trim: true, maxBytes: 1_024 });
    result[field] = booleanValue(required, `required override ${field}`);
  }
  return result;
}

function normalizeRules(value, kind) {
  if (value == null) return [];
  const label = `recipe.workflow.${kind}Fields`;
  if (!Array.isArray(value) || value.length > MAX_RULES) {
    fail("RECIPE_LIMIT", `${label} contains too many rules`);
  }
  return value.map((rule, index) => {
    const itemLabel = `${label}[${index}]`;
    const source = objectValue(rule, itemLabel);
    const allowed = kind === "computed"
      ? new Set(["name", "expression", "digits", "scope"])
      : new Set(["name", "expression", "scope", "whenTrue", "whenFalse"]);
    exactKeys(source, allowed, itemLabel);
    const result = {
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
    if (source.scope != null) result.scope = safeId(source.scope, `${itemLabel}.scope`);
    if (kind === "computed" && source.digits != null) {
      result.digits = integerValue(source.digits, `${itemLabel}.digits`, { min: 0, max: 12 });
    }
    if (kind === "conditional") {
      if (source.whenTrue != null) {
        result.whenTrue = stringValue(source.whenTrue, `${itemLabel}.whenTrue`, { maxBytes: 4_096 });
      }
      if (source.whenFalse != null) {
        result.whenFalse = stringValue(source.whenFalse, `${itemLabel}.whenFalse`, { maxBytes: 4_096 });
      }
    }
    return result;
  });
}

function normalizeAssetRequirements(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_FIELDS) {
    fail("RECIPE_LIMIT", `${label} contains too many asset requirements`);
  }
  return value.map((item, index) => {
    const source = objectValue(item, `${label}[${index}]`);
    exactKeys(source, new Set(["kind", "field", "required"]), `${label}[${index}]`);
    const kind = stringValue(source.kind, `${label}[${index}].kind`, {
      required: true,
      trim: true,
      maxBytes: 32
    }).toLowerCase();
    if (!ASSET_KINDS.has(kind)) fail("INVALID_RECIPE", `${label}[${index}].kind is invalid`);
    const result = {
      kind,
      required: booleanValue(source.required, `${label}[${index}].required`, false)
    };
    if (source.field != null) {
      result.field = stringValue(source.field, `${label}[${index}].field`, {
        required: true,
        trim: true,
        maxBytes: 1_024
      });
    }
    return result;
  });
}

function normalizeTemplateRequirements(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_TEMPLATE_REQUIREMENTS) {
    fail("RECIPE_LIMIT", "Too many template requirements");
  }
  const keys = new Set();
  return value.map((item, index) => {
    const label = `recipe.workflow.templateRequirements[${index}]`;
    const source = objectValue(item, label);
    exactKeys(
      source,
      new Set(["key", "kind", "builtInId", "description", "selected", "order", "fields", "assetRequirements"]),
      label
    );
    const key = safeId(source.key, `${label}.key`);
    if (keys.has(key)) fail("INVALID_RECIPE", `Duplicate template requirement key: ${key}`);
    keys.add(key);
    const kind = stringValue(source.kind, `${label}.kind`, {
      required: true,
      trim: true,
      maxBytes: 16
    }).toUpperCase();
    if (!TEMPLATE_KINDS.has(kind)) fail("INVALID_RECIPE", `${label}.kind is invalid`);
    const result = {
      key,
      kind,
      selected: booleanValue(source.selected, `${label}.selected`, true),
      order: integerValue(source.order, `${label}.order`, { min: 0, max: 10_000, fallback: index }),
      fields: stringArray(source.fields, `${label}.fields`),
      assetRequirements: normalizeAssetRequirements(source.assetRequirements, `${label}.assetRequirements`)
    };
    if (source.description != null) {
      result.description = stringValue(source.description, `${label}.description`, {
        required: true,
        trim: true,
        maxBytes: 4_096
      });
    }
    if (source.builtInId != null) {
      result.builtInId = safeId(source.builtInId, `${label}.builtInId`);
    } else if (kind === "BUILTIN") {
      fail("INVALID_RECIPE", `${label}.builtInId is required for built-in templates`);
    }
    return result;
  });
}

function normalizeNaming(value) {
  const source = objectValue(value || {}, "recipe.workflow.naming");
  exactKeys(source, new Set(["filenamePattern", "folderPattern"]), "recipe.workflow.naming");
  return {
    filenamePattern: stringValue(source.filenamePattern ?? "document-{{index}}", "recipe.workflow.naming.filenamePattern", {
      required: true,
      maxBytes: 4_096
    }),
    folderPattern: stringValue(source.folderPattern ?? "", "recipe.workflow.naming.folderPattern", {
      maxBytes: 4_096
    })
  };
}

function normalizePrivacy(value, mode) {
  if (mode === "parse" || value != null) {
    const source = objectValue(value, "recipe.privacy");
    exactKeys(source, new Set(["containsCustomerData", "excluded"]), "recipe.privacy");
    if ((mode === "parse" || source.containsCustomerData != null) && source.containsCustomerData !== false) {
      fail("PRIVACY_VIOLATION", "A shareable recipe cannot contain customer data");
    }
    if (mode === "parse" || source.excluded != null) {
      const exclusions = stringArray(source.excluded, "recipe.privacy.excluded", 32);
      if (
        exclusions.length !== PRIVACY_EXCLUSIONS.length
        || PRIVACY_EXCLUSIONS.some((field, index) => exclusions[index] !== field)
      ) {
        fail("PRIVACY_VIOLATION", "Recipe privacy exclusions are incomplete");
      }
    }
  }
  return { containsCustomerData: false, excluded: [...PRIVACY_EXCLUSIONS] };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key]);
  return result;
}

function normalizeRecipe(value, mode = "build") {
  const source = objectValue(value, "recipe");
  exactKeys(
    source,
    new Set(["format", "schemaVersion", "scenario", "workflow", "privacy"]),
    "recipe"
  );
  if (mode === "parse") {
    if (source.format !== FORMAT || source.schemaVersion !== SCHEMA_VERSION) {
      fail("INVALID_SCHEMA", "Unsupported project recipe format or schema version");
    }
  } else {
    if (source.format != null && source.format !== FORMAT) fail("INVALID_SCHEMA", "Recipe format is invalid");
    if (source.schemaVersion != null && source.schemaVersion !== SCHEMA_VERSION) {
      fail("INVALID_SCHEMA", "Recipe schema version is invalid");
    }
  }
  const workflow = objectValue(source.workflow || {}, "recipe.workflow");
  exactKeys(
    workflow,
    new Set([
      "expectedHeaders",
      "mappings",
      "requiredFields",
      "unconfirmedFields",
      "requiredOverrides",
      "computedFields",
      "conditionalFields",
      "naming",
      "templateRequirements"
    ]),
    "recipe.workflow"
  );
  return canonicalize({
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    scenario: safeId(source.scenario ?? "custom", "recipe.scenario"),
    workflow: {
      expectedHeaders: stringArray(workflow.expectedHeaders, "recipe.workflow.expectedHeaders"),
      mappings: normalizeMappings(workflow.mappings),
      requiredFields: stringArray(workflow.requiredFields, "recipe.workflow.requiredFields"),
      unconfirmedFields: stringArray(workflow.unconfirmedFields, "recipe.workflow.unconfirmedFields"),
      requiredOverrides: normalizeRequiredOverrides(workflow.requiredOverrides),
      computedFields: normalizeRules(workflow.computedFields, "computed"),
      conditionalFields: normalizeRules(workflow.conditionalFields, "conditional"),
      naming: normalizeNaming(workflow.naming),
      templateRequirements: normalizeTemplateRequirements(workflow.templateRequirements)
    },
    privacy: normalizePrivacy(source.privacy, mode)
  });
}

function buildProjectRecipe(value) {
  const recipe = normalizeRecipe(value, "build");
  const buffer = Buffer.from(`${JSON.stringify(recipe, null, 2)}\n`, "utf8");
  if (buffer.length > MAX_RECIPE_BYTES) fail("RECIPE_LIMIT", "Project recipe is too large");
  return Object.freeze({ recipe, buffer });
}

function parseProjectRecipe(input) {
  const buffer = Buffer.from(input || []);
  if (!buffer.length || buffer.length > MAX_RECIPE_BYTES) {
    fail("RECIPE_LIMIT", "Project recipe size is outside the supported range");
  }
  let source;
  try {
    source = JSON.parse(buffer.toString("utf8"));
  } catch (error) {
    fail("INVALID_RECIPE", `Project recipe is not valid JSON: ${error.message}`);
  }
  return normalizeRecipe(source, "parse");
}

function safeRecipeFilename(value = "DocFlow-Recipe.docflowrecipe") {
  const cleaned = path.basename(String(value || "DocFlow-Recipe.docflowrecipe"))
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[ .]+|[ .]+$/g, "")
    .slice(0, 160) || "DocFlow-Recipe.docflowrecipe";
  return cleaned.toLowerCase().endsWith(".docflowrecipe") ? cleaned : `${cleaned}.docflowrecipe`;
}

function ensureRecipePath(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || value.includes("\0")) {
    fail("INVALID_RECIPE_PATH", "Project recipe path must be absolute");
  }
  const target = path.resolve(value);
  return path.extname(target).toLowerCase() === ".docflowrecipe"
    ? target
    : `${target}.docflowrecipe`;
}

async function readProjectRecipeFile(filePath) {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath) || path.extname(filePath).toLowerCase() !== ".docflowrecipe") {
    fail("INVALID_RECIPE_PATH", "Project recipe path must be an absolute .docflowrecipe path");
  }
  const target = path.resolve(filePath);
  const noFollow = process.platform === "win32" ? 0 : (FS_CONSTANTS.O_NOFOLLOW || 0);
  let handle;
  try {
    handle = await fs.open(target, FS_CONSTANTS.O_RDONLY | noFollow);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_RECIPE_BYTES) {
      fail("RECIPE_LIMIT", "Project recipe file size is outside the supported range");
    }
    const buffer = await handle.readFile();
    if (buffer.length !== stat.size) fail("INVALID_RECIPE", "Project recipe changed while being read");
    return parseProjectRecipe(buffer);
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function writeProjectRecipeFile(filePath, recipeInput) {
  const target = ensureRecipePath(filePath);
  let built;
  if (Buffer.isBuffer(recipeInput) || ArrayBuffer.isView(recipeInput) || recipeInput instanceof ArrayBuffer) {
    const recipe = parseProjectRecipe(recipeInput);
    // Never preserve unparsed JSON text (including shadowed duplicate keys).
    // Re-serialize the canonical allowlisted value before it reaches disk.
    built = {
      recipe,
      buffer: Buffer.from(`${JSON.stringify(recipe, null, 2)}\n`, "utf8")
    };
  } else {
    built = buildProjectRecipe(recipeInput);
  }
  if (built.buffer.length > MAX_RECIPE_BYTES) fail("RECIPE_LIMIT", "Project recipe is too large");
  await writeFileAtomically(target, built.buffer);
  return Object.freeze({ filePath: target, recipe: built.recipe });
}

module.exports = Object.freeze({
  FORMAT,
  MAX_RECIPE_BYTES,
  PRIVACY_EXCLUSIONS,
  ProjectRecipeError,
  SCHEMA_VERSION,
  buildProjectRecipe,
  parseProjectRecipe,
  readProjectRecipeFile,
  safeRecipeFilename,
  writeProjectRecipeFile
});
