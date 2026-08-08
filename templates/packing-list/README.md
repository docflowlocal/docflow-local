# Starter packing list

A shipment packing list with a repeated item table, formatted weights, totals,
and optional handling instructions.

## Try it

```bash
docflow inspect --template templates/packing-list/starter.docx
docflow validate --data templates/packing-list/sample.json --template templates/packing-list/starter.docx
docflow generate --data templates/packing-list/sample.json --template templates/packing-list/starter.docx --output ./generated/packing-lists
```

Expected result: one DOCX with two item rows, carton and weight totals, and a
visible handling paragraph. `sample.csv` is a flat import example; `sample.json`
contains the real nested line-item array.

Confirm units, customs requirements, shipment identifiers, and actual weights
against the responsible carrier or trade-compliance process.
