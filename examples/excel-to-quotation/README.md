# Excel to quotation

Generate one simple quotation per row of a real XLSX workbook. This flat-data
variant uses the quotation starter's `showFlatItem` branch. For multiple line
items per quote, use the nested JSON shown in `templates/quotation/sample.json`.

## Run

From the repository root:

```bash
node examples/excel-to-quotation/build-data.js
docflow inspect --template "$DOCFLOW_TEMPLATES_DIR/quotation/starter.docx"
docflow validate --data examples/excel-to-quotation/data.xlsx --template "$DOCFLOW_TEMPLATES_DIR/quotation/starter.docx"
docflow generate --data examples/excel-to-quotation/data.xlsx --template "$DOCFLOW_TEMPLATES_DIR/quotation/starter.docx" --output ./generated/excel-to-quotation
```

`data.xlsx` is committed for immediate use. Re-running `build-data.js` recreates
the sanitized workbook and demonstrates how a test fixture can be generated.

## Acceptance

- Validation exits successfully before generation.
- `generated/excel-to-quotation` contains two non-empty DOCX files.
- Each file shows a different quote number and customer.
- Each file contains one item row, formatted USD amounts, and no `{{...}}` tags.
- The source workbook remains unchanged.
