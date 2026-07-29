"use strict";

const assert = require("assert");
const AdmZip = require("adm-zip");
const {
  FORMAT,
  LIMITS,
  ProjectFormatError,
  SCHEMA_VERSION,
  buildProjectArchive,
  parseProjectArchive,
  sha256
} = require("./project-format");

const DOCX_FIXTURE = Buffer.from("PK\u0003\u0004minimal-docx-template", "binary");
const PDF_FIXTURE = Buffer.from("%PDF-1.7\n% DocFlow Local test PDF\n%%EOF\n");

function baseManifest() {
  return {
    schemaVersion: 1,
    project: {
      name: "Trade quotation workflow",
      createdAt: "2026-07-29T08:00:00.000Z",
      updatedAt: "2026-07-29T08:30:00.000Z"
    },
    workflow: {
      expectedHeaders: ["Customer Name", "Quote Number", "Amount"],
      mappings: {
        客户名称: "Customer Name",
        报价编号: { kind: "source", source: "Quote Number" },
        币种: { kind: "literal", value: "CNY" }
      },
      requiredFields: ["客户名称", "报价编号"],
      requiredOverrides: { Amount: true },
      computedFields: [{ name: "含税金额", expression: "Amount * 1.13", digits: 2 }],
      conditionalFields: [{ name: "显示备注", expression: "Amount > 1000" }],
      templates: [
        { projectKey: "builtin.quote", builtIn: true, selected: true, order: 0 },
        {
          projectKey: "custom.contract",
          filename: "contract.docx",
          kind: "DOCX",
          selected: true,
          order: 1
        },
        {
          projectKey: "custom.terms",
          filename: "terms.pdf",
          kind: "PDF",
          selected: false,
          order: 2
        }
      ],
      settings: {
        filenamePattern: "{{Customer Name}}-{{Quote Number}}",
        folderPattern: "{{Customer Name}}",
        skipBlank: true,
        stopOnMissing: true,
        validationReport: true,
        includeSourceDocx: false,
        mergePdfs: true,
        flattenPdf: true,
        signature: "data:image/png;base64,customer-signature",
        assets: { "customer-photo.png": "data:image/png;base64,customer-photo" }
      },
      rows: [{ "Customer Name": "Secret Customer Ltd." }],
      sourceRows: [2],
      signature: "must-not-be-saved",
      assets: { secret: "must-not-be-saved" }
    },
    rows: [{ secret: "top-level-customer-row" }],
    sourceRows: [2],
    signature: "top-level-signature",
    assets: { secret: "top-level-asset" }
  };
}

function templateInputs() {
  return [
    {
      projectKey: "custom.contract",
      filename: "contract.docx",
      kind: "DOCX",
      data: DOCX_FIXTURE,
      sha256: sha256(DOCX_FIXTURE)
    },
    {
      projectKey: "custom.terms",
      filename: "terms.pdf",
      kind: "PDF",
      data: PDF_FIXTURE
    }
  ];
}

function expectProjectError(callback, code) {
  assert.throws(callback, error => {
    assert(error instanceof ProjectFormatError, `Expected ProjectFormatError, received ${error}`);
    assert.strictEqual(error.code, code);
    return true;
  });
}

function rewriteManifest(buffer, mutate) {
  const archive = new AdmZip(buffer);
  const manifest = JSON.parse(archive.readAsText("manifest.json"));
  mutate(manifest);
  archive.updateFile("manifest.json", Buffer.from(`${JSON.stringify(manifest)}\n`));
  return archive.toBuffer();
}

function duplicateManifestEntryArchive() {
  const archive = new AdmZip();
  archive.addFile("manifest.json", Buffer.from("{}"));
  archive.addFile("evilfest.json", Buffer.from("{}"));
  const buffer = archive.toBuffer();
  const source = Buffer.from("evilfest.json");
  const target = Buffer.from("manifest.json");
  assert.strictEqual(source.length, target.length);
  let replacements = 0;
  for (let offset = 0; offset <= buffer.length - source.length; offset += 1) {
    if (buffer.subarray(offset, offset + source.length).equals(source)) {
      target.copy(buffer, offset);
      replacements += 1;
      offset += source.length - 1;
    }
  }
  assert.strictEqual(replacements, 2, "Both local and central ZIP names should be patched");
  return buffer;
}

function traversalEntryArchive() {
  const archive = new AdmZip();
  archive.addFile("manifest.json", Buffer.from("{}"));
  archive.addFile("aa/escape.pdf", PDF_FIXTURE);
  const buffer = archive.toBuffer();
  const source = Buffer.from("aa/escape.pdf");
  const target = Buffer.from("../escape.pdf");
  assert.strictEqual(source.length, target.length);
  let replacements = 0;
  for (let offset = 0; offset <= buffer.length - source.length; offset += 1) {
    if (buffer.subarray(offset, offset + source.length).equals(source)) {
      target.copy(buffer, offset);
      replacements += 1;
      offset += source.length - 1;
    }
  }
  assert.strictEqual(replacements, 2, "Both local and central ZIP paths should be patched");
  return buffer;
}

function testRoundTripAndPrivacy() {
  const first = buildProjectArchive({ manifest: baseManifest(), templates: templateInputs() });
  const second = buildProjectArchive({ manifest: baseManifest(), templates: templateInputs() });
  const parsed = parseProjectArchive(first);
  const secondParsed = parseProjectArchive(second);

  assert.strictEqual(parsed.manifest.format, FORMAT);
  assert.strictEqual(parsed.manifest.schemaVersion, SCHEMA_VERSION);
  assert.match(parsed.manifest.project.id, /^prj_[a-f0-9]{24}$/);
  assert.strictEqual(
    parsed.manifest.project.id,
    secondParsed.manifest.project.id,
    "An omitted project ID should derive to the same stable key"
  );
  assert.deepStrictEqual(parsed.manifest.privacy, {
    containsCustomerData: false,
    excluded: ["rows", "sourceRows", "signature", "assets"]
  });
  assert.strictEqual(parsed.templates.length, 2);
  assert.deepStrictEqual(
    parsed.templates.map(template => ({
      projectKey: template.projectKey,
      filename: template.filename,
      kind: template.kind,
      data: template.data
    })),
    [
      {
        projectKey: "custom.contract",
        filename: "contract.docx",
        kind: "DOCX",
        data: DOCX_FIXTURE
      },
      {
        projectKey: "custom.terms",
        filename: "terms.pdf",
        kind: "PDF",
        data: PDF_FIXTURE
      }
    ]
  );
  assert.strictEqual(parsed.templates[0].sha256, sha256(DOCX_FIXTURE));
  assert.strictEqual(parsed.templates[1].sha256, sha256(PDF_FIXTURE));

  const resaved = parseProjectArchive(buildProjectArchive({
    manifest: parsed.manifest,
    templates: parsed.templates
  }));
  assert.strictEqual(resaved.manifest.project.id, parsed.manifest.project.id);
  assert.deepStrictEqual(
    resaved.templates.map(template => template.sha256),
    parsed.templates.map(template => template.sha256),
    "Parsed output should be directly reusable as build input"
  );

  const manifestText = new AdmZip(first).readAsText("manifest.json");
  for (const secret of [
    "Secret Customer Ltd.",
    "top-level-customer-row",
    "customer-signature",
    "customer-photo",
    "must-not-be-saved",
    "top-level-signature",
    "top-level-asset"
  ]) {
    assert(!manifestText.includes(secret), `Project manifest must not persist ${secret}`);
  }
  assert(!Object.prototype.hasOwnProperty.call(parsed.manifest.workflow.settings, "signature"));
  assert(!Object.prototype.hasOwnProperty.call(parsed.manifest.workflow.settings, "assets"));
  assert(!Object.prototype.hasOwnProperty.call(parsed.manifest.workflow, "rows"));
  assert(!Object.prototype.hasOwnProperty.call(parsed.manifest, "rows"));
}

function testTemplateHashTamper() {
  const original = buildProjectArchive({ manifest: baseManifest(), templates: templateInputs() });
  const tampered = rewriteManifest(original, manifest => {
    const descriptor = manifest.workflow.templates.find(item => item.projectKey === "custom.contract");
    descriptor.sha256 = "0".repeat(64);
  });
  expectProjectError(() => parseProjectArchive(tampered), "HASH_MISMATCH");

  const badInput = templateInputs();
  badInput[0] = { ...badInput[0], sha256: "f".repeat(64) };
  expectProjectError(
    () => buildProjectArchive({ manifest: baseManifest(), templates: badInput }),
    "HASH_MISMATCH"
  );
}

function testUnsafeUnknownAndDuplicateEntries() {
  expectProjectError(() => parseProjectArchive(traversalEntryArchive()), "UNSAFE_ARCHIVE_PATH");

  const unknown = new AdmZip();
  unknown.addFile("manifest.json", Buffer.from("{}"));
  unknown.addFile("notes.txt", Buffer.from("unexpected"));
  expectProjectError(() => parseProjectArchive(unknown.toBuffer()), "UNKNOWN_ARCHIVE_ENTRY");

  expectProjectError(
    () => parseProjectArchive(duplicateManifestEntryArchive()),
    "DUPLICATE_ARCHIVE_ENTRY"
  );
}

function testLimits() {
  const oversized = [{
    projectKey: "custom.too-large",
    filename: "too-large.pdf",
    kind: "PDF",
    data: Buffer.alloc(LIMITS.MAX_TEMPLATE_BYTES + 1)
  }];
  expectProjectError(
    () => buildProjectArchive({ manifest: baseManifest(), templates: oversized }),
    "TEMPLATE_LIMIT"
  );

  const tooManyEntries = new AdmZip();
  tooManyEntries.addFile("manifest.json", Buffer.from("{}"));
  for (let index = 0; index < LIMITS.MAX_ENTRY_COUNT; index += 1) {
    tooManyEntries.addFile(
      `templates/${String(index).padStart(32, "0")}.pdf`,
      PDF_FIXTURE
    );
  }
  expectProjectError(() => parseProjectArchive(tooManyEntries.toBuffer()), "ENTRY_LIMIT");
}

function testSchemaAndManifestSafety() {
  const original = buildProjectArchive({ manifest: baseManifest(), templates: templateInputs() });
  const futureSchema = rewriteManifest(original, manifest => {
    manifest.schemaVersion = 2;
  });
  expectProjectError(() => parseProjectArchive(futureSchema), "INVALID_SCHEMA");

  const unknownField = baseManifest();
  unknownField.workflow.telemetry = true;
  expectProjectError(
    () => buildProjectArchive({ manifest: unknownField, templates: templateInputs() }),
    "UNKNOWN_MANIFEST_FIELD"
  );

  const polluted = JSON.parse('{"schemaVersion":1,"project":{"name":"unsafe"},"workflow":{"mappings":{"__proto__":"polluted"}}}');
  expectProjectError(
    () => buildProjectArchive({ manifest: polluted }),
    "UNSAFE_MANIFEST"
  );
  assert.strictEqual({}.polluted, undefined);
}

function run() {
  testRoundTripAndPrivacy();
  testTemplateHashTamper();
  testUnsafeUnknownAndDuplicateEntries();
  testLimits();
  testSchemaAndManifestSafety();
  console.log("project format tests passed");
}

run();
