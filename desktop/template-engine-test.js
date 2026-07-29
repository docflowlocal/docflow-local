"use strict";

const assert = require("assert");
const path = require("path");
const AdmZip = require("adm-zip");
const {
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  StandardFonts
} = require("pdf-lib");
const {
  extractDocxTemplateInfo,
  fillPdfTemplate,
  inspectPdfTemplate,
  mergePdfBuffers,
  renderDocxTemplate
} = require("./template-engine");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function minimalDocxTemplate() {
  const archive = new AdmZip();
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`;
  const rootRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const documentRelationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="120"/></w:pPr>
    <w:rPr><w:sz w:val="22"/></w:rPr>
  </w:style>
</w:styles>`;
  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="110"/>
  <w:defaultTabStop w:val="420"/>
</w:settings>`;
  const theme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="DocFlow test theme">
  <a:themeElements>
    <a:clrScheme name="DocFlow"><a:dk1><a:srgbClr val="172033"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="24445C"/></a:dk2><a:lt2><a:srgbClr val="F4F7F8"/></a:lt2><a:accent1><a:srgbClr val="0D9488"/></a:accent1><a:accent2><a:srgbClr val="D97706"/></a:accent2><a:accent3><a:srgbClr val="2563EB"/></a:accent3><a:accent4><a:srgbClr val="7C3AED"/></a:accent4><a:accent5><a:srgbClr val="DB2777"/></a:accent5><a:accent6><a:srgbClr val="65A30D"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>
    <a:fontScheme name="DocFlow"><a:majorFont><a:latin typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="DocFlow"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme>
  </a:themeElements>
</a:theme>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:pPr><w:jc w:val="center"/></w:pPr>
      <w:r><w:rPr><w:b/><w:color w:val="0D9488"/></w:rPr><w:t>{{客</w:t></w:r>
      <w:r><w:rPr><w:b/><w:color w:val="0D9488"/></w:rPr><w:t>户名称}}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>{{#显示优惠}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>优惠金额：</w:t></w:r><w:r><w:t>{{优惠}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>{{/显示优惠}}</w:t></w:r></w:p>
    <w:tbl>
      <w:tblPr><w:tblW w:w="4800" w:type="dxa"/></w:tblPr>
      <w:tr><w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>固定版式内容</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:t>{{报价日期 | date:YYYY/MM/DD}}</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{{#项目}}{{名称}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{金额 | currency:CNY}}{{/项目}}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>{{@qrcode:编号}}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>{{@signature}}</w:t></w:r></w:p>
    <w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>{{@image:照片}}</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;

  archive.addFile("[Content_Types].xml", Buffer.from(contentTypes));
  archive.addFile("_rels/.rels", Buffer.from(rootRelationships));
  archive.addFile("word/document.xml", Buffer.from(document));
  archive.addFile("word/_rels/document.xml.rels", Buffer.from(documentRelationships));
  archive.addFile("word/styles.xml", Buffer.from(styles));
  archive.addFile("word/settings.xml", Buffer.from(settings));
  archive.addFile("word/theme/theme1.xml", Buffer.from(theme));
  return {
    buffer: archive.toBuffer(),
    preservedParts: {
      "word/styles.xml": styles,
      "word/settings.xml": settings,
      "word/theme/theme1.xml": theme
    }
  };
}

function xmlVisibleText(xml) {
  return String(xml)
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function matches(text, pattern) {
  return [...String(text).matchAll(pattern)];
}

async function testDocxTemplateEngine() {
  const fixture = minimalDocxTemplate();
  const info = extractDocxTemplateInfo(fixture.buffer);
  assert.deepStrictEqual(info.conditions, ["显示优惠", "项目"]);
  assert.deepStrictEqual(info.assets, [
    { tag: "@image:照片", kind: "image", source: "照片" },
    { tag: "@qrcode:编号", kind: "qrcode", source: "编号" },
    { tag: "@signature", kind: "signature", source: "signature" }
  ]);
  assert.deepStrictEqual(
    new Set(info.fields),
    new Set(["客户名称", "显示优惠", "优惠", "报价日期", "项目", "名称", "金额", "编号", "照片"])
  );

  const context = {
    客户名称: "测试客户有限公司",
    显示优惠: true,
    优惠: "¥100.00",
    报价日期: "2026-07-29",
    项目: [
      { 名称: "实施服务", 金额: 1200 },
      { 名称: "支持服务", 金额: 300 }
    ],
    编号: "QT-2026-001",
    照片: "photo.png"
  };
  const rendered = await renderDocxTemplate(fixture.buffer, context, {
    signature: PNG,
    assets: { "photo.png": PNG }
  });
  assert.deepStrictEqual(rendered.warnings, []);

  const archive = new AdmZip(rendered.buffer);
  for (const [entryName, original] of Object.entries(fixture.preservedParts)) {
    assert.strictEqual(
      archive.readAsText(entryName),
      original,
      `${entryName} should be preserved byte-for-byte`
    );
  }

  const documentXml = archive.readAsText("word/document.xml");
  const text = xmlVisibleText(documentXml);
  assert(text.includes("测试客户有限公司"), "Cross-run text field should be rendered");
  assert(text.includes("优惠金额：¥100.00"), "Truthy conditional section should be rendered");
  assert(text.includes("2026/07/29"), "Date formatter should render a deterministic calendar date");
  assert(text.includes("实施服务") && text.includes("支持服务"), "Array sections should repeat table content");
  assert(text.includes("CN¥1,200.00") && text.includes("CN¥300.00"), "Currency formatter should render loop values");
  assert(text.includes("固定版式内容"), "Static table content should remain");
  assert(documentXml.includes("<w:tbl>"), "Original table layout should remain");
  assert(documentXml.includes('<w:jc w:val="center"/>'), "Paragraph alignment should remain");
  assert(documentXml.includes("<w:b/>"), "Run formatting around a cross-run tag should remain");
  assert(documentXml.includes('<w:pgSz w:w="11906" w:h="16838"/>'), "Page layout should remain");

  const mediaEntries = archive.getEntries().filter(entry => /^word\/media\/[^/]+$/.test(entry.entryName));
  assert.strictEqual(mediaEntries.length, 3, "QR code, signature and image should be embedded");
  for (const entry of mediaEntries) {
    assert(entry.getData().length > 0, `${entry.entryName} should not be empty`);
  }

  const relationshipXml = archive.readAsText("word/_rels/document.xml.rels");
  const imageRelationships = matches(
    relationshipXml,
    /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bType="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/image"[^>]*\bTarget="([^"]+)"[^>]*\/>/g
  );
  assert.strictEqual(
    imageRelationships.length,
    3,
    `Every DOCX image should have a relationship: ${relationshipXml}\nDOCUMENT:\n${documentXml}`
  );
  const embeddedIds = matches(documentXml, /\br:embed="([^"]+)"/g).map(match => match[1]);
  assert.strictEqual(embeddedIds.length, 3, "Every asset placeholder should become a drawing");
  assert.strictEqual(matches(documentXml, /<w:drawing>/g).length, 3);
  for (const [, relationshipId, target] of imageRelationships) {
    assert(embeddedIds.includes(relationshipId), `${relationshipId} should be referenced by a drawing`);
    assert(archive.getEntry(path.posix.join("word", target)), `${target} should exist in word/media`);
  }
  assert(
    archive.readAsText("[Content_Types].xml").includes('Extension="png" ContentType="image/png"'),
    "PNG content type should be registered"
  );

  const allXml = archive
    .getEntries()
    .filter(entry => entry.entryName.endsWith(".xml") || entry.entryName.endsWith(".rels"))
    .map(entry => entry.getData().toString("utf8"))
    .join("\n");
  for (const marker of ["{{", "}}", "__DOCFLOW_ASSET_", "@qrcode", "@signature", "@image"]) {
    assert(!allXml.includes(marker), `Rendered DOCX should not contain marker ${marker}`);
  }

  const hidden = await renderDocxTemplate(
    fixture.buffer,
    { ...context, 显示优惠: false },
    { signature: PNG, assets: { "photo.png": PNG } }
  );
  const hiddenText = xmlVisibleText(new AdmZip(hidden.buffer).readAsText("word/document.xml"));
  assert(!hiddenText.includes("优惠金额"), "Falsy conditional section should be removed");
  assert(hiddenText.includes("固定版式内容"), "Content after a conditional section should remain");
}

async function pdfFormTemplate() {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const form = document.getForm();

  const customer = form.createTextField("客户名称");
  customer.enableRequired();
  customer.addToPage(page, { x: 60, y: 740, width: 250, height: 28, font });

  const accepted = form.createCheckBox("已确认");
  accepted.addToPage(page, { x: 60, y: 690, width: 20, height: 20 });

  const region = form.createDropdown("地区");
  region.addOptions(["华东", "华南"]);
  region.addToPage(page, { x: 60, y: 640, width: 160, height: 28, font });

  const qrcode = form.createButton("@qrcode:编号");
  qrcode.addToPage("", page, { x: 60, y: 470, width: 120, height: 120, font });

  const signature = form.createButton("signature");
  signature.addToPage("", page, { x: 220, y: 500, width: 180, height: 70, font });

  const image = form.createButton("@image:照片");
  image.addToPage("", page, { x: 420, y: 490, width: 100, height: 100, font });

  return Buffer.from(await document.save({ useObjectStreams: false }));
}

function indirectObject(document, object) {
  return object ? document.context.lookup(object) : undefined;
}

function normalAppearance(document, field) {
  const widget = field.acroField.getWidgets()[0];
  return indirectObject(document, widget.getNormalAppearance());
}

function appearanceFontNames(document, field) {
  const appearance = normalAppearance(document, field);
  const resources = indirectObject(document, appearance?.dict?.get(PDFName.of("Resources")));
  assert(resources instanceof PDFDict, `${field.getName()} should have appearance resources`);
  const fonts = indirectObject(document, resources.get(PDFName.of("Font")));
  assert(fonts instanceof PDFDict, `${field.getName()} should have appearance fonts`);
  return fonts.keys().map(key => {
    const font = indirectObject(document, fonts.get(key));
    return String(font?.get?.(PDFName.of("BaseFont")) || "");
  });
}

function imageObjectCount(document) {
  let count = 0;
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (
      object instanceof PDFRawStream
      && String(object.dict.get(PDFName.of("Subtype"))) === "/Image"
    ) {
      count += 1;
    }
  }
  return count;
}

async function testPdfTemplateEngine() {
  const template = await pdfFormTemplate();
  const inspected = await inspectPdfTemplate(template);
  assert.strictEqual(inspected.pageCount, 1);
  assert.strictEqual(inspected.fillable, true);
  assert.deepStrictEqual(
    inspected.fields.map(field => [field.name, field.type, field.required]),
    [
      ["客户名称", "text", true],
      ["已确认", "checkbox", false],
      ["地区", "dropdown", false],
      ["@qrcode:编号", "button", false],
      ["signature", "button", false],
      ["@image:照片", "button", false]
    ]
  );

  const context = {
    客户名称: "北京测试有限公司",
    已确认: true,
    地区: "华南",
    编号: "QT-2026-001",
    照片: "photo.png"
  };
  const editable = await fillPdfTemplate(template, context, {
    signature: PNG,
    assets: { "photo.png": PNG },
    flattenPdf: false
  });
  assert.deepStrictEqual(editable.warnings, []);

  const editableDocument = await PDFDocument.load(editable.buffer);
  assert.strictEqual(editableDocument.getPageCount(), 1);
  const editableForm = editableDocument.getForm();
  assert.strictEqual(editableForm.getTextField("客户名称").getText(), "北京测试有限公司");
  assert.strictEqual(editableForm.getCheckBox("已确认").isChecked(), true);
  assert.deepStrictEqual(editableForm.getDropdown("地区").getSelected(), ["华南"]);

  const customerFonts = appearanceFontNames(editableDocument, editableForm.getTextField("客户名称"));
  assert(
    customerFonts.some(name => name && !/Helvetica/i.test(name)),
    `Chinese text should use an embedded custom font, got ${customerFonts.join(", ")}`
  );

  for (const name of ["@qrcode:编号", "signature", "@image:照片"]) {
    const appearance = normalAppearance(editableDocument, editableForm.getButton(name));
    assert(appearance, `${name} should have a normal appearance`);
    assert(
      typeof appearance.getContentsSize !== "function" || appearance.getContentsSize() > 0,
      `${name} appearance stream should not be empty`
    );
  }
  assert(
    imageObjectCount(editableDocument) >= 3,
    "QR code, signature and image button appearances should embed image objects"
  );

  const flattened = await fillPdfTemplate(template, context, {
    signature: PNG,
    assets: { "photo.png": PNG }
  });
  assert.deepStrictEqual(flattened.warnings, []);
  const flattenedDocument = await PDFDocument.load(flattened.buffer);
  assert.strictEqual(flattenedDocument.getPageCount(), 1);
  assert.strictEqual(
    flattenedDocument.getForm().getFields().length,
    0,
    "Flattened delivery PDF should contain no form fields"
  );
  assert(imageObjectCount(flattenedDocument) >= 3, "Flattening should retain all asset appearances");
}

async function simplePdf(pageSizes) {
  const document = await PDFDocument.create();
  for (const [index, size] of pageSizes.entries()) {
    const page = document.addPage(size);
    page.drawText(`Page ${index + 1}`, { x: 20, y: size[1] - 30, size: 12 });
  }
  return Buffer.from(await document.save());
}

async function testPdfMerge() {
  const first = await simplePdf([[300, 400]]);
  const second = await simplePdf([[400, 500], [500, 600]]);
  const merged = await mergePdfBuffers([first, second]);
  const document = await PDFDocument.load(merged);
  assert.strictEqual(document.getPageCount(), 3);
  assert.deepStrictEqual(
    document.getPages().map(page => [page.getWidth(), page.getHeight()]),
    [[300, 400], [400, 500], [500, 600]]
  );
}

async function main() {
  await testDocxTemplateEngine();
  await testPdfTemplateEngine();
  await testPdfMerge();
  console.log("DocFlow template engine tests passed:", {
    docxCrossRunAndConditions: true,
    docxAssetsAndRelationships: true,
    docxLayoutPartsPreserved: true,
    pdfAcroFormMapping: true,
    pdfChineseFontAndAssets: true,
    pdfFlattening: true,
    pdfMerge: true
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
