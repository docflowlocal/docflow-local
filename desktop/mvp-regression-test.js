"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const ExcelJS = require("exceljs");
const fontkit = require("@pdf-lib/fontkit");
const {
  PDFDocument,
  PDFName,
  PDFString,
  StandardFonts
} = require("pdf-lib");
const {
  createLocalEngine,
  generateBundle,
  parseTabular
} = require("./engine");
const {
  renderDocxTemplate
} = require("./template-engine");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);
const PNG_DATA_URL = `data:image/png;base64,${PNG.toString("base64")}`;

async function onePagePdf(label = "DocFlow regression") {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 36, y: 800, size: 12, font });
  return Buffer.from(await document.save({
    useObjectStreams: false,
    updateFieldAppearances: false
  }));
}

function minimalDocx(bodyXml, extraEntries = {}) {
  const archive = new AdmZip();
  archive.addFile(
    "[Content_Types].xml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  );
  archive.addFile(
    "_rels/.rels",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  );
  archive.addFile(
    "word/document.xml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body>
</w:document>`)
  );
  archive.addFile(
    "word/_rels/document.xml.rels",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`)
  );
  for (const [entryName, content] of Object.entries(extraEntries)) {
    archive.addFile(entryName, Buffer.isBuffer(content) ? content : Buffer.from(content));
  }
  return archive.toBuffer();
}

function visibleDocxText(buffer) {
  return new AdmZip(buffer)
    .readAsText("word/document.xml")
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

async function activeJavaScriptPdf() {
  const document = await PDFDocument.create();
  document.addPage([300, 300]);
  const action = document.context.obj({
    S: PDFName.of("JavaScript"),
    JS: PDFString.of("app.alert('unsafe')")
  });
  document.catalog.set(PDFName.of("OpenAction"), document.context.register(action));
  return Buffer.from(await document.save({ useObjectStreams: false }));
}

async function resourcePdfTemplate() {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  document.registerFontkit(fontkit);
  const chineseFont = await document.embedFont(
    fs.readFileSync(require.resolve("@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff")),
    { subset: true }
  );
  const form = document.getForm();

  const image = form.createButton("@image:证件照");
  image.addToPage("", page, { x: 55, y: 650, width: 120, height: 120, font });

  const region = form.createDropdown("地区");
  region.addOptions(["华东", "华南"]);
  region.select("华东");
  region.addToPage(page, { x: 210, y: 710, width: 150, height: 28, font: chineseFont });

  return Buffer.from(await document.save({
    useObjectStreams: false,
    updateFieldAppearances: false
  }));
}

function responseError(data) {
  return data && typeof data === "object" ? String(data.error || JSON.stringify(data)) : String(data);
}

async function responseJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { error: text };
  }
}

function makeApi(engine) {
  const headers = {
    "X-DocFlow-Token": engine.token,
    Origin: engine.origin
  };

  return {
    headers,
    async json(route, payload) {
      const response = await fetch(`${engine.origin}${route}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return { response, data: await responseJson(response) };
    },
    async upload(filename, buffer, mimeType) {
      const form = new FormData();
      form.append("file", new Blob([buffer], { type: mimeType }), filename);
      const response = await fetch(`${engine.origin}/api/template`, {
        method: "POST",
        headers,
        body: form
      });
      return { response, data: await responseJson(response) };
    },
    async generate(payload) {
      const response = await fetch(`${engine.origin}/api/generate`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        return {
          response,
          archive: new AdmZip(Buffer.from(await response.arrayBuffer()))
        };
      }
      return { response, data: await responseJson(response) };
    }
  };
}

function basePayload(overrides = {}) {
  return {
    locale: "en",
    rows: [{ 记录号: "R-1" }],
    mappings: {},
    requiredFields: [],
    computedFields: [],
    conditionalFields: [],
    templates: ["quote"],
    settings: {
      filenamePattern: "{{记录号}}",
      folderPattern: "output",
      validationReport: true,
      stopOnMissing: true,
      skipBlank: true,
      ...overrides.settings
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "settings"))
  };
}

function archiveJson(archive, filename = "delivery-manifest.json") {
  const entry = archive.getEntry(filename);
  assert(entry, `${filename} should exist`);
  return JSON.parse(entry.getData().toString("utf8"));
}

function pathsFromManifestCollection(collection) {
  if (!Array.isArray(collection)) return [];
  return collection.map(item => typeof item === "string" ? item : item?.path).filter(Boolean);
}

async function main() {
  let engine;
  const failures = [];
  const passes = [];

  async function regression(name, callback) {
    try {
      await callback();
      passes.push(name);
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push({ name, error });
      console.error(`FAIL ${name}: ${error.stack || error.message}`);
    }
  }

  try {
    engine = await createLocalEngine({
      staticDir: path.join(__dirname, "..", "static"),
      renderHtmlToPdf: html => onePagePdf(`HTML ${html.length}`),
      renderDocxToPdf: () => onePagePdf("DOCX")
    });
    const api = makeApi(engine);

    await regression("CSV delimiter detection ignores comma and semicolon inside quotes", async () => {
      const semicolonDelimited = await parseTabular(
        "semicolon.csv",
        Buffer.from('"名称,法定";地址;"说明;内部"\n"示例,公司";"上海,中国";"A;B"\n')
      );
      assert.deepStrictEqual(semicolonDelimited.headers, ["名称,法定", "地址", "说明;内部"]);
      assert.deepStrictEqual(semicolonDelimited.rows[0], {
        "名称,法定": "示例,公司",
        地址: "上海,中国",
        "说明;内部": "A;B"
      });

      const commaDelimited = await parseTabular(
        "comma.csv",
        Buffer.from('Name,Address,"Internal; label"\n"ACME; Ltd","Shanghai, China","A;B"\n')
      );
      assert.deepStrictEqual(commaDelimited.headers, ["Name", "Address", "Internal; label"]);
      assert.strictEqual(commaDelimited.rows[0].Name, "ACME; Ltd");
      assert.strictEqual(commaDelimited.rows[0].Address, "Shanghai, China");

      const physicalRows = await parseTabular(
        "source-rows.csv",
        Buffer.from('Name,Req\n\n"Multi\nLine",ok\nBad,\n')
      );
      assert.deepStrictEqual(physicalRows.sourceRows, [2, 3, 5]);
      assert.strictEqual(physicalRows.rows[2].Name, "Bad");
    });

    await regression("direct and formula-result Excel dates normalize identically", async () => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Data");
      worksheet.addRow(["Direct date", "Formula date"]);
      const direct = new Date(2026, 6, 27);
      const formulaResult = new Date(2026, 6, 28);
      worksheet.getCell("A2").value = direct;
      worksheet.getCell("A2").numFmt = "yyyy-mm-dd";
      worksheet.getCell("B2").value = { formula: "A2+1", result: formulaResult };
      worksheet.getCell("B2").numFmt = "yyyy-mm-dd";
      const parsed = await parseTabular("dates.xlsx", Buffer.from(await workbook.xlsx.writeBuffer()));
      assert.deepStrictEqual(parsed.rows[0], {
        "Direct date": "2026-07-27",
        "Formula date": "2026-07-28"
      });

      const formattedWorkbook = new ExcelJS.Workbook();
      const formattedSheet = formattedWorkbook.addWorksheet("Formatted");
      formattedSheet.addRow(["Identifier", "Rate", "Amount"]);
      formattedSheet.getCell("A2").value = 123;
      formattedSheet.getCell("A2").numFmt = "000000";
      formattedSheet.getCell("B2").value = 0.13;
      formattedSheet.getCell("B2").numFmt = "0%";
      formattedSheet.getCell("C2").value = { formula: "1000+234.5", result: 1234.5 };
      formattedSheet.getCell("C2").numFmt = "$#,##0.00";
      const formatted = await parseTabular(
        "formatted.xlsx",
        Buffer.from(await formattedWorkbook.xlsx.writeBuffer())
      );
      assert.deepStrictEqual(formatted.rows[0], {
        Identifier: "000123",
        Rate: "13%",
        Amount: "$1,234.50"
      });

      const sparseWorkbook = new ExcelJS.Workbook();
      const sparseSheet = sparseWorkbook.addWorksheet("Sparse");
      sparseSheet.getRow(1).values = ["Name", "Req"];
      sparseSheet.getRow(3).values = ["Bad", ""];
      const sparse = await parseTabular(
        "sparse.xlsx",
        Buffer.from(await sparseWorkbook.xlsx.writeBuffer())
      );
      assert.deepStrictEqual(sparse.sourceRows, [2, 3]);
      assert.strictEqual(sparse.rows[1].Name, "Bad");
    });

    await regression("field mapping is applied before computed formulas", async () => {
      const payload = basePayload({
        rows: [{ 外部单价: "12.5", 数量: "4", 记录号: "MAP-1" }],
        mappings: { 单价: "外部单价" },
        computedFields: [{ name: "总额", expression: "单价 * 数量", digits: 2 }],
        requiredFields: ["总额"]
      });
      const { response, data } = await api.json("/api/validate", payload);
      assert.strictEqual(response.status, 200, responseError(data));
      assert.strictEqual(data.canGenerate, true);
      assert.strictEqual(data.rows[0].单价, "12.5");
      assert.strictEqual(data.rows[0].总额, 50);
    });

    await regression("built-in quotation obeys the configured discount condition", async () => {
      let hiddenHtml = "";
      await generateBundle(
        basePayload({
          rows: [{ 记录号: "COND-OFF", 数量: 1, 单价: 100, 优惠: 10 }],
          conditionalFields: [{ name: "显示优惠行", expression: "false" }],
          settings: { validationReport: false }
        }),
        {
          renderHtmlToPdf: async html => {
            hiddenHtml = html;
            return onePagePdf("condition-off");
          }
        }
      );
      assert(!hiddenHtml.includes(">Discount<"), "False condition should hide the discount row");

      let visibleHtml = "";
      await generateBundle(
        basePayload({
          rows: [{ 记录号: "COND-ON", 数量: 1, 单价: 100, 优惠: 0 }],
          conditionalFields: [{ name: "显示优惠行", expression: "true" }],
          settings: { validationReport: false }
        }),
        {
          renderHtmlToPdf: async html => {
            visibleHtml = html;
            return onePagePdf("condition-on");
          }
        }
      );
      assert(visibleHtml.includes(">Discount<"), "True condition should show the discount row");

      const oversizedQr = await api.json("/api/validate", basePayload({
        rows: [{ 记录号: "QR-LIMIT", 二维码内容: "x".repeat(2001) }]
      }));
      assert.strictEqual(oversizedQr.response.status, 200, responseError(oversizedQr.data));
      assert.strictEqual(oversizedQr.data.valid, 0);
      assert(
        oversizedQr.data.issues[0].errors.some(error => /二维码|2000/.test(error)),
        "Oversized built-in QR content should fail preflight"
      );
    });

    await regression("blank-row filtering preserves original source row numbers", async () => {
      const staticPdf = await onePagePdf("source-row");
      const uploaded = await api.upload("source-row.pdf", staticPdf, "application/pdf");
      assert.strictEqual(uploaded.response.status, 200, responseError(uploaded.data));
      const imported = await parseTabular(
        "source-row.csv",
        Buffer.from("记录号,说明\n\nROW-3,kept\n\nROW-5,kept\n")
      );
      const payload = basePayload({
        rows: imported.rows,
        sourceRows: imported.sourceRows,
        templates: [uploaded.data.id],
        settings: { validationReport: false, skipBlank: true }
      });
      const generated = await api.generate(payload);
      assert.strictEqual(generated.response.status, 200, responseError(generated.data));
      const manifest = archiveJson(generated.archive);
      assert.deepStrictEqual(manifest.items.map(item => item.sourceRow), [3, 5]);
    });

    await regression("rule errors remain non-generatable when stopOnMissing is false", async () => {
      const payload = basePayload({
        rows: [{ 记录号: "RULE-1" }],
        computedFields: [{ name: "坏公式", expression: "1 / 0" }],
        settings: { stopOnMissing: false }
      });
      const validation = await api.json("/api/validate", payload);
      assert.strictEqual(validation.response.status, 200, responseError(validation.data));
      assert.strictEqual(validation.data.valid, 0);
      assert.strictEqual(validation.data.canGenerate, false);
      assert(validation.data.issues[0].errors.some(error => error.includes("坏公式")));
      const generated = await api.generate(payload);
      assert.strictEqual(generated.response.status, 400, "Rule-error record must not reach document generation");
    });

    await regression("missing filename fields block generation even when missing values are otherwise allowed", async () => {
      const payload = basePayload({
        rows: [{ 客户名称: "No code" }],
        settings: {
          filenamePattern: "{{必须编号}}",
          folderPattern: "output",
          stopOnMissing: false
        }
      });
      const validation = await api.json("/api/validate", payload);
      assert.strictEqual(validation.response.status, 200, responseError(validation.data));
      assert.strictEqual(validation.data.valid, 0);
      assert.strictEqual(validation.data.canGenerate, false);
      assert(validation.data.issues[0].missing.includes("必须编号"));
      const generated = await api.generate(payload);
      assert.strictEqual(generated.response.status, 400, "A missing naming component must never generate an unnamed file");
    });

    await regression("validation CSV escapes formulas and manifest describes support files and skipped issues", async () => {
      const staticPdf = await onePagePdf("manifest");
      const uploaded = await api.upload("manifest.pdf", staticPdf, "application/pdf");
      assert.strictEqual(uploaded.response.status, 200, responseError(uploaded.data));
      const payload = basePayload({
        rows: [
          { 记录号: "GOOD", 客户名称: "Safe customer", 必填: "yes" },
          { 记录号: "BAD", 客户名称: '=HYPERLINK("https://evil.example","x")', 必填: "" }
        ],
        requiredFields: ["必填"],
        templates: [uploaded.data.id],
        settings: { validationReport: true, stopOnMissing: true }
      });
      const generated = await api.generate(payload);
      assert.strictEqual(generated.response.status, 200, responseError(generated.data));
      const report = generated.archive.getEntry("validation-report.csv");
      assert(report, "validation-report.csv should exist");
      const reportText = report.getData().toString("utf8");
      assert(
        reportText.includes(`'=HYPERLINK`),
        `Spreadsheet formula must be prefixed by an apostrophe:\n${reportText}`
      );

      const manifest = archiveJson(generated.archive);
      assert.strictEqual(manifest.summary.skipped, 1);
      const supportPaths = [
        ...pathsFromManifestCollection(manifest.supportFiles),
        ...pathsFromManifestCollection(manifest.files),
        ...pathsFromManifestCollection(manifest.artifacts)
      ];
      assert(
        supportPaths.includes("validation-report.csv"),
        "Manifest should explicitly list the validation report as a support file"
      );
      const skippedIssues = manifest.skippedIssues
        || manifest.validation?.issues
        || (Array.isArray(manifest.skipped) ? manifest.skipped : null)
        || (Array.isArray(manifest.issues) ? manifest.issues : null);
      assert(Array.isArray(skippedIssues), "Manifest should include detailed skipped-record issues");
      const skipped = skippedIssues.find(issue => Number(issue.sourceRow ?? issue.row) === 3);
      assert(skipped, "Manifest should retain the skipped record's source row");
      assert(
        Array.isArray(skipped.missing) && skipped.missing.includes("必填"),
        "Manifest should retain the skipped record's missing fields"
      );
    });

    await regression("static PDF template bytes are preserved exactly", async () => {
      const staticPdf = await onePagePdf("byte-preservation");
      const result = await generateBundle(
        basePayload({
          templates: ["static-byte-template"],
          settings: { validationReport: false },
          templateRegistry: {
            "static-byte-template": {
              id: "static-byte-template",
              filename: "signed-static.pdf",
              kind: "PDF",
              fillable: false,
              data: staticPdf
            }
          }
        }),
        {
          renderHtmlToPdf: html => onePagePdf(`HTML ${html.length}`)
        }
      );
      const archive = new AdmZip(result.buffer);
      const output = archive.getEntries().find(entry => entry.entryName.endsWith(".pdf"));
      assert(output, "Static PDF output should exist");
      assert.strictEqual(Buffer.compare(output.getData(), staticPdf), 0, "Static PDF bytes must not be rewritten");
    });

    await regression("case-insensitive output path collisions receive deterministic suffixes", async () => {
      const staticPdf = await onePagePdf("collision");
      const result = await generateBundle(
        basePayload({
          rows: [{ 名称: "ACME" }, { 名称: "acme" }],
          templates: ["case-template"],
          settings: {
            filenamePattern: "{{名称}}",
            folderPattern: "same",
            validationReport: false
          },
          templateRegistry: {
            "case-template": {
              id: "case-template",
              filename: "form.pdf",
              kind: "PDF",
              fillable: false,
              data: staticPdf
            }
          }
        }),
        {}
      );
      const paths = result.manifest.items.flatMap(item => item.files.map(file => file.path));
      assert.strictEqual(paths.length, 2);
      assert.strictEqual(new Set(paths.map(filename => filename.normalize("NFC").toLowerCase())).size, 2);
      assert(paths.some(filename => /-2\.pdf$/i.test(filename)), `Expected a -2 suffix: ${paths.join(", ")}`);
    });

    await regression("PDF templates containing active JavaScript are rejected", async () => {
      const uploaded = await api.upload("active.pdf", await activeJavaScriptPdf(), "application/pdf");
      assert.strictEqual(uploaded.response.status, 400, "Active PDF should be rejected");
      assert(/活动内容|OpenAction|JavaScript/i.test(responseError(uploaded.data)), responseError(uploaded.data));
    });

    await regression("DOCX templates containing active content are rejected", async () => {
      const active = minimalDocx(
        "<w:p><w:r><w:t>{{客户名称}}</w:t></w:r></w:p>",
        { "word/vbaProject.bin": Buffer.from("not-a-real-macro") }
      );
      const uploaded = await api.upload(
        "macro.docx",
        active,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      assert.strictEqual(uploaded.response.status, 400, "Macro-enabled DOCX payload should be rejected");
      assert(/活动|嵌入|vbaProject/i.test(responseError(uploaded.data)), responseError(uploaded.data));

      const dde = minimalDocx(
        '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>DDEAUTO "cmd.exe" "/c calc"</w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
      );
      const ddeUpload = await api.upload(
        "dde.docx",
        dde,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      assert.strictEqual(ddeUpload.response.status, 400, "DDE field DOCX payload should be rejected");
      assert(/活动字段|DDEAUTO/i.test(responseError(ddeUpload.data)), responseError(ddeUpload.data));

      const includePicture = minimalDocx(
        '<w:p><w:fldSimple w:instr=\'INCLUDEPICTURE "https://example.invalid/pixel.png"\'><w:r><w:t>image</w:t></w:r></w:fldSimple></w:p>'
      );
      const includeUpload = await api.upload(
        "include-picture.docx",
        includePicture,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      assert.strictEqual(includeUpload.response.status, 400, "External INCLUDEPICTURE field should be rejected");
      assert(/活动字段|INCLUDEPICTURE/i.test(responseError(includeUpload.data)), responseError(includeUpload.data));

      const aliasedField = minimalDocx(
        '<x:fldSimple xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main" x:instr=\'DDEAUTO "cmd.exe"\'><x:r><x:t>result</x:t></x:r></x:fldSimple>'
      );
      const aliasedUpload = await api.upload(
        "aliased-field.docx",
        aliasedField,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      assert.strictEqual(aliasedUpload.response.status, 400, "Namespace-aliased DDE field should be rejected");
      assert(/活动字段|DDEAUTO/i.test(responseError(aliasedUpload.data)), responseError(aliasedUpload.data));

      const aliasedRelationshipArchive = new AdmZip(minimalDocx("<w:p><w:r><w:t>{{客户名称}}</w:t></w:r></w:p>"));
      aliasedRelationshipArchive.deleteFile("word/_rels/document.xml.rels");
      aliasedRelationshipArchive.addFile(
        "word/_rels/document.xml.rels",
        Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<p:Relationships xmlns:p="http://schemas.openxmlformats.org/package/2006/relationships">
  <p:Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.invalid/pixel.png" TargetMode="External"/>
</p:Relationships>`)
      );
      const aliasedRelationshipUpload = await api.upload(
        "aliased-relationship.docx",
        aliasedRelationshipArchive.toBuffer(),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      assert.strictEqual(aliasedRelationshipUpload.response.status, 400, "Namespace-aliased external relationship should be rejected");
      assert(/外部关系|image/i.test(responseError(aliasedRelationshipUpload.data)), responseError(aliasedRelationshipUpload.data));
    });

    await regression("high-compression-ratio DOCX entries are rejected", async () => {
      const bomb = minimalDocx(
        "<w:p><w:r><w:t>{{客户名称}}</w:t></w:r></w:p>",
        { "word/compressed-payload.bin": Buffer.alloc(2 * 1024 * 1024, 0) }
      );
      const uploaded = await api.upload(
        "compressed.docx",
        bomb,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      assert.strictEqual(uploaded.response.status, 400, "High-ratio DOCX payload should be rejected");
      assert(/压缩比|安全限制/i.test(responseError(uploaded.data)), responseError(uploaded.data));
    });

    await regression("DOCX conditional strings false, 0 and 否 are all false", async () => {
      const template = minimalDocx(
        "<w:p><w:r><w:t>{{#显示}}</w:t></w:r></w:p>"
        + "<w:p><w:r><w:t>SHOULD_NOT_RENDER</w:t></w:r></w:p>"
        + "<w:p><w:r><w:t>{{/显示}}</w:t></w:r></w:p>"
        + "<w:p><w:r><w:t>ALWAYS_RENDER</w:t></w:r></w:p>"
      );
      for (const value of ["false", "0", "否"]) {
        const rendered = await renderDocxTemplate(template, { 显示: value });
        const text = visibleDocxText(rendered.buffer);
        assert(!text.includes("SHOULD_NOT_RENDER"), `Value ${value} should hide conditional content`);
        assert(text.includes("ALWAYS_RENDER"));
      }
    });

    await regression("PDF logical asset fields map resources and Chinese dropdowns can select or clear", async () => {
      const uploaded = await api.upload("resource-form.pdf", await resourcePdfTemplate(), "application/pdf");
      assert.strictEqual(uploaded.response.status, 200, responseError(uploaded.data));
      assert(uploaded.data.fields.includes("证件照"), JSON.stringify(uploaded.data));
      assert(!uploaded.data.fields.includes("@image:证件照"), JSON.stringify(uploaded.data));
      assert(
        uploaded.data.assets.some(asset => asset.kind === "image" && asset.source === "证件照"),
        JSON.stringify(uploaded.data.assets)
      );

      const payload = basePayload({
        rows: [
          { 记录号: "PDF-1", 图片文件: "portrait.png", 地区值: "华南" },
          { 记录号: "PDF-2", 图片文件: "portrait.png", 地区值: "" }
        ],
        mappings: {
          证件照: "图片文件",
          地区: "地区值"
        },
        templates: [uploaded.data.id],
        settings: {
          validationReport: false,
          flattenPdf: false,
          assets: { "portrait.png": PNG_DATA_URL }
        }
      });
      const generated = await api.generate(payload);
      assert.strictEqual(generated.response.status, 200, responseError(generated.data));
      const pdfEntries = generated.archive.getEntries().filter(entry => entry.entryName.endsWith(".pdf"));
      assert.strictEqual(pdfEntries.length, 2);

      const firstEntry = pdfEntries.find(entry => /PDF-1/i.test(entry.entryName));
      const secondEntry = pdfEntries.find(entry => /PDF-2/i.test(entry.entryName));
      assert(firstEntry && secondEntry, pdfEntries.map(entry => entry.entryName).join(", "));
      const first = await PDFDocument.load(firstEntry.getData());
      const second = await PDFDocument.load(secondEntry.getData());
      assert.deepStrictEqual(first.getForm().getDropdown("地区").getSelected(), ["华南"]);
      assert.deepStrictEqual(second.getForm().getDropdown("地区").getSelected(), []);
      assert(
        first.context.enumerateIndirectObjects().some(([, object]) => String(object?.dict?.get?.(PDFName.of("Subtype")) || "") === "/Image"),
        "Mapped image resource should be embedded into the first PDF"
      );
    });
  } finally {
    if (engine) await new Promise(resolve => engine.close(resolve));
  }

  console.log(`\nDocFlow MVP regression summary: ${passes.length} passed, ${failures.length} failed.`);
  if (failures.length) {
    console.error("Failed regressions:");
    for (const failure of failures) console.error(`- ${failure.name}: ${failure.error.message}`);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
