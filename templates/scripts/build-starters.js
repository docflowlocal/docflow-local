"use strict";

// SPDX-License-Identifier: MPL-2.0

const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

const TEMPLATE_ROOT = path.resolve(__dirname, "..");
const FIXED_TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function paragraph(text, options = {}) {
  const paragraphProperties = options.align
    ? `<w:pPr><w:jc w:val="${escapeXml(options.align)}"/></w:pPr>`
    : "";
  const runProperties = [
    options.bold ? "<w:b/>" : "",
    options.size ? `<w:sz w:val="${Number(options.size)}"/>` : "",
    options.color ? `<w:color w:val="${escapeXml(options.color)}"/>` : ""
  ].join("");
  const style = runProperties ? `<w:rPr>${runProperties}</w:rPr>` : "";
  return `<w:p>${paragraphProperties}<w:r>${style}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function cell(text, options = {}) {
  const width = Number(options.width || 2400);
  const shading = options.shading
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${escapeXml(options.shading)}"/>`
    : "";
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shading}</w:tcPr>${paragraph(text, options)}</w:tc>`;
}

function row(values, options = {}) {
  return `<w:tr>${values.map((value, index) => cell(value, {
    bold: options.bold,
    color: options.color,
    shading: options.shading,
    width: options.widths?.[index]
  })).join("")}</w:tr>`;
}

function table(rows) {
  return `<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="C9D6D8"/><w:left w:val="single" w:sz="4" w:color="C9D6D8"/><w:bottom w:val="single" w:sz="4" w:color="C9D6D8"/><w:right w:val="single" w:sz="4" w:color="C9D6D8"/><w:insideH w:val="single" w:sz="4" w:color="DDE5E7"/><w:insideV w:val="single" w:sz="4" w:color="DDE5E7"/></w:tblBorders></w:tblPr>${rows.join("")}</w:tbl>`;
}

function packageParts(title, bodyXml) {
  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708"/>
    </w:sectPr>
  </w:body>
</w:document>`,
    "word/_rels/document.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`,
    "word/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:sz w:val="21"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`,
    "word/settings.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
</w:settings>`,
    "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>DocFlow Local Contributors</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-01-01T00:00:00Z</dcterms:modified>
</cp:coreProperties>`,
    "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>DocFlow</Application>
</Properties>`
  };
}

function quotationBody() {
  return [
    paragraph("QUOTATION", { bold: true, size: 34, color: "0D9488", align: "center" }),
    paragraph("Quote: {{quoteNumber}}"),
    paragraph("Date: {{quoteDate | date:YYYY-MM-DD}}"),
    paragraph("Prepared for: {{customerName | trim}}"),
    paragraph("Email: {{customerEmail | lower}}"),
    table([
      row(["Description", "Qty", "Unit price", "Line total"], {
        bold: true,
        color: "FFFFFF",
        shading: "0D9488",
        widths: [3900, 1200, 1900, 2300]
      }),
      row([
        "{{#items}}{{description}}",
        "{{quantity | number:0}}",
        "{{unitPrice | currency:USD}}",
        "{{lineTotal | currency:USD}}{{/items}}"
      ], { widths: [3900, 1200, 1900, 2300] }),
      row([
        "{{#showFlatItem}}{{itemDescription}}",
        "{{itemQuantity | number:0}}",
        "{{itemUnitPrice | currency:USD}}",
        "{{itemLineTotal | currency:USD}}{{/showFlatItem}}"
      ], { widths: [3900, 1200, 1900, 2300] })
    ]),
    paragraph("Subtotal: {{subtotal | currency:USD}}", { bold: true }),
    paragraph("{{#showDiscount}}"),
    paragraph("Discount: {{discount | currency:USD}}"),
    paragraph("{{/showDiscount}}"),
    paragraph("Tax rate: {{taxRate | percent:1}}"),
    paragraph("Total: {{total | currency:USD}}", { bold: true, color: "0D9488" }),
    paragraph("Notes: {{notes | default:No additional notes.}}"),
    paragraph("{{@qrcode:quoteNumber}}", { align: "right" })
  ].join("");
}

function invoiceBody() {
  return [
    paragraph("INVOICE", { bold: true, size: 34, color: "2563EB", align: "center" }),
    paragraph("Invoice: {{invoiceNumber}}"),
    paragraph("Issued: {{invoiceDate | date:YYYY-MM-DD}}"),
    paragraph("Due: {{dueDate | date:YYYY-MM-DD}}"),
    paragraph("Bill to: {{billTo | trim}}"),
    table([
      row(["Item", "Qty", "Rate", "Amount"], {
        bold: true,
        color: "FFFFFF",
        shading: "2563EB",
        widths: [3900, 1200, 1900, 2300]
      }),
      row([
        "{{#items}}{{description}}",
        "{{quantity | number:0}}",
        "{{unitPrice | currency:USD}}",
        "{{lineTotal | currency:USD}}{{/items}}"
      ], { widths: [3900, 1200, 1900, 2300] })
    ]),
    paragraph("Subtotal: {{subtotal | currency:USD}}"),
    paragraph("{{#showTax}}"),
    paragraph("Tax: {{tax | currency:USD}}"),
    paragraph("{{/showTax}}"),
    paragraph("Amount due: {{total | currency:USD}}", { bold: true, color: "2563EB" }),
    paragraph("Payment reference: {{paymentReference | default:Use the invoice number.}}")
  ].join("");
}

function certificateBody() {
  return [
    paragraph("CERTIFICATE OF COMPLETION", { bold: true, size: 34, color: "7C3AED", align: "center" }),
    paragraph("This certifies that", { align: "center" }),
    paragraph("{{recipientName | trim}}", { bold: true, size: 30, color: "7C3AED", align: "center" }),
    paragraph("completed {{courseName}}", { align: "center" }),
    paragraph("Issued {{issuedAt | date:YYYY-MM-DD}}", { align: "center" }),
    paragraph("Achievements", { bold: true }),
    paragraph("{{#achievements}}"),
    paragraph("• {{achievement}}"),
    paragraph("{{/achievements}}"),
    paragraph("{{#showScore}}"),
    paragraph("Final score: {{score | number:1}} / 100", { align: "center" }),
    paragraph("{{/showScore}}"),
    paragraph("Certificate ID: {{certificateId}}", { align: "center" }),
    paragraph("{{@qrcode:verificationUrl}}", { align: "center" })
  ].join("");
}

function hrOfferBody() {
  return [
    paragraph("EMPLOYMENT OFFER", { bold: true, size: 32, color: "D97706", align: "center" }),
    paragraph("Date: {{offerDate | date:YYYY-MM-DD}}"),
    paragraph("Dear {{candidateName | trim}},"),
    paragraph("We are pleased to offer you the position of {{jobTitle}} at {{companyName}}."),
    paragraph("Your anticipated start date is {{startDate | date:YYYY-MM-DD}}."),
    paragraph("Annual base salary: {{annualSalary | currency:USD}}"),
    paragraph("{{#showBonus}}"),
    paragraph("Target annual bonus: {{bonusAmount | currency:USD}}"),
    paragraph("{{/showBonus}}"),
    paragraph("Your manager will be {{managerName}}."),
    paragraph("This sanitized starter is not legal advice. Review the final letter with qualified local counsel."),
    paragraph("Sincerely,"),
    paragraph("{{senderName | default:People Operations}}")
  ].join("");
}

function packingListBody() {
  return [
    paragraph("PACKING LIST", { bold: true, size: 34, color: "0891B2", align: "center" }),
    paragraph("Shipment: {{shipmentNumber}}"),
    paragraph("Ship date: {{shipDate | date:YYYY-MM-DD}}"),
    paragraph("Consignee: {{consignee | trim}}"),
    table([
      row(["SKU", "Description", "Cartons", "Net kg", "Gross kg"], {
        bold: true,
        color: "FFFFFF",
        shading: "0891B2",
        widths: [1500, 3300, 1300, 1600, 1600]
      }),
      row([
        "{{#items}}{{sku}}",
        "{{description}}",
        "{{cartons | number:0}}",
        "{{netWeight | number:2}}",
        "{{grossWeight | number:2}}{{/items}}"
      ], { widths: [1500, 3300, 1300, 1600, 1600] })
    ]),
    paragraph("Total cartons: {{totalCartons | number:0}}"),
    paragraph("Total gross weight: {{totalGrossWeight | number:2}} kg"),
    paragraph("{{#showHandling}}"),
    paragraph("Handling: {{handlingNotes}}"),
    paragraph("{{/showHandling}}")
  ].join("");
}

function salesReportBody() {
  return [
    paragraph("SALES REPORT", { bold: true, size: 34, color: "DB2777", align: "center" }),
    paragraph("{{reportName | upper}}"),
    paragraph("Period: {{periodStart | date:YYYY-MM-DD}} to {{periodEnd | date:YYYY-MM-DD}}"),
    paragraph("Prepared by: {{preparedBy | trim}}"),
    table([
      row(["Metric", "Current", "Previous", "Change"], {
        bold: true,
        color: "FFFFFF",
        shading: "DB2777",
        widths: [3300, 2100, 2100, 1800]
      }),
      row([
        "{{#metrics}}{{metric}}",
        "{{currentValue | number:2}}",
        "{{previousValue | number:2}}",
        "{{changeRate | percent:1}}{{/metrics}}"
      ], { widths: [3300, 2100, 2100, 1800] })
    ]),
    paragraph("Total sales: {{totalSales | currency:USD}}", { bold: true }),
    paragraph("Overall growth: {{growthRate | percent:1}}"),
    paragraph("{{#showCommentary}}"),
    paragraph("Commentary: {{commentary}}"),
    paragraph("{{/showCommentary}}")
  ].join("");
}

const definitions = Object.freeze({
  quotation: { title: "DocFlow starter quotation", body: quotationBody },
  invoice: { title: "DocFlow starter invoice", body: invoiceBody },
  certificate: { title: "DocFlow starter certificate", body: certificateBody },
  "hr-offer": { title: "DocFlow starter employment offer", body: hrOfferBody },
  "packing-list": { title: "DocFlow starter packing list", body: packingListBody },
  "sales-report": { title: "DocFlow starter sales report", body: salesReportBody }
});

function buildStarter(id, definition) {
  const zip = new PizZip();
  for (const [filename, contents] of Object.entries(packageParts(definition.title, definition.body()))) {
    zip.file(filename, contents, { date: FIXED_TIMESTAMP });
  }
  const output = zip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "DOS"
  });
  const target = path.join(TEMPLATE_ROOT, id, "starter.docx");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output);
  return { id, target, bytes: output.length };
}

function buildAll() {
  return Object.entries(definitions).map(([id, definition]) => buildStarter(id, definition));
}

if (require.main === module) {
  const results = buildAll();
  for (const result of results) {
    console.log(`built ${result.id}: ${path.relative(process.cwd(), result.target)} (${result.bytes} bytes)`);
  }
}

module.exports = { buildAll, buildStarter, definitions };
