# DocFlow starter templates

This directory is the seed of the future `docflowlocal/templates` repository.
Every starter is intentionally small, sanitized, and editable in Microsoft Word,
LibreOffice, or another DOCX-compatible editor.

| Starter | Typical use |
| --- | --- |
| [`quotation`](quotation/) | Customer quotations with line items and optional discounts |
| [`invoice`](invoice/) | Invoices with due dates, tax, and line items |
| [`certificate`](certificate/) | Verifiable course or training certificates |
| [`hr-offer`](hr-offer/) | Employment offer letters |
| [`packing-list`](packing-list/) | Shipment and packing lists |
| [`sales-report`](sales-report/) | Periodic sales summaries |

## Build and validate

From the repository root:

```bash
node templates/scripts/build-starters.js
node templates/scripts/validate-content.js
```

`build-starters.js` creates real, minimal DOCX packages with PizZip. The generated
`starter.docx` files are deterministic and may be committed. The validator checks
every manifest and sanitized CSV, parses every DOCX with DocFlow Core, and renders
one representative record so broken tags fail early.

These six starter packs use the `CC-BY-4.0` license declared by their manifests.
That license covers the starter content, not the DocFlow name or logo. See the
repository trademark policy before redistributing branded derivatives.
