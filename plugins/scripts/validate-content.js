"use strict";

// SPDX-License-Identifier: MPL-2.0

const assert = require("node:assert/strict");
const path = require("node:path");
const { createPluginRegistry } = require("@docflow-local/core/plugin-sdk");

const directory = path.resolve(__dirname, "..", "transform-uppercase");
const manifest = require(path.join(directory, "manifest.json"));
const plugin = require(path.join(directory, manifest.entry));

assert.deepEqual(
  Object.keys(manifest).sort(),
  ["apiVersion", "capabilities", "entry", "id", "name", "permissions", "schemaVersion", "version"].sort()
);
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.apiVersion, "1");
assert(manifest.capabilities.includes("transform"));
assert.deepEqual(plugin.manifest, manifest);
assert.equal(typeof plugin.activate, "function");

const registry = createPluginRegistry();
registry.use(plugin);
assert.deepEqual(registry.describe().transforms, ["uppercase-fields"]);
const transform = registry.getTransform("uppercase-fields");
const input = { company: "Acme Demo", amount: 10 };
const output = transform(input, { options: { fields: ["company"] } });
assert.deepEqual(input, { company: "Acme Demo", amount: 10 });
assert.deepEqual(output, { company: "ACME DEMO", amount: 10 });
console.log("validated 1 plugin against API v1");
