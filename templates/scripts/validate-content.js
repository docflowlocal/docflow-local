"use strict";

// SPDX-License-Identifier: MPL-2.0

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const { parseTabular } = require("@docflow-local/core/data");
const {
  extractDocxTemplateInfo,
  renderDocxTemplate
} = require("@docflow-local/core/template-engine");

const TEMPLATE_ROOT = path.resolve(__dirname, "..");
const STARTERS = [
  "quotation",
  "invoice",
  "certificate",
  "hr-offer",
  "packing-list",
  "sales-report"
];
const REQUIRED_MANIFEST_KEYS = [
  "schemaVersion",
  "id",
  "name",
  "version",
  "license",
  "creator",
  "attribution",
  "locale",
  "fields",
  "template",
  "sample"
];

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function flattenFields(fields, destination = new Map()) {
  for (const field of fields) {
    assert(field && typeof field === "object" && !Array.isArray(field), "field definitions must be objects");
    assert(/^[A-Za-z][A-Za-z0-9]*$/.test(field.name), `invalid field name: ${field.name}`);
    assert(!destination.has(field.name), `duplicate field name: ${field.name}`);
    destination.set(field.name, field);
    if (field.type === "array") {
      assert(Array.isArray(field.fields) && field.fields.length > 0, `${field.name} array needs nested fields`);
      flattenFields(field.fields, destination);
    }
  }
  return destination;
}

function representativeRow(manifest, parsedCsv, directory) {
  const jsonSample = path.join(directory, "sample.json");
  if (fs.existsSync(jsonSample)) {
    const parsed = readJson(jsonSample);
    assert(Array.isArray(parsed.rows) && parsed.rows.length > 0, `${manifest.id}/sample.json needs rows`);
    return parsed.rows[0];
  }
  assert(parsedCsv.rows.length > 0, `${manifest.id}/sample.csv needs a data row`);
  return parsedCsv.rows[0];
}

async function validateStarter(id) {
  const directory = path.join(TEMPLATE_ROOT, id);
  const manifestPath = path.join(directory, "manifest.json");
  const readmePath = path.join(directory, "README.md");
  assert(fs.existsSync(manifestPath), `${id}: manifest.json is missing`);
  assert(fs.existsSync(readmePath), `${id}: README.md is missing`);
  const manifest = readJson(manifestPath);
  for (const key of REQUIRED_MANIFEST_KEYS) {
    assert(Object.prototype.hasOwnProperty.call(manifest, key), `${id}: manifest.${key} is required`);
  }
  assert.strictEqual(manifest.schemaVersion, 1, `${id}: unsupported schemaVersion`);
  assert.strictEqual(manifest.id, id, `${id}: manifest id must match its directory`);
  assert(/^\d+\.\d+\.\d+$/.test(manifest.version), `${id}: version must be semantic x.y.z`);
  assert(/^[a-z]{2}(?:-[A-Z]{2})?$/.test(manifest.locale), `${id}: locale must be a simple BCP 47 tag`);
  assert(["CC-BY-4.0", "CC0-1.0"].includes(manifest.license), `${id}: unexpected starter license`);
  assert(Array.isArray(manifest.fields) && manifest.fields.length > 0, `${id}: fields must not be empty`);
  const declaredFields = flattenFields(manifest.fields);

  const templatePath = path.join(directory, manifest.template);
  const samplePath = path.join(directory, manifest.sample);
  assert(path.dirname(templatePath) === directory, `${id}: template must remain in its starter directory`);
  assert(path.dirname(samplePath) === directory, `${id}: sample must remain in its starter directory`);
  assert(fs.existsSync(templatePath), `${id}: ${manifest.template} is missing; run build-starters.js`);
  assert(fs.existsSync(samplePath), `${id}: ${manifest.sample} is missing`);

  const csv = await parseTabular(path.basename(samplePath), fs.readFileSync(samplePath));
  assert(csv.rows.length > 0, `${id}: sample CSV must contain at least one record`);
  const topLevelFields = manifest.fields.filter(field => field.required);
  for (const field of topLevelFields) {
    assert(csv.headers.includes(field.name), `${id}: required field ${field.name} is absent from sample.csv`);
  }

  const templateBuffer = fs.readFileSync(templatePath);
  const zip = new PizZip(templateBuffer);
  for (const requiredPart of ["[Content_Types].xml", "_rels/.rels", "word/document.xml"]) {
    assert(zip.file(requiredPart), `${id}: DOCX is missing ${requiredPart}`);
  }
  const info = extractDocxTemplateInfo(templateBuffer);
  for (const field of info.fields) {
    assert(declaredFields.has(field), `${id}: template field ${field} is absent from manifest`);
  }

  const row = representativeRow(manifest, csv, directory);
  const rendered = await renderDocxTemplate(templateBuffer, row);
  assert(Buffer.isBuffer(rendered.buffer) && rendered.buffer.length > 0, `${id}: render returned no DOCX`);
  const renderedZip = new PizZip(rendered.buffer);
  const renderedXml = renderedZip.file("word/document.xml").asText();
  assert(!renderedXml.includes("{{"), `${id}: rendered DOCX contains unresolved opening tags`);
  assert(!renderedXml.includes("}}"), `${id}: rendered DOCX contains unresolved closing tags`);
  return {
    id,
    fields: info.fields.length,
    conditionsOrLoops: info.conditions.length,
    sampleRows: csv.rows.length,
    bytes: templateBuffer.length
  };
}

async function main() {
  const results = [];
  for (const id of STARTERS) results.push(await validateStarter(id));
  console.log(`validated ${results.length} starter templates`);
  for (const result of results) console.log(JSON.stringify(result));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
