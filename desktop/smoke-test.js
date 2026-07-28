const assert = require("assert");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const ExcelJS = require("exceljs");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { parseTabular, extractDocxFields, applyRules, validateRows, generateBundle } = require("./engine");

async function main() {
  const root = path.join(__dirname, "..");
  const csv = fs.readFileSync(path.join(root, "sample-data.csv"));
  const csvResult = await parseTabular("sample-data.csv", csv);
  assert.strictEqual(csvResult.rows.length, 8);
  assert(csvResult.headers.includes("客户简称"));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("报价");
  sheet.addRow(["客户简称", "数量", "单价", "日期"]);
  sheet.addRow(["测试客户", 2, 99.5, new Date(2026, 6, 27)]);
  sheet.getCell("D2").numFmt = "yyyy-mm-dd";
  const excel = await workbook.xlsx.writeBuffer();
  const excelResult = await parseTabular("test.xlsx", Buffer.from(excel));
  assert.deepStrictEqual(excelResult.headers, ["客户简称", "数量", "单价", "日期"]);
  assert.strictEqual(Number(excelResult.rows[0]["数量"]), 2);
  assert.strictEqual(excelResult.rows[0]["日期"], "2026-07-27");

  const docx = new AdmZip();
  docx.addFile("word/document.xml", Buffer.from('<w:document><w:r><w:t>{{客户</w:t></w:r><w:r><w:t>名称}}</w:t></w:r></w:document>'));
  assert.deepStrictEqual(extractDocxFields(docx.toBuffer()), ["客户名称"]);

  const computed = [
    { name: "小计", expression: "数量 * 单价" },
    { name: "税额", expression: "(数量 * 单价 - 优惠) * 税率" },
    { name: "含税总额", expression: "round((数量 * 单价 - 优惠) * (1 + 税率), 2)" }
  ];
  const rows = applyRules(csvResult.rows, computed);
  assert.strictEqual(rows[0]["含税总额"], 41358);
  const required = ["客户简称", "客户名称", "报价编号", "联系人", "邮箱", "产品名称", "数量", "单价"];
  const validation = validateRows(rows, required);
  assert.deepStrictEqual([validation.total, validation.valid, validation.invalid], [8, 6, 2]);
  const allowedMissing = validateRows([{ name: "" }], ["name"], "en", [], false);
  assert.deepStrictEqual([allowedMissing.valid, allowedMissing.invalid], [1, 1]);
  const rejectedRuleError = validateRows(
    [{ name: "Customer" }],
    [],
    "en",
    [{ rowIndex: 0, field: "total", message: "division by zero" }],
    false
  );
  assert.deepStrictEqual([rejectedRuleError.valid, rejectedRuleError.invalid], [0, 1]);

  const renderedHtml = [];
  const fakePdf = async html => {
    renderedHtml.push(html);
    const document = await PDFDocument.create();
    const page = document.addPage([595, 842]);
    const font = await document.embedFont(StandardFonts.Helvetica);
    page.drawText(`DocFlow smoke ${html.length}`, { x: 40, y: 800, size: 12, font, color: rgb(0.1, 0.2, 0.3) });
    return Buffer.from(await document.save());
  };
  const bundle = await generateBundle({
    rows: csvResult.rows,
    requiredFields: required,
    computedFields: computed,
    templates: ["quote", "attachment"],
    settings: { filenamePattern: "{{客户简称}}-报价单-{{报价编号}}", folderPattern: "{{客户简称}}/{{报价编号}}" }
  }, fakePdf);
  const archive = new AdmZip(bundle.buffer);
  const entries = archive.getEntries().map(entry => entry.entryName);
  assert.strictEqual(entries.filter(name => name.endsWith(".pdf")).length, 12);
  assert(entries.includes("交付清单.json"));
  assert(entries.includes("校验报告.csv"));

  const englishBundle = await generateBundle({
    locale: "en",
    rows: [csvResult.rows[0]],
    requiredFields: required,
    computedFields: computed,
    templates: ["quote", "attachment"],
    settings: { filenamePattern: "{{客户简称}}-Quotation-{{报价编号}}", folderPattern: "{{客户简称}}/{{报价编号}}" }
  }, fakePdf);
  const englishEntries = new AdmZip(englishBundle.buffer).getEntries().map(entry => entry.entryName);
  assert(englishEntries.includes("delivery-manifest.json"));
  assert(englishEntries.includes("validation-report.csv"));
  assert(englishEntries.some(name => name.endsWith("-project-appendix.pdf")));
  assert(renderedHtml.some(html => html.includes("<h1>Quotation</h1>")));
  assert(renderedHtml.some(html => html.includes("Delivery Appendix · Project Details")));

  await generateBundle({
    locale: "en",
    rows: [{ Company: "ACME Ltd", Quote: "Q-100", Quantity: 2, Price: 15 }],
    mappings: {
      客户简称: "Company",
      客户名称: "Company",
      报价编号: "Quote",
      数量: "Quantity",
      单价: "Price"
    },
    requiredFields: ["客户简称", "报价编号"],
    computedFields: [{ name: "Subtotal", expression: "Quantity * Price" }],
    conditionalFields: [{ name: "ShowDiscount", expression: "Subtotal > 20" }],
    templates: ["quote"],
    settings: { filenamePattern: "{{客户简称}}-{{报价编号}}", folderPattern: "{{客户简称}}" }
  }, fakePdf);
  assert(renderedHtml.at(-1).includes("ACME Ltd"), "Mapped data must be used in document rendering");

  await generateBundle({
    rows: [{
      客户简称: "零值客户",
      报价编号: "ZERO-1",
      数量: 0,
      单价: 25,
      小计: 0,
      税率: 0,
      税额: 0,
      含税总额: 0
    }],
    requiredFields: ["客户简称", "报价编号"],
    templates: ["quote"],
    settings: { filenamePattern: "{{客户简称}}-{{报价编号}}", folderPattern: "{{客户简称}}" }
  }, fakePdf);
  const zeroHtml = renderedHtml.at(-1);
  assert(zeroHtml.includes("<td>0</td>"), "A numeric quantity of zero must not fall back to one");
  assert(zeroHtml.includes("(0%)"), "A numeric tax rate of zero must not fall back to 13%");

  console.log("DocFlow desktop smoke test passed:", {
    rows: 8,
    valid: 6,
    pdfs: 12,
    bilingual: true,
    mappedGeneration: true,
    entries: entries.length
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
