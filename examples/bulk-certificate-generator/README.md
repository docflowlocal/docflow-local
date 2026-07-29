# Bulk certificate generator

Generate two individualized completion certificates from nested JSON. The
example demonstrates an achievement loop, an optional score, and a QR code.

## Run

```bash
docflow inspect --template "$DOCFLOW_TEMPLATES_DIR/certificate/starter.docx"
docflow validate --data examples/bulk-certificate-generator/data.json --template "$DOCFLOW_TEMPLATES_DIR/certificate/starter.docx"
docflow generate --data examples/bulk-certificate-generator/data.json --template "$DOCFLOW_TEMPLATES_DIR/certificate/starter.docx" --output ./generated/bulk-certificates
```

## Acceptance

- Validation exits successfully before generation.
- `generated/bulk-certificates` contains two non-empty DOCX files.
- Recipient names and certificate IDs differ between the two files.
- The first certificate shows two achievements and a score.
- The second certificate shows one achievement and no score paragraph.
- Both documents contain a QR image and no unresolved `{{...}}` tags.

All identities and URLs are fictional. A production verification service must
authenticate IDs instead of trusting a URL printed in a document.
