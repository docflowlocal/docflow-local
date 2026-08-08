"use strict";

// SPDX-License-Identifier: MPL-2.0

const SCHEMA_VERSION = 1;
const PLUGIN_API_VERSION = "1";

const ERROR_CODES = Object.freeze({
  INVALID_REQUEST: "DOCFLOW_INVALID_REQUEST",
  UNSUPPORTED_SCHEMA: "DOCFLOW_UNSUPPORTED_SCHEMA",
  DATA_INVALID: "DOCFLOW_DATA_INVALID",
  DATA_LIMIT: "DOCFLOW_DATA_LIMIT",
  TEMPLATE_INVALID: "DOCFLOW_TEMPLATE_INVALID",
  TEMPLATE_UNSAFE: "DOCFLOW_TEMPLATE_UNSAFE",
  MAPPING_INVALID: "DOCFLOW_MAPPING_INVALID",
  VALIDATION_FAILED: "DOCFLOW_VALIDATION_FAILED",
  OUTPUT_CONFLICT: "DOCFLOW_OUTPUT_CONFLICT",
  PLUGIN_INVALID: "DOCFLOW_PLUGIN_INVALID",
  PLUGIN_FAILED: "DOCFLOW_PLUGIN_FAILED",
  UNAUTHORIZED: "DOCFLOW_UNAUTHORIZED",
  HOST_UNTRUSTED: "DOCFLOW_HOST_UNTRUSTED",
  ORIGIN_UNTRUSTED: "DOCFLOW_ORIGIN_UNTRUSTED",
  INTERNAL: "DOCFLOW_INTERNAL"
});

const PLUGIN_CAPABILITIES = Object.freeze([
  "data-source",
  "transform",
  "formatter",
  "output-sink"
]);

const GENERATE_REQUEST_KEYS = Object.freeze([
  "schemaVersion",
  "data",
  "rows",
  "dataSource",
  "dataSourceOptions",
  "template",
  "mappings",
  "computedFields",
  "conditionalFields",
  "transforms",
  "requiredFields",
  "output",
  "namingPattern",
  "folderPattern",
  "strict",
  "assets",
  "signature",
  "imageWidth",
  "imageHeight"
]);

class DocFlowError extends Error {
  constructor(code, message, options = {}) {
    if (!Object.values(ERROR_CODES).includes(code)) {
      throw new TypeError(`Unknown DocFlow error code: ${String(code)}`);
    }
    super(String(message || code), options.cause ? { cause: options.cause } : undefined);
    this.name = "DocFlowError";
    this.code = code;
    this.status = Number.isInteger(options.status) ? options.status : 400;
    this.details = options.details && typeof options.details === "object"
      ? Object.freeze({ ...options.details })
      : null;
  }
}

function assertSchemaVersion(value, label = "request") {
  if (value !== SCHEMA_VERSION) {
    throw new DocFlowError(
      ERROR_CODES.UNSUPPORTED_SCHEMA,
      `${label} requires schemaVersion ${SCHEMA_VERSION}`,
      { status: 400, details: { supported: [SCHEMA_VERSION] } }
    );
  }
  return value;
}

function assertKnownProperties(value, allowedKeys, label = "object") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DocFlowError(
      ERROR_CODES.INVALID_REQUEST,
      `${label} must be an object`,
      { status: 400 }
    );
  }
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) {
    throw new DocFlowError(
      ERROR_CODES.INVALID_REQUEST,
      `${label} contains unknown properties: ${unknown.sort().join(", ")}`,
      { status: 400, details: { unknownProperties: unknown.sort() } }
    );
  }
  return value;
}

function registerAjvRuntimeTypes(ajv) {
  if (!ajv || typeof ajv.addKeyword !== "function") {
    throw new TypeError("An Ajv instance is required");
  }
  ajv.addKeyword({
    keyword: "x-docflow-runtimeType",
    schemaType: "array",
    errors: false,
    compile(types) {
      const expected = new Set(types);
      return value => (
        (expected.has("Buffer") && Buffer.isBuffer(value))
        || (expected.has("Uint8Array") && value instanceof Uint8Array)
        || (expected.has("string") && typeof value === "string")
        || (
          expected.has("ImageDescriptor")
          && value
          && typeof value === "object"
          && !Array.isArray(value)
          && Object.prototype.hasOwnProperty.call(value, "data")
        )
      );
    }
  });
  return ajv;
}

function problemFromError(error, instance = "") {
  const known = error instanceof DocFlowError;
  const status = known ? error.status : 500;
  return Object.freeze({
    type: `https://docflowlocal.com/problems/${known ? error.code.toLowerCase() : "internal"}`,
    title: known ? error.code : ERROR_CODES.INTERNAL,
    status,
    detail: known ? error.message : "DocFlow could not complete the request.",
    code: known ? error.code : ERROR_CODES.INTERNAL,
    ...(known && error.details ? { details: error.details } : {}),
    ...(instance ? { instance: String(instance) } : {})
  });
}

module.exports = Object.freeze({
  SCHEMA_VERSION,
  PLUGIN_API_VERSION,
  ERROR_CODES,
  PLUGIN_CAPABILITIES,
  GENERATE_REQUEST_KEYS,
  DocFlowError,
  assertSchemaVersion,
  assertKnownProperties,
  registerAjvRuntimeTypes,
  problemFromError
});
