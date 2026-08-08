"use strict";

const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const {
  PRIVACY_EXCLUSIONS,
  buildProjectRecipe,
  parseProjectRecipe,
  readProjectRecipeFile,
  safeRecipeFilename,
  writeProjectRecipeFile
} = require("./project-recipe");

const CUSTOMER_SECRET = "ACME-CUSTOMER-001";
const SOURCE_FILENAME = "ACME-CUSTOMER-001-private.xlsx";
const TEMPLATE_FILENAME = "ACME-CUSTOMER-001-contract.docx";

function exampleRecipe() {
  return {
    scenario: "trade-quotation",
    workflow: {
      expectedHeaders: ["customer", "amount", "logo"],
      mappings: {
        customer_name: "customer",
        total: { kind: "expression", expression: "round(amount * 1.13, 2)" },
        logo: { kind: "source", source: "logo" }
      },
      requiredFields: ["customer_name", "total"],
      unconfirmedFields: ["logo"],
      requiredOverrides: { logo: false },
      computedFields: [{ name: "taxed_total", expression: "amount * 1.13", digits: 2 }],
      conditionalFields: [{
        name: "large_order",
        expression: "total > 10000",
        whenTrue: "show",
        whenFalse: "hide"
      }],
      naming: {
        filenamePattern: "{{customer_name}}-quotation",
        folderPattern: "{{customer_name}}"
      },
      templateRequirements: [
        {
          key: "quotation-main",
          kind: "DOCX",
          description: "Bind a DOCX quotation template containing the listed fields.",
          selected: true,
          order: 0,
          fields: ["customer_name", "total"],
          assetRequirements: [{ kind: "image", field: "logo", required: false }]
        },
        {
          key: "packing-list",
          kind: "BUILTIN",
          builtInId: "packing-list",
          selected: true,
          order: 1,
          fields: ["customer_name"],
          assetRequirements: [{ kind: "qrcode", field: "tracking_url", required: false }]
        }
      ]
    }
  };
}

function expectCode(operation, code) {
  assert.throws(operation, error => error?.code === code);
}

function collectObjectKeys(value, keys = []) {
  if (Array.isArray(value)) {
    value.forEach(item => collectObjectKeys(item, keys));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectObjectKeys(child, keys);
    }
  }
  return keys;
}

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "docflow-recipe-test-"));
  try {
    const source = exampleRecipe();
    const first = buildProjectRecipe(source);
    const second = buildProjectRecipe(source);
    assert.deepEqual(first.recipe, second.recipe, "recipe output should be canonical and deterministic");
    assert.equal(first.buffer.compare(second.buffer), 0);
    assert.deepEqual(parseProjectRecipe(first.buffer), first.recipe);
    assert.deepEqual(first.recipe.privacy, {
      containsCustomerData: false,
      excluded: [...PRIVACY_EXCLUSIONS]
    });

    const serialized = first.buffer.toString("utf8");
    for (const forbidden of [
      CUSTOMER_SECRET,
      SOURCE_FILENAME,
      TEMPLATE_FILENAME
    ]) {
      assert.equal(serialized.includes(forbidden), false, `recipe leaked forbidden value: ${forbidden}`);
    }
    const structuralKeys = collectObjectKeys(first.recipe);
    for (const forbidden of [
      "rows",
      "sourceRows",
      "originalFilenames",
      "templateBinary",
      "templateContent",
      "signatures",
      "generatedContent"
    ]) {
      assert.equal(structuralKeys.includes(forbidden), false, `recipe contains forbidden field: ${forbidden}`);
    }

    expectCode(() => buildProjectRecipe({ ...source, rows: [{ customer: CUSTOMER_SECRET }] }), "UNKNOWN_RECIPE_FIELD");
    expectCode(() => buildProjectRecipe({
      ...source,
      workflow: { ...source.workflow, sourceRows: [{ customer: CUSTOMER_SECRET }] }
    }), "UNKNOWN_RECIPE_FIELD");
    expectCode(() => buildProjectRecipe({
      ...source,
      workflow: {
        ...source.workflow,
        mappings: { customer_name: { kind: "literal", expression: CUSTOMER_SECRET } }
      }
    }), "PRIVACY_VIOLATION");
    expectCode(() => buildProjectRecipe({
      ...source,
      workflow: {
        ...source.workflow,
        templateRequirements: [{
          key: "private-template",
          kind: "DOCX",
          filename: TEMPLATE_FILENAME,
          templateContent: "UEsDB-private"
        }]
      }
    }), "UNKNOWN_RECIPE_FIELD");
    expectCode(() => buildProjectRecipe({
      ...source,
      privacy: { containsCustomerData: false, excluded: [...PRIVACY_EXCLUSIONS], customer: CUSTOMER_SECRET }
    }), "UNKNOWN_RECIPE_FIELD");

    const unsafePrivacy = JSON.parse(first.buffer.toString("utf8"));
    unsafePrivacy.privacy.containsCustomerData = true;
    expectCode(() => parseProjectRecipe(Buffer.from(JSON.stringify(unsafePrivacy))), "PRIVACY_VIOLATION");
    unsafePrivacy.privacy.containsCustomerData = false;
    unsafePrivacy.privacy.excluded.pop();
    expectCode(() => parseProjectRecipe(Buffer.from(JSON.stringify(unsafePrivacy))), "PRIVACY_VIOLATION");

    const outputWithoutExtension = path.join(temporary, "safe-export");
    const written = await writeProjectRecipeFile(outputWithoutExtension, source);
    assert.equal(written.filePath, `${outputWithoutExtension}.docflowrecipe`);
    assert.deepEqual(await readProjectRecipeFile(written.filePath), first.recipe);
    assert.equal(safeRecipeFilename("../unsafe/customer:name"), "customer-name.docflowrecipe");

    const shadowedJson = Buffer.from(first.buffer.toString("utf8").replace(
      '"scenario": "trade-quotation",',
      `"scenario": "${CUSTOMER_SECRET}",\n  "scenario": "trade-quotation",`
    ));
    const canonicalPath = path.join(temporary, "canonical.docflowrecipe");
    await writeProjectRecipeFile(canonicalPath, shadowedJson);
    assert.equal((await fs.readFile(canonicalPath, "utf8")).includes(CUSTOMER_SECRET), false);

    if (process.platform !== "win32") {
      const symlinkPath = path.join(temporary, "linked.docflowrecipe");
      await fs.symlink(written.filePath, symlinkPath);
      await assert.rejects(() => readProjectRecipeFile(symlinkPath), error => ["ELOOP", "EMLINK"].includes(error?.code));
    }

    console.log("project recipe tests passed");
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
