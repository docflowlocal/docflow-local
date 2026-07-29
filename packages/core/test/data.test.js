"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { parseTabular } = require("../src/data");

test("JSON data source accepts arrays and preserves nested loop arrays", async () => {
  const input = Buffer.from(JSON.stringify([
    { customer: "Acme", items: [{ name: "A", qty: 2 }] },
    { customer: "Beta", items: [] }
  ]));
  const parsed = await parseTabular("customers.json", input);
  assert.deepEqual(parsed.headers, ["customer", "items"]);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].items[0].name, "A");
  assert.equal(parsed.rows[0].items[0].qty, 2);
  assert.deepEqual(parsed.sourceRows, [1, 2]);
});

test("JSON data source rejects malformed UTF-8 instead of replacing bytes", async () => {
  const input = Buffer.concat([
    Buffer.from('[{"customer":"'),
    Buffer.from([0xff]),
    Buffer.from('"}]')
  ]);
  await assert.rejects(
    () => parseTabular("customers.json", input),
    /not valid UTF-8 JSON/
  );
});

test("CSV data source handles quoting, embedded newlines and source rows", async () => {
  const parsed = await parseTabular(
    "customers.csv",
    Buffer.from('\ufeffname,notes,amount\r\n"Acme, Inc.","first line\nsecond line",12.50\r\nBeta,,8\r\n')
  );
  assert.deepEqual(parsed.headers, ["name", "notes", "amount"]);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].name, "Acme, Inc.");
  assert.equal(parsed.rows[0].notes, "first line\nsecond line");
  assert.equal(parsed.rows[1].amount, "8");
  assert.deepEqual(parsed.sourceRows, [2, 4]);
});
