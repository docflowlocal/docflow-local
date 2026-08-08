# Starter quotation

A sanitized one-page quotation showing a line-item loop, an optional discount
section, date/currency/number/percent formatters, fallback text, and a QR code.

## Try it

Run from the repository root after installing the DocFlow CLI:

```bash
docflow inspect --template templates/quotation/starter.docx
docflow validate --data templates/quotation/sample.json --template templates/quotation/starter.docx
docflow generate --data templates/quotation/sample.json --template templates/quotation/starter.docx --output ./generated/quotation
```

`sample.csv` is the flat import example. `sample.json` represents `items` as a
real array and therefore demonstrates the loop when used from the CLI.

Expected result: one DOCX named from the record, two populated line-item rows,
the discount paragraph, formatted USD values, and no unresolved `{{...}}` tags.
Review pricing, tax, currency, and legal language before real use.
