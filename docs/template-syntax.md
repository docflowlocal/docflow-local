# DOCX template syntax

DocFlow templates are ordinary `.docx` files with `{{...}}` markers. The Core
reads markers in the document body, headers, footers, footnotes, and endnotes,
then preserves the surrounding Word package while replacing data.

## Fields

```text
Customer: {{customerName}}
Reference: {{order.id}}
```

Field names are case-sensitive. Dot paths read nested objects. A missing value
renders as blank unless a `default` formatter is present.

## Loops and conditions

Loops and conditions share section syntax. The value determines the behavior:

```text
{{#items}}
{{description}} — {{quantity | number:0}} × {{unitPrice | currency:USD}}
{{/items}}

{{#showDiscount}}
Discount: {{discount | currency:USD}}
{{/showDiscount}}
```

An array repeats the enclosed content with each item as the current scope. A
boolean or scalar includes or removes the enclosed content according to its
truthiness. Put paragraph loops on their own opening and closing paragraphs.
For a repeated Word table row, place `{{#items}}` in the first cell and
`{{/items}}` in the last cell of the row to repeat.

Use a computed or conditional field in job configuration when business logic is
more complex than showing a value. Templates do not execute arbitrary JavaScript.

## Formatters

Append formatters with `|`; apply multiple formatters from left to right:

```text
{{customerName | trim | upper}}
{{invoiceDate | date:YYYY-MM-DD}}
{{quantity | number:0}}
{{unitPrice | currency:USD}}
{{amount | money:CNY}}
{{rate | percent:1}}
{{notes | default:No additional notes.}}
```

| Formatter | Behavior |
| --- | --- |
| `trim` | Remove leading and trailing whitespace |
| `upper` / `lower` | Change text case |
| `default:value` | Use `value` for null, blank, or whitespace-only input |
| `date:pattern` | Format a date with `YYYY`, `MM`, and `DD` tokens |
| `number:digits` | Decimal number with 0–12 fraction digits |
| `currency:CODE` / `money:CODE` | ISO 4217 currency, default `CNY` |
| `percent:digits` | Decimal ratio as a percentage; `0.125` becomes `12.5%` |

An unknown formatter or non-numeric value passed to a numeric formatter is a
generation error rather than silently producing misleading text.

## Images, QR codes, and signatures

```text
{{@image:productPhoto}}
{{@qrcode:verificationUrl}}
{{@signature}}
```

- `@image` resolves a PNG or JPEG from the row value or an asset supplied by the
  embedding host.
- `@qrcode` creates a PNG from the referenced field entirely locally.
- `@signature` inserts an image supplied as the job signature asset.

Keep every asset marker in its own Word text run or paragraph. Image files are
validated for format, byte size, dimensions, and pixel count. An inserted
signature image is not a certificate-backed cryptographic digital signature.

## Word authoring checklist

1. Start with a clean DOCX, not a macro-enabled file.
2. Type a complete marker in one action when possible; DocFlow can recover many
   markers split across Word runs, but simple runs are easier to diagnose.
3. Keep loop opening and closing markers balanced and case-consistent.
4. Keep asset markers isolated from surrounding text.
5. Inspect the template before generation.
6. Validate with representative empty, long, Unicode, numeric, and date values.
7. Open generated DOCX files in every office suite you officially support.

DocFlow rejects macros, embedded active objects, unsafe external relationships,
DDE/INCLUDE/LINK-style active Word fields, unsafe archive paths, and suspicious
compression. Complex floating layout, uncommon fonts, and mixed application
renderers can still produce visual differences and need human QA.

See the generated
[quotation](https://github.com/docflowlocal/templates/tree/main/quotation) and
[certificate](https://github.com/docflowlocal/templates/tree/main/certificate)
starters for loops, conditions, formatters, and QR markers that are validated
against Core.
