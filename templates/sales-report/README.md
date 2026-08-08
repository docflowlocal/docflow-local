# Starter sales report

A periodic sales summary with repeated metrics, date/currency/number/percent
formatting, and optional commentary.

## Try it

```bash
docflow inspect --template templates/sales-report/starter.docx
docflow validate --data templates/sales-report/sample.json --template templates/sales-report/starter.docx
docflow generate --data templates/sales-report/sample.json --template templates/sales-report/starter.docx --output ./generated/sales-reports
```

Expected result: one DOCX with two metric rows, formatted total sales and growth,
and the commentary paragraph. `sample.csv` is sanitized flat data while
`sample.json` preserves the nested `metrics` array.

Define and reconcile business metrics before distribution; this starter does not
validate the accounting meaning of a value.
