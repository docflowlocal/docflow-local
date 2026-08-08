const assert = require("assert");
const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { PDFDocument } = require("pdf-lib");
const { generateBundle, parseTabular } = require("./engine");
console.log("DocFlow PDF smoke test starting");
const { renderDocxToPdf, renderHtmlToPdf } = require("./main");

const TEST_TIMEOUT_MS = 120_000;
let smokeFinished = false;

process.on("exit", code => {
  if (!smokeFinished && code === 0) process.exitCode = 1;
});
// Electron's default is to quit when the last BrowserWindow closes if this
// event has no listener. Each PDF render intentionally uses a short-lived
// hidden window, so keep the test host alive between sequential renders.
app.on("window-all-closed", () => {});

app.disableHardwareAcceleration();

function minimalDocx() {
  const archive = new AdmZip();
  archive.addFile("[Content_Types].xml", Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
      <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
    </Types>`
  ));
  archive.addFile("_rels/.rels", Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`
  ));
  archive.addFile("word/_rels/document.xml.rels", Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
    </Relationships>`
  ));
  archive.addFile("word/styles.xml", Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
        <w:name w:val="Normal"/>
        <w:qFormat/>
        <w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
      </w:style>
    </w:styles>`
  ));
  archive.addFile("word/document.xml", Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>DocFlow Local PDF smoke test</w:t></w:r>
        </w:p>
        <w:p><w:r><w:t>This page was rendered from a local DOCX file.</w:t></w:r></w:p>
        <w:sectPr>
          <w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>
          <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
        </w:sectPr>
      </w:body>
    </w:document>`
  ));
  return archive.toBuffer();
}

async function inspectPdf(buffer, label) {
  assert(Buffer.isBuffer(buffer), `${label} is not a Buffer`);
  assert(buffer.length >= 1_000, `${label} is unexpectedly small (${buffer.length} bytes)`);
  assert.strictEqual(buffer.subarray(0, 5).toString("ascii"), "%PDF-", `${label} has no PDF header`);
  assert(buffer.subarray(Math.max(0, buffer.length - 2_048)).includes(Buffer.from("%%EOF")), `${label} has no PDF EOF marker`);
  const document = await PDFDocument.load(buffer, { ignoreEncryption: false, updateMetadata: false });
  assert(document.getPageCount() > 0, `${label} has no pages`);
  return document.getPageCount();
}

function withTimeout(promise, delay) {
  let timer;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`PDF smoke test timed out after ${Math.round(delay / 1000)} seconds`)), delay);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

async function run() {
  const root = path.join(__dirname, "..");
  console.log("DocFlow PDF smoke test parsing sample data");
  const parsed = await parseTabular("sample-data.csv", fs.readFileSync(path.join(root, "sample-data.csv")));
  console.log("DocFlow PDF smoke test rendering built-in templates");
  const bundle = await generateBundle({
    rows: parsed.rows,
    requiredFields: ["客户简称", "客户名称", "报价编号", "联系人", "邮箱", "产品名称", "数量", "单价"],
    computedFields: [
      { name: "小计", expression: "数量 * 单价" },
      { name: "税额", expression: "(数量 * 单价 - 优惠) * 税率" },
      { name: "含税总额", expression: "round((数量 * 单价 - 优惠) * (1 + 税率), 2)" }
    ],
    templates: ["quote", "attachment"],
    settings: {
      filenamePattern: "{{客户简称}}-报价单-{{报价编号}}",
      folderPattern: "{{客户简称}}/{{报价编号}}"
    }
  }, { renderHtmlToPdf, renderDocxToPdf });

  console.log("DocFlow PDF smoke test validating ZIP PDFs");
  assert(Buffer.isBuffer(bundle.buffer), "Bundle output is not a Buffer");
  assert(bundle.buffer.length > 10_000, `Bundle is unexpectedly small (${bundle.buffer.length} bytes)`);
  const archive = new AdmZip(bundle.buffer);
  assert(archive.test(), "Generated ZIP failed CRC validation");
  const pdfEntries = archive.getEntries().filter(entry => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".pdf"));
  assert(pdfEntries.length > 0, "Generated ZIP contains no PDFs");

  let totalPages = 0;
  for (const entry of pdfEntries) {
    totalPages += await inspectPdf(entry.getData(), `ZIP entry ${entry.entryName}`);
  }

  console.log("DocFlow PDF smoke test rendering DOCX");
  const docxPdf = await renderDocxToPdf(minimalDocx());
  const docxPages = await inspectPdf(docxPdf, "DOCX renderer output");
  const docxDocument = await PDFDocument.load(docxPdf, { ignoreEncryption: false, updateMetadata: false });
  const docxPageSize = docxDocument.getPage(0).getSize();
  assert(docxPageSize.width > docxPageSize.height, "Landscape Word section was printed as portrait");
  assert(Math.abs(docxPageSize.width - 792) < 5, `Expected Letter width near 792pt, got ${docxPageSize.width}`);
  assert(Math.abs(docxPageSize.height - 612) < 5, `Expected Letter height near 612pt, got ${docxPageSize.height}`);

  const output = process.env.DOCFLOW_SMOKE_OUTPUT || path.join(root, "desktop-smoke.zip");
  await fs.promises.mkdir(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await fs.promises.writeFile(temporary, bundle.buffer);
  await fs.promises.rename(temporary, output);
  const stat = await fs.promises.stat(output);
  assert(stat.isFile() && stat.size === bundle.buffer.length, "Smoke-test ZIP was not written completely");
  const diskArchive = new AdmZip(await fs.promises.readFile(output));
  assert(diskArchive.test(), "ZIP written to disk failed CRC validation");

  console.log(JSON.stringify({
    output,
    bytes: stat.size,
    generated: bundle.generated.length,
    skipped: bundle.validation.invalid,
    pdfs: pdfEntries.length,
    pages: totalPages,
    docxPages,
    docxPageSize
  }));
}

console.log("DocFlow PDF smoke test waiting for Electron", { ready: app.isReady() });
app.whenReady()
  .then(() => {
    console.log("DocFlow PDF smoke test Electron ready");
    return withTimeout(run(), TEST_TIMEOUT_MS);
  })
  .then(() => {
    console.log("DocFlow PDF smoke test completed");
    smokeFinished = true;
    app.exit(0);
  })
  .catch(error => {
    console.error("DocFlow PDF smoke test failed:", error);
    smokeFinished = true;
    app.exit(1);
  });
