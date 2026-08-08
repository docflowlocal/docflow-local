"use strict";

// SPDX-License-Identifier: MPL-2.0

const Ajv2020 = require("ajv/dist/2020");
const {
  ERROR_CODES,
  DocFlowError,
  registerAjvRuntimeTypes
} = require("./contracts");

let schema;
try {
  schema = require("@docflow-local/contracts/schemas/generate-request.schema.json");
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
  schema = require("../../contracts/src/schemas/generate-request.schema.json");
}

const ajv = registerAjvRuntimeTypes(new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false
}));
const validate = ajv.compile(schema);

function publicIssue(error) {
  return Object.freeze({
    instancePath: String(error.instancePath || ""),
    keyword: String(error.keyword || ""),
    message: String(error.message || "is invalid"),
    params: error.params && typeof error.params === "object"
      ? Object.freeze({ ...error.params })
      : Object.freeze({})
  });
}

function assertGenerateRequest(value) {
  if (validate(value)) return value;
  const issues = (validate.errors || []).slice(0, 20).map(publicIssue);
  throw new DocFlowError(
    ERROR_CODES.INVALID_REQUEST,
    "generation request does not match schemaVersion 1",
    {
      status: 400,
      details: {
        issues,
        truncated: (validate.errors || []).length > issues.length
      }
    }
  );
}

module.exports = {
  assertGenerateRequest
};
