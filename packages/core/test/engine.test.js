"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ERROR_CODES,
  SCHEMA_VERSION,
  ValidationError,
  createEngine
} = require("../src");
const { loopTableTemplate, minimalDocx, paragraph, visibleDocxText } = require("./helpers");

function formatterPlugin() {
  return {
    manifest: {
      schemaVersion: 1,
      id: "test.formatters",
      name: "Test formatters",
      version: "1.0.0",
      apiVersion: "1",
      entry: "index.js",
      capabilities: ["data-source", "transform", "formatter", "output-sink"],
      permissions: {}
    },
    activate(api) {
      api.registerDataSource("records", {
        extensions: [".records"],
        async parse({ bytes }) {
          const rows = bytes.toString("utf8").trim().split(/\r?\n/).filter(Boolean)
            .map(value => ({ value }));
          return {
            headers: ["value"],
            rows,
            sourceRows: rows.map((_row, index) => index + 1),
            warnings: []
          };
        }
      });
      api.registerTransform("decorate", (row, context) => ({
        ...row,
        label: `${context.options.prefix}${row.value}`
      }));
      api.registerFormatter("loud", value => String(value ?? "").toUpperCase());
      api.registerOutputSink("memory", {
        async write(artifacts) {
          const values = [];
          for await (const artifact of artifacts) values.push(artifact.relativePath);
          return values;
        }
      });
    }
  };
}

function job(overrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    data: {
      filename: "customers.json",
      bytes: Buffer.from(JSON.stringify([
        {
          "Customer Name": "Acme",
          quantity: 2,
          unitPrice: 6.25,
          items: [{ name: "Widget", qty: 2 }, { name: "Cable", qty: 3 }]
        },
        {
          "Customer Name": "Acme",
          quantity: 1,
          unitPrice: 5,
          items: [{ name: "Case", qty: 1 }]
        }
      ]))
    },
    template: { filename: "quotation.docx", bytes: loopTableTemplate() },
    mappings: { customer: "Customer Name" },
    computedFields: [{ name: "total", expression: "[quantity] * [unitPrice]" }],
    conditionalFields: [{ name: "show_note", expression: "[total] >= 5" }],
    output: {
      folderPattern: "../{{customer | lower}}",
      pattern: "{{customer}}"
    },
    ...overrides
  };
}

test("createEngine generate returns async artifacts with safe de-duplicated names", async () => {
  const engine = createEngine({ plugins: [formatterPlugin()] });
  const stream = engine.generate(job());
  assert.equal(typeof stream[Symbol.asyncIterator], "function");
  const artifacts = [];
  for await (const artifact of stream) artifacts.push(artifact);

  assert.equal(artifacts.length, 2);
  assert.equal(artifacts[0].schemaVersion, SCHEMA_VERSION);
  assert.equal(artifacts[0].relativePath, "acme/Acme.docx");
  assert.equal(artifacts[1].relativePath, "acme/Acme-2.docx");
  assert.equal(artifacts[0].rowIndex, 0);
  assert.match(artifacts[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(
    artifacts[0].mediaType,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );

  const text = visibleDocxText(artifacts[0].bytes);
  assert.match(text, /Customer:\s*ACME/);
  assert.match(text, /Total:\s*12\.50/);
  assert.match(text, /Approved/);
  assert.match(text, /Widget/);
  assert.match(text, /Cable/);
  assert.match(text, /2/);
  assert.match(text, /3/);
});

test("DOCX table loops preserve arrays instead of coercing them to boolean", async () => {
  const engine = createEngine({ plugins: [formatterPlugin()] });
  const [artifact] = await Array.fromAsync(engine.generate(job({
    data: {
      filename: "one.json",
      bytes: Buffer.from(JSON.stringify([{
        "Customer Name": "Loops",
        quantity: 1,
        unitPrice: 1,
        items: [{ name: "First", qty: 10 }, { name: "Second", qty: 20 }]
      }]))
    }
  })));
  const text = visibleDocxText(artifact.bytes);
  assert.match(text, /First/);
  assert.match(text, /Second/);
  assert.notEqual(text.match(/First/g)?.length, 0);
});

test("inspect and validate expose fields and row diagnostics", async () => {
  const engine = createEngine({ plugins: [formatterPlugin()] });
  const inspected = await engine.inspect(job());
  assert.equal(inspected.schemaVersion, SCHEMA_VERSION);
  assert.equal(inspected.data.schemaVersion, SCHEMA_VERSION);
  assert.equal(inspected.template.schemaVersion, SCHEMA_VERSION);
  assert.equal(inspected.data.rowCount, 2);
  assert(inspected.template.fields.includes("items"));
  assert(inspected.template.fields.includes("total"));

  const validation = await engine.validate(job({ requiredFields: ["customer", "missing"] }));
  assert.equal(validation.schemaVersion, SCHEMA_VERSION);
  assert.equal(validation.ok, false);
  assert.equal(validation.invalidRows, 2);
  assert.deepEqual(validation.issues[0].missingFields, ["missing"]);
  assert.deepEqual(
    validation.unmappedTemplateFields,
    [],
    "fields such as name/qty inside the items array must not be treated as top-level columns"
  );
});

test("strict generation surfaces a stable validation error", async () => {
  const engine = createEngine({ plugins: [formatterPlugin()] });
  await assert.rejects(
    async () => Array.fromAsync(engine.generate(job({
      requiredFields: ["missing"],
      strict: true
    }))),
    error => error instanceof ValidationError && error.code === ERROR_CODES.VALIDATION_FAILED
  );
});

test("generation rejects undocumented top-level properties", async () => {
  const engine = createEngine();
  await assert.rejects(
    async () => Array.fromAsync(engine.generate(job({ undocumented: true }))),
    error => error.code === ERROR_CODES.INVALID_REQUEST
  );
});

test("generation enforces the public request schema at runtime", async () => {
  const engine = createEngine();
  const bothDataAndRows = job({ rows: [{ customer: "rows" }] });
  const missingData = job();
  delete missingData.data;
  const invalidJobs = [
    bothDataAndRows,
    missingData,
    job({ strict: "true" }),
    job({ output: { pattern: "{{customer}}", undocumented: true } }),
    job({ transforms: [{ name: "decorate", undocumented: true }] }),
    job({ computedFields: [{ name: "total", expression: "1", undocumented: true }] })
  ];
  for (const invalid of invalidJobs) {
    await assert.rejects(
      async () => Array.fromAsync(engine.generate(invalid)),
      error => error.code === ERROR_CODES.INVALID_REQUEST
    );
  }
});

test("plugin output sinks consume artifacts and undeclared capabilities are rejected", async () => {
  const engine = createEngine({ plugins: [formatterPlugin()] });
  const output = await engine.output(engine.generate(job()), "memory");
  assert.deepEqual(output, ["acme/Acme.docx", "acme/Acme-2.docx"]);

  assert.throws(() => createEngine({
    plugins: [{
      manifest: {
        schemaVersion: 1,
        id: "test.invalid",
        name: "Invalid",
        version: "1.0.0",
        apiVersion: "1",
        entry: "index.js",
        capabilities: ["formatter"],
        permissions: {}
      },
      activate(api) {
        api.registerTransform("not-declared", row => row);
      }
    }]
  }), error => error.code === ERROR_CODES.PLUGIN_INVALID);
});

test("plugin data sources and transforms participate in generation", async () => {
  const engine = createEngine({ plugins: [formatterPlugin()] });
  const [artifact] = await Array.fromAsync(engine.generate({
    schemaVersion: 1,
    data: { filename: "input.records", bytes: Buffer.from("alpha\n") },
    template: {
      filename: "plugin.docx",
      bytes: minimalDocx(paragraph("{{label | loud}}"))
    },
    transforms: [{ name: "decorate", options: { prefix: "item-" } }],
    output: { pattern: "{{label}}" }
  }));
  assert.equal(artifact.relativePath, "item-alpha.docx");
  assert.match(visibleDocxText(artifact.bytes), /ITEM-ALPHA/);
});

test("built-in date, currency and number formatters render in DOCX", async () => {
  const engine = createEngine();
  const template = minimalDocx(paragraph(
    "{{date | date:DD/MM/YYYY}}|{{amount | currency:USD}}|{{ratio | percent:1}}"
  ));
  const [artifact] = await Array.fromAsync(engine.generate({
    schemaVersion: 1,
    rows: [{ date: "2026-07-29", amount: 1234.5, ratio: 0.125 }],
    template: { filename: "format.docx", bytes: template }
  }));
  const text = visibleDocxText(artifact.bytes);
  assert.match(text, /29\/07\/2026/);
  assert.match(text, /\$1,234\.50/);
  assert.match(text, /12\.5%/);
});
