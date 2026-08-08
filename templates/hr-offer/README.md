# Starter employment offer

A simple offer-letter starter with formatted dates and compensation, an optional
bonus paragraph, and a fallback sender name.

## Try it

```bash
docflow inspect --template templates/hr-offer/starter.docx
docflow validate --data templates/hr-offer/sample.csv --template templates/hr-offer/starter.docx
docflow generate --data templates/hr-offer/sample.csv --template templates/hr-offer/starter.docx --output ./generated/offers
```

Expected result: two DOCX letters. One includes the bonus paragraph and one omits
it; both contain formatted dates and salary amounts with no unresolved tags.

The names, employer, and compensation values are fictional. This starter is not
legal, employment, payroll, or tax advice; obtain jurisdiction-specific review.
