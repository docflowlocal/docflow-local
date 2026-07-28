"use strict";

const os = require("os");
const { performance } = require("perf_hooks");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { generateBundle } = require("./engine");
const packageJson = require("../package.json");

async function deterministicPdf() {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("DocFlow Local deterministic benchmark renderer", {
    x: 36,
    y: 800,
    size: 11,
    font
  });
  return Buffer.from(await document.save({
    useObjectStreams: false,
    updateFieldAppearances: false
  }));
}

function payloadFor(records) {
  return {
    locale: "en",
    rows: Array.from({ length: records }, (_, index) => ({
      "客户简称": `Customer-${String(index + 1).padStart(4, "0")}`,
      "客户名称": `Benchmark Customer ${index + 1}`,
      "报价编号": `B-${String(index + 1).padStart(6, "0")}`,
      "报价日期": "2026-07-28",
      "有效期": "2026-08-28",
      "产品名称": "Local document automation",
      "数量": 1,
      "单价": "99.00",
      "税率": "0%",
      "含税总额": "99.00"
    })),
    mappings: {},
    requiredFields: ["客户简称", "报价编号"],
    computedFields: [],
    conditionalFields: [],
    templates: ["quote"],
    settings: {
      filenamePattern: "{{客户简称}}-{{报价编号}}",
      folderPattern: "{{客户简称}}",
      validationReport: true,
      stopOnMissing: true,
      skipBlank: true
    }
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function runScenario(records, pdf) {
  const timings = [];
  let latest;
  for (let repeat = 0; repeat < 3; repeat += 1) {
    const started = performance.now();
    latest = await generateBundle(payloadFor(records), {
      renderHtmlToPdf: async () => Buffer.from(pdf)
    });
    timings.push(performance.now() - started);
  }
  const elapsedMs = median(timings);
  return {
    records,
    documents: latest.manifest.summary.documents,
    archiveBytes: latest.buffer.length,
    medianMs: Math.round(elapsedMs),
    recordsPerSecond: Number((records / (elapsedMs / 1000)).toFixed(1)),
    repeats: timings.map(value => Math.round(value))
  };
}

async function main() {
  const pdf = await deterministicPdf();
  await generateBundle(payloadFor(10), {
    renderHtmlToPdf: async () => Buffer.from(pdf)
  });

  const results = [];
  for (const records of [100, 500, 1000]) {
    results.push(await runScenario(records, pdf));
  }

  const output = {
    benchmark: "DocFlow Local deterministic engine pipeline",
    scope: "Validation, naming, PDF integrity checks, ZIP packaging, manifest generation, and checksum verification. Excludes real DOCX/HTML rendering.",
    productVersion: packageJson.version,
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      release: os.release(),
      architecture: process.arch,
      cpu: os.cpus()[0]?.model || "unknown",
      logicalCpus: os.cpus().length,
      memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1))
    },
    results
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
