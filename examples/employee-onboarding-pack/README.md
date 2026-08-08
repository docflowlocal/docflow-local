# Employee onboarding pack

Start an onboarding document pack by generating one offer letter per employee.
Additional approved policies, checklists, and payroll forms can be generated with
the same data file as separate templates and placed under the same delivery root.

## Run

```bash
docflow inspect --template "$DOCFLOW_TEMPLATES_DIR/hr-offer/starter.docx"
docflow validate --data examples/employee-onboarding-pack/data.csv --template "$DOCFLOW_TEMPLATES_DIR/hr-offer/starter.docx"
docflow generate --data examples/employee-onboarding-pack/data.csv --template "$DOCFLOW_TEMPLATES_DIR/hr-offer/starter.docx" --output ./generated/onboarding/offers
```

To expand the pack, repeat `docflow generate` with each organization-approved
DOCX template and a sibling output directory, then archive the reviewed root.

## Acceptance

- Validation exits successfully before generation.
- `generated/onboarding/offers` contains two non-empty DOCX files.
- One letter includes the optional bonus paragraph and the other omits it.
- Candidate, role, manager, start date, and salary match the corresponding row.
- No document contains unresolved `{{...}}` tags.

These records and compensation figures are fictional. Do not use the starter as
legal, employment, payroll, tax, or regulatory advice.
