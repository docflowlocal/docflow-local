"use strict";

// SPDX-License-Identifier: MPL-2.0

const path = require("path");
const ExcelJS = require("exceljs");

const rows = [
  {
    quoteNumber: "QT-XLSX-001",
    quoteDate: "2026-07-21",
    customerName: "Alpine Demo Retail",
    customerEmail: "purchasing@example.invalid",
    items: false,
    showFlatItem: true,
    itemDescription: "Demo safety helmet",
    itemQuantity: 20,
    itemUnitPrice: 14.5,
    itemLineTotal: 290,
    description: "Demo safety helmet",
    quantity: 20,
    unitPrice: 14.5,
    lineTotal: 290,
    subtotal: 290,
    showDiscount: true,
    discount: 15,
    taxRate: 0.08,
    total: 297,
    notes: "Sanitized XLSX demonstration"
  },
  {
    quoteNumber: "QT-XLSX-002",
    quoteDate: "2026-07-22",
    customerName: "Blue Yonder Demo Works",
    customerEmail: "orders@example.invalid",
    items: false,
    showFlatItem: true,
    itemDescription: "Demo inspection torch",
    itemQuantity: 8,
    itemUnitPrice: 22,
    itemLineTotal: 176,
    description: "Demo inspection torch",
    quantity: 8,
    unitPrice: 22,
    lineTotal: 176,
    subtotal: 176,
    showDiscount: false,
    discount: 0,
    taxRate: 0.08,
    total: 190.08,
    notes: "Sanitized XLSX demonstration"
  }
];

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DocFlow Local Contributors";
  workbook.created = new Date("2026-01-01T00:00:00.000Z");
  workbook.modified = new Date("2026-01-01T00:00:00.000Z");
  const sheet = workbook.addWorksheet("Quotations");
  const headers = Object.keys(rows[0]);
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(headers.map(header => row[header]));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D9488" } };
  sheet.columns.forEach(column => {
    column.width = Math.min(36, Math.max(12, ...column.values.map(value => String(value ?? "").length + 2)));
  });
  sheet.getColumn("B").numFmt = "yyyy-mm-dd";
  for (const key of ["itemUnitPrice", "itemLineTotal", "subtotal", "discount", "total"]) {
    sheet.getColumn(headers.indexOf(key) + 1).numFmt = "$#,##0.00";
  }
  const target = path.join(__dirname, "data.xlsx");
  await workbook.xlsx.writeFile(target);
  console.log(`wrote ${target}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
