"use strict";

// SPDX-License-Identifier: MPL-2.0

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseTabular } = require("@docflow-local/core/data");

const ROOT = path.resolve(__dirname, "..");
const EXAMPLES = [
  "excel-to-quotation",
  "bulk-certificate-generator",
  "employee-onboarding-pack"
];

async function main() {
  for (const name of EXAMPLES) {
    const directory = path.join(ROOT, name);
    const readme = fs.readFileSync(path.join(directory, "README.md"), "utf8");
    assert(readme.includes("docflow generate"), `${name}: README needs a runnable generate command`);
    assert(/Acceptance|验收/i.test(readme), `${name}: README needs acceptance checks`);
    const dataFile = fs.readdirSync(directory).find(filename => /^data\.(?:csv|json|xlsx)$/i.test(filename));
    assert(dataFile, `${name}: data fixture is missing`);
    const parsed = await parseTabular(dataFile, fs.readFileSync(path.join(directory, dataFile)));
    assert(parsed.rows.length > 0, `${name}: data fixture has no records`);
  }
  console.log(`validated ${EXAMPLES.length} runnable examples`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
