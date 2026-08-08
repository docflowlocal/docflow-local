"use strict";

const assert = require("assert");
const path = require("path");
const AdmZip = require("adm-zip");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { createLocalEngine } = require("./engine");

async function onePagePdf(label = "DocFlow") {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 40, y: 800, size: 12, font });
  return Buffer.from(await document.save());
}

async function pdfFormTemplate() {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const form = document.getForm();
  const customer = form.createTextField("客户名称");
  customer.addToPage(page, { x: 70, y: 730, width: 260, height: 28 });
  const accepted = form.createCheckBox("已确认");
  accepted.addToPage(page, { x: 70, y: 680, width: 18, height: 18 });
  return Buffer.from(await document.save());
}

async function main() {
  let engine;
  try {
    engine = await createLocalEngine({
      staticDir: path.join(__dirname, "..", "static"),
      renderHtmlToPdf: html => onePagePdf(`HTML ${html.length}`),
      renderDocxToPdf: () => onePagePdf("DOCX")
    });
    const apiHeaders = {
      "X-DocFlow-Token": engine.token,
      Origin: engine.origin
    };

    const unauthorized = await fetch(`${engine.origin}/api/health`);
    assert.strictEqual(unauthorized.status, 401);
    const hostile = await fetch(`${engine.origin}/api/health`, {
      headers: { "X-DocFlow-Token": engine.token, Origin: "https://evil.example" }
    });
    assert.strictEqual(hostile.status, 403);
    const health = await fetch(`${engine.origin}/api/health`, { headers: apiHeaders });
    assert.strictEqual(health.status, 200);
    assert.strictEqual((await health.json()).ok, true);

    const csvForm = new FormData();
    csvForm.append("file", new Blob(["Company,Quote\nACME Ltd,Q-100\n"], { type: "text/csv" }), "customers.csv");
    const imported = await fetch(`${engine.origin}/api/import`, { method: "POST", headers: apiHeaders, body: csvForm });
    assert.strictEqual(imported.status, 200);
    const importedData = await imported.json();
    assert.deepStrictEqual(importedData.headers, ["Company", "Quote"]);
    assert.strictEqual(importedData.rows[0].Company, "ACME Ltd");

    const jsonForm = new FormData();
    jsonForm.append("file", new Blob([
      JSON.stringify({
        rows: [{
          Company: "JSON Customer",
          Quote: "J-100",
          Items: [{ name: "Consulting", amount: 1200 }]
        }]
      })
    ], { type: "application/json" }), "customers.json");
    const jsonImported = await fetch(`${engine.origin}/api/import`, {
      method: "POST",
      headers: apiHeaders,
      body: jsonForm
    });
    assert.strictEqual(jsonImported.status, 200);
    const jsonImportedData = await jsonImported.json();
    assert.deepStrictEqual(jsonImportedData.headers, ["Company", "Quote", "Items"]);
    assert.strictEqual(jsonImportedData.rows[0].Company, "JSON Customer");
    assert.deepStrictEqual(jsonImportedData.rows[0].Items, [{ name: "Consulting", amount: 1200 }]);

    const templateForm = new FormData();
    templateForm.append("file", new Blob([await pdfFormTemplate()], { type: "application/pdf" }), "customer-form.pdf");
    const uploaded = await fetch(`${engine.origin}/api/template`, { method: "POST", headers: apiHeaders, body: templateForm });
    assert.strictEqual(uploaded.status, 200);
    const template = await uploaded.json();
    assert.strictEqual(template.kind, "PDF");
    assert.strictEqual(template.fillable, true);
    assert(template.fields.includes("客户名称"));

    const payload = {
      locale: "en",
      rows: importedData.rows,
      mappings: { 客户名称: "Company", 报价编号: "Quote", 已确认: { kind: "literal", value: true } },
      requiredFields: ["客户名称", "报价编号"],
      computedFields: [],
      conditionalFields: [],
      templates: [template.id],
      settings: {
        filenamePattern: "{{客户名称}}-{{报价编号}}",
        folderPattern: "{{客户名称}}",
        validationReport: true,
        stopOnMissing: true,
        flattenPdf: true
      }
    };
    const validation = await fetch(`${engine.origin}/api/validate`, {
      method: "POST",
      headers: { ...apiHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(validation.status, 200);
    assert.strictEqual((await validation.json()).canGenerate, true);

    const generatedResponse = await fetch(`${engine.origin}/api/generate`, {
      method: "POST",
      headers: { ...apiHeaders, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(generatedResponse.status, 200);
    assert.strictEqual(generatedResponse.headers.get("x-docflow-generated"), "1");
    const archive = new AdmZip(Buffer.from(await generatedResponse.arrayBuffer()));
    const pdfEntries = archive.getEntries().filter(entry => entry.entryName.endsWith(".pdf"));
    assert.strictEqual(pdfEntries.length, 1);
    const generatedPdf = await PDFDocument.load(pdfEntries[0].getData());
    assert.strictEqual(generatedPdf.getPageCount(), 1);
    assert.strictEqual(generatedPdf.getForm().getFields().length, 0, "Delivery PDF should be flattened");
    assert(archive.getEntry("delivery-manifest.json"));
    assert(archive.getEntry("validation-report.csv"));

    const removed = await fetch(`${engine.origin}/api/template/${encodeURIComponent(template.id)}`, {
      method: "DELETE",
      headers: apiHeaders
    });
    assert.strictEqual(removed.status, 200);
    console.log("DocFlow local API tests passed:", {
      authentication: true,
      hostileOriginBlocked: true,
      csvImport: true,
      jsonImport: true,
      pdfTemplate: true,
      customOnlyGeneration: true,
      flattened: true
    });
  } finally {
    if (engine) await new Promise(resolve => engine.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
