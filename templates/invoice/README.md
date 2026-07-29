# Starter invoice

A minimal invoice with line items, an optional tax section, payment reference,
and deterministic number/date formatting.

## Try it

```bash
docflow inspect --template templates/invoice/starter.docx
docflow validate --data templates/invoice/sample.json --template templates/invoice/starter.docx
docflow generate --data templates/invoice/sample.json --template templates/invoice/starter.docx --output ./generated/invoice
```

Expected result: one populated DOCX with two item rows, visible tax, a formatted
amount due, and no unresolved template tags. `sample.csv` is sanitized flat data;
`sample.json` preserves the nested `items` array used by the loop.

This starter is not accounting or tax advice. Adapt invoice numbering, tax rules,
currency, remittance details, and retention requirements for your jurisdiction.
