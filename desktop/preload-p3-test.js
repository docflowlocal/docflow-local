"use strict";

const assert = require("assert/strict");
const Module = require("module");

const CUSTOMER_SECRET = "PRIVATE-CUSTOMER-CONTENT-4422";

function loadPreloadApi() {
  const originalLoad = Module._load;
  const calls = [];
  let api = null;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") {
      return {
        contextBridge: {
          exposeInMainWorld(name, value) {
            assert.equal(name, "docflowDesktop");
            api = value;
          }
        },
        ipcRenderer: {
          invoke(...args) {
            calls.push(args);
            return Promise.resolve({ ok: true });
          }
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  const preloadPath = require.resolve("./preload");
  delete require.cache[preloadPath];
  try {
    require(preloadPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[preloadPath];
  }
  return { api, calls };
}

function hasForbiddenKey(value, forbidden) {
  if (Array.isArray(value)) return value.some(item => hasForbiddenKey(item, forbidden));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => forbidden.has(key) || hasForbiddenKey(child, forbidden));
}

async function main() {
  const { api, calls } = loadPreloadApi();
  assert(api);
  const recipeInput = {
    scenario: "hr-onboarding",
    projectName: CUSTOMER_SECRET,
    rows: [{ employee: CUSTOMER_SECRET }],
    sourceRows: [{ employee: CUSTOMER_SECRET }],
    originalFilenames: [`${CUSTOMER_SECRET}.xlsx`],
    generatedContent: CUSTOMER_SECRET,
    workflow: {
      expectedHeaders: ["employee", "start_date"],
      mappings: {
        employee_name: "employee",
        start: { kind: "source", source: "start_date", literal: CUSTOMER_SECRET }
      },
      requiredFields: ["employee_name"],
      unconfirmedFields: [],
      requiredOverrides: { start: false },
      computedFields: [{ name: "year", expression: "year(start)", customer: CUSTOMER_SECRET }],
      conditionalFields: [{ name: "show_start", expression: "start != null", whenTrue: "show", private: CUSTOMER_SECRET }],
      naming: { filenamePattern: "{{employee_name}}", folderPattern: "{{year}}", path: CUSTOMER_SECRET },
      templateRequirements: [{
        key: "offer-letter",
        kind: "DOCX",
        description: "Bind an offer-letter DOCX with the listed fields.",
        selected: true,
        order: 0,
        fields: ["employee_name", "start"],
        filename: `${CUSTOMER_SECRET}.docx`,
        templateBinary: CUSTOMER_SECRET,
        templateContent: CUSTOMER_SECRET,
        signature: CUSTOMER_SECRET,
        images: [CUSTOMER_SECRET],
        assetRequirements: [{
          kind: "signature",
          field: "manager_signature",
          required: true,
          bytes: CUSTOMER_SECRET,
          filename: `${CUSTOMER_SECRET}.png`
        }]
      }]
    }
  };

  await api.previewProjectRecipe(recipeInput);
  assert.equal(calls[0][0], "docflow:preview-project-recipe");
  const recipePayload = calls[0][1];
  assert.equal(JSON.stringify(recipePayload).includes(CUSTOMER_SECRET), false);
  assert.equal(hasForbiddenKey(recipePayload, new Set([
    "rows",
    "sourceRows",
    "originalFilenames",
    "filename",
    "templateBinary",
    "templateContent",
    "signature",
    "images",
    "generatedContent",
    "bytes",
    "path",
    "projectName"
  ])), false);
  assert.deepEqual(recipePayload.workflow.templateRequirements[0], {
    key: "offer-letter",
    kind: "DOCX",
    description: "Bind an offer-letter DOCX with the listed fields.",
    selected: true,
    order: 0,
    fields: ["employee_name", "start"],
    assetRequirements: [{ kind: "signature", field: "manager_signature", required: true }]
  });
  assert.throws(
    () => api.previewProjectRecipe({ ...recipeInput, scenario: { secret: CUSTOMER_SECRET } }),
    /scenario must be a string/
  );
  assert.throws(
    () => api.previewProjectRecipe({
      ...recipeInput,
      workflow: {
        ...recipeInput.workflow,
        mappings: { employee_name: { kind: "source", source: { secret: CUSTOMER_SECRET } } }
      }
    }),
    /source must be a string/
  );

  await api.exportProjectRecipe(recipeInput);
  assert.equal(calls[1][0], "docflow:export-project-recipe");
  assert.deepEqual(calls[1][1], recipePayload);
  await api.importProjectRecipe();
  assert.deepEqual(calls[2], ["docflow:import-project-recipe"]);

  await api.createActivationProject({ sampleOrigin: false, customerName: CUSTOMER_SECRET });
  assert.deepEqual(calls[3], ["docflow:activation-create-project", { sampleOrigin: false }]);
  const projectId = `actprj_${"1".repeat(32)}`;
  await api.beginActivationBatch({
    projectId,
    real: true,
    dedupeDigest: "A".repeat(64),
    templateCountBucket: "two_or_more",
    sourcePath: `/Customers/${CUSTOMER_SECRET}.xlsx`
  });
  assert.deepEqual(calls[4], ["docflow:activation-begin-batch", {
    projectId,
    real: true,
    dedupeDigest: "a".repeat(64),
    templateCountBucket: "two_or_more"
  }]);
  await api.recordActivationProgress({
    projectId,
    batchSequence: 3,
    event: "package_saved",
    foregroundActiveSeconds: 300,
    filename: `${CUSTOMER_SECRET}.zip`,
    output: CUSTOMER_SECRET
  });
  assert.deepEqual(calls[5], ["docflow:activation-record-progress", {
    projectId,
    event: "package_saved",
    batchSequence: 3,
    foregroundActiveSeconds: 300
  }]);
  await api.getActivationSummary();
  await api.exportActivationSummary();
  await api.clearActivationLedger();
  assert.deepEqual(calls.slice(6).map(call => call[0]), [
    "docflow:activation-summary",
    "docflow:activation-export-summary",
    "docflow:activation-clear"
  ]);

  assert.equal(Object.prototype.hasOwnProperty.call(api, "readFile"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(api, "writeFile"), false);
  console.log("preload P3 API tests passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
