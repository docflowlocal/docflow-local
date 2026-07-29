"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Ajv2020 = require("ajv/dist/2020");
const {
  ERROR_CODES,
  GENERATE_REQUEST_KEYS,
  PLUGIN_API_VERSION,
  PLUGIN_CAPABILITIES,
  DocFlowError,
  assertKnownProperties,
  registerAjvRuntimeTypes
} = require("../src");

function schema(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "schemas", name), "utf8"));
}

test("generation schema properties stay aligned with the runtime public key contract", () => {
  const generation = schema("generate-request.schema.json");
  assert.equal(generation.additionalProperties, false);
  assert.deepEqual(
    Object.keys(generation.properties).sort(),
    [...GENERATE_REQUEST_KEYS].sort()
  );
  assert.deepEqual(generation.required, ["schemaVersion", "template"]);
});

test("plugin manifest schema stays aligned with the plugin API contract", () => {
  const plugin = schema("plugin-manifest.schema.json");
  assert.equal(plugin.properties.apiVersion.const, PLUGIN_API_VERSION);
  assert.deepEqual(
    [...plugin.properties.capabilities.items.enum].sort(),
    [...PLUGIN_CAPABILITIES].sort()
  );
});

test("generation schema accepts documented mappings and rejects nested drift", () => {
  const ajv = registerAjvRuntimeTypes(new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false
  }));
  const validate = ajv.compile(schema("generate-request.schema.json"));
  const request = {
    schemaVersion: 1,
    rows: [{ customer: "Acme" }],
    template: { filename: "quotation.docx", bytes: Buffer.from("runtime-buffer-placeholder") },
    mappings: [
      { templateField: "customer_name", source: "customer" },
      { field: "label", expression: '"Customer: " + [customer]' },
      { target: "currency", kind: "literal", value: "USD" }
    ],
    output: {
      pattern: "{{customer_name}}",
      onConflict: "suffix"
    },
    strict: true
  };
  assert.equal(validate(request), true, JSON.stringify(validate.errors));
  assert.equal(validate({
    ...request,
    output: { ...request.output, undocumented: true }
  }), false);
  assert.equal(validate({
    ...request,
    mappings: { customer_name: { kind: "unsupported" } }
  }), false);
});

test("unknown generation properties fail with the stable invalid-request error", () => {
  assert.throws(
    () => assertKnownProperties(
      { schemaVersion: 1, template: {}, undocumented: true },
      GENERATE_REQUEST_KEYS,
      "generation request"
    ),
    error => (
      error instanceof DocFlowError
      && error.code === ERROR_CODES.INVALID_REQUEST
      && error.details.unknownProperties.includes("undocumented")
    )
  );
});
