"use strict";

// SPDX-License-Identifier: MPL-2.0

const manifest = require("./manifest.json");
const TRANSFORM_NAME = "uppercase-fields";

function transform(input, context = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("uppercase-fields expects one record object");
  }
  const configuredFields = context.options?.fields;
  const fields = Array.isArray(configuredFields)
    ? configuredFields.map(String)
    : Object.keys(input);
  const output = { ...input };
  for (const field of fields) {
    if (typeof output[field] === "string") {
      output[field] = output[field].toLocaleUpperCase(context.locale || "en-US");
    }
  }
  return output;
}

function activate(api) {
  if (!api || typeof api.registerTransform !== "function") {
    throw new TypeError("DocFlow plugin API v1 with registerTransform is required");
  }
  api.registerTransform(TRANSFORM_NAME, transform);
}

module.exports = { manifest, activate };
