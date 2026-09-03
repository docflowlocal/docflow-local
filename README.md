# DocFlow Local

[简体中文](README.zh-CN.md) · [Website](https://docflowlocal.com) · [Guides](https://docflowlocal.com/guides/) · [Download](https://docflowlocal.com/download/) · [Security](https://docflowlocal.com/security/) · [Benchmarks](BENCHMARKS.md)

DocFlow Local is a privacy-first desktop application and modular document engine that turns JSON/Excel/CSV data and Word/PDF templates into validated, consistently named delivery packages.

> Customer documents are processed locally through a temporary loopback service and application memory. The Community Edition does not upload document content.

## MVP capabilities

- Import JSON, CSV, XLSX, and XLSM data, preserve physical source-row numbers and displayed formats such as leading-zero identifiers and percentages, and map columns to template fields.
- Inspect and populate custom DOCX templates while preserving their original document package, styles, tables, headers, footers, and page setup.
- Inspect and fill PDF AcroForm text fields, checkboxes, radio groups, dropdowns, option lists, and image fields.
- Create and edit computed and conditional rules with a bounded expression evaluator—no `eval` or arbitrary JavaScript execution.
- Generate one or more templates for every eligible record, optionally retain populated custom DOCX files, and optionally merge each record's PDFs. The two bundled templates directly produce PDFs.
- Insert QR codes, PNG/JPEG images, and image-based signatures or stamps.
- Apply field-based file names and nested folder patterns, then package all output in a ZIP.
- Validate mapped required fields, rule evaluation, template availability, generated PDF/DOCX structure, ZIP entries, sizes, and SHA-256 checksums.
- Include a validation report and a JSON delivery manifest.
- Switch the application between English and Simplified Chinese.

## Quick start from source

Node.js 22+ is recommended:

```bash
npm ci
npm test
npm run desktop
```

On macOS you can also double-click `启动 DocFlow.command`. On Windows, run `start-docflow.bat`. Both launchers install the locked npm dependencies when Electron is missing, then start the Electron application; they do not start the retired Python/Flask prototype.

Use [`sample-data.csv`](sample-data.csv) for a sanitized first import. The website's [Excel-to-Word/PDF guide](https://docflowlocal.com/guides/batch-generate-pdf-from-excel/) explains the record, mapping, validation, naming, and packaging model.

Build for macOS Apple Silicon:

```bash
npm run build:mac
```

Build for Windows x64 on a Windows machine:

```powershell
npm ci
npm run build:win
```

See [DESKTOP_BUILD.md](DESKTOP_BUILD.md) for the complete test and release checklist.

## Reproducible benchmark

Run the deterministic local-engine benchmark:

```bash
npm run benchmark:engine
```

The test covers validation, naming, PDF integrity checks, ZIP packaging, manifest creation, and checksum verification for 100, 500, and 1,000 records. It deliberately excludes real DOCX/HTML rendering so pipeline changes can be compared without renderer variability. See [BENCHMARKS.md](BENCHMARKS.md) for the method, environment, results, and interpretation limits.

## DOCX template syntax

DocFlow reads placeholders from the document body, headers, footers, footnotes, and endnotes. Normal text placeholders may span multiple Word XML runs.

| Purpose | Syntax | Example |
| --- | --- | --- |
| Text or mapped value | `{{Field}}` | `{{Customer Name}}` |
| Conditional section | `{{#Condition}}...{{/Condition}}` | `{{#Show Discount}}Discount: {{Discount}}{{/Show Discount}}` |
| Array/table loop | `{{#Items}}...{{/Items}}` | `{{#Items}}{{Name}} — {{Amount}}{{/Items}}` |
| Date/number formatting | `{{Field \| formatter}}` | `{{Amount \| currency:CNY}}` |
| QR code | `{{@qrcode:Field}}` | `{{@qrcode:Quote ID}}` |
| Uploaded image | `{{@image:Field}}` | `{{@image:Photo}}` |
| Uploaded signature/stamp | `{{@signature}}` | `{{@signature}}` |

For predictable Word layout, put each opening/closing conditional marker and every image marker in its own paragraph or text run. Image cells may contain the uploaded file name, such as `photo.png`; DocFlow also matches an uploaded image by its base name or by the referenced field name. Image assets must be PNG or JPEG.

Built-in formatters include `date:YYYY-MM-DD`, `number:2`,
`currency:CNY`, `percent:1`, `trim`, `upper`, `lower`, and
`default:fallback`. JSON input can carry nested arrays for table loops.

Example:

```text
Prepared for: {{Customer Name}}
Quote: {{Quote ID}}

{{#Show Discount}}
Discount: {{Discount}}
{{/Show Discount}}

{{@qrcode:Quote ID}}
{{@signature}}
```

## PDF AcroForm conventions

Standard AcroForm field names are mapped like DOCX fields. For embedded assets, create a form field—preferably a push button—with one of these names:

- `@qrcode:Quote ID` generates a QR code from that field.
- `@image:Photo` resolves a PNG/JPEG using the row value or uploaded asset name.
- `signature`, `签名`, `stamp`, or `印章` inserts the uploaded signature/stamp image.

Checkboxes are selected for `1`, `true`, `yes`, `y`, `是`, `勾选`, or `checked` (case-insensitive). Radio and choice values must match an option already defined in the form. “Flatten PDF Forms” is enabled by default and makes populated fields non-editable in the generated copy.

## Computed and conditional rules

Rules are created in the application. Expressions support field names, numeric and quoted string literals, parentheses, `+ - * / % ^ **`, comparisons, `&&` / `||` / `!`, `AND` / `OR` / `NOT`, `且` / `或` / `非`, and `condition ? value1 : value2`. Supported functions are `round`, `abs`, `ceil`, `floor`, `min`, `max`, and `coalesce`.

Use square brackets for field names containing spaces or names that collide with keywords/functions:

```text
round((Quantity * UnitPrice - Discount) * (1 + TaxRate), 2)
coalesce(Discount, 0)
[Net Amount] >= 1000 ? "Priority" : "Standard"
```

Percent strings such as `13%` and formatted numbers such as `¥1,234.50` are normalized locally. Blank values cannot silently participate in arithmetic; use `coalesce(field, fallback)` when a blank value has an intentional default. Invalid expressions become explicit row-level validation errors.

## Privacy architecture

The Electron main process starts a temporary Node engine on a random `127.0.0.1` port. Every API request requires an in-memory session token and same-origin/host checks. The renderer uses `contextIsolation`, sandboxing, a restrictive Content Security Policy, and no Node integration. Closing the last window or quitting the application stops the engine and clears temporary templates.

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) for the project policies.

## Current boundaries

- Static PDFs without AcroForm fields are copied per record but cannot be populated at arbitrary coordinates; the MVP has no visual PDF coordinate designer.
- A “signature” is an embedded image, not a certificate-backed cryptographic or legal digital signature.
- DOCX placeholder replacement preserves the original package and layout parts, but conversion to PDF is not Microsoft Word itself. Complex floating objects, advanced fields, uncommon fonts, macros, and other sophisticated Word features can render differently and should be tested with representative templates.
- A single DOCX converted to PDF must use one page size and orientation; mixed-section page sizes are rejected instead of being silently cropped.
- XLSM data can be read, but spreadsheet macros are never executed.
- DOCX macros, embedded objects, external relationships, DDE/INCLUDE/LINK fields, and active PDF scripts are rejected during template import.
- The in-memory MVP limits one job to 2,000 output files, 1,000 locally rendered documents, and 256 MB of uncompressed delivery content. Larger jobs must be split.
- Generated artifacts are structurally and cryptographically checked inside the delivery ZIP; DocFlow does not certify the semantic or legal correctness of customer data.
- Windows binaries must be built on Windows. Public commercial distribution requires Apple Developer ID signing/notarization on macOS and code signing on Windows.

## Community and Pro

DocFlow is being separated into four layers: an open Core engine, an open
Desktop Community application, private Pro extensions, and a future optional
Hub. Core includes the CLI, authenticated loopback API, template syntax, and
plugin contracts. Community keeps the useful local workflow already published
in the 0.x application; it is not reduced to a document-count-limited trial.

Pro focuses on capabilities that businesses pay to operate and govern:
multi-source relationships, visual designers, watched folders and schedules,
retries, audit and approval workflows, commercial connectors, team template
governance, deployment controls, offline activation, and support.

Paid editions will not be differentiated by hidden telemetry, document uploads, or reduced security.

## Project documentation

- [Product guides](https://docflowlocal.com/guides/)
- [Security policy](SECURITY.md)
- [Privacy architecture](PRIVACY.md)
- [Desktop code signing policy](https://github.com/docflowlocal/docflow-desktop/blob/main/CODE_SIGNING_POLICY.md)
- [Benchmark method and results](BENCHMARKS.md)
- [Desktop build and release checklist](DESKTOP_BUILD.md)
- [Windows Self-Signed Preview and verification](release/WINDOWS_SELF_SIGNED_PREVIEW.md)
- [Roadmap](ROADMAP.md)
- [Platform architecture and repository split](PLATFORM_ARCHITECTURE.md)
- [Unreleased changelog](CHANGELOG.md)
- [Modular release checklist](RELEASE_CHECKLIST.md)
- [Contributing](CONTRIBUTING.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Use Issues for reproducible bugs and Discussions for questions, template sharing, and product ideas.

## License and trademarks

The historical 0.x monolith remains available under GNU AGPL-3.0-or-later.
Original new contracts, verifier, extension SDK, and modular source files are
being prepared under MPL-2.0. The current Core transition package remains mixed
because inherited engine files retain AGPL-3.0-or-later; old AGPL grants are not
revoked. See [NOTICE.md](NOTICE.md) for the exact boundaries. The Community
application, Core, contracts, and license verifier are not offered under a
proprietary alternative license. Private Pro modules, commercial template
packs, implementation, training, support, service-level agreements, and
trademark permissions are separate commercial offerings and are not included
in the Community package. Copyright and trademark rights are distinct; see
[TRADEMARKS.md](TRADEMARKS.md). For commercial products and services, contact
`support@willgo.tech`.
