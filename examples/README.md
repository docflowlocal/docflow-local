# DocFlow examples

These examples are copy-paste starting points for real local workflows. Inputs
use fictional people, organizations, identifiers, addresses, and `.invalid`
URLs.

In the transition monorepo, run commands from the repository root:

```bash
export DOCFLOW_TEMPLATES_DIR=templates
```

After `docflowlocal/examples` and `docflowlocal/templates` are split, clone them
as sibling directories and use:

```bash
export DOCFLOW_TEMPLATES_DIR=../templates
```

The commands below intentionally use this variable instead of assuming that
template binaries are copied into the examples repository.

- [`excel-to-quotation`](excel-to-quotation/) — one quotation per spreadsheet row
- [`bulk-certificate-generator`](bulk-certificate-generator/) — JSON arrays, conditions, and QR codes
- [`employee-onboarding-pack`](employee-onboarding-pack/) — offer letters as the first document in an onboarding pack

Each example contains explicit acceptance checks. Treat a generated file as a
draft until a responsible person has reviewed its business and legal meaning.
