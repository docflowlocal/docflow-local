# Starter completion certificate

A verifiable training certificate with an achievement loop, optional score,
date/number formatting, and a QR code generated from `verificationUrl`.

## Try it

```bash
docflow inspect --template templates/certificate/starter.docx
docflow validate --data templates/certificate/sample.json --template templates/certificate/starter.docx
docflow generate --data templates/certificate/sample.json --template templates/certificate/starter.docx --output ./generated/certificates
```

Expected result: two DOCX certificates, each with its own recipient, achievement
list, certificate ID, and QR image. The first record includes a score; the second
record proves the conditional score paragraph can be omitted.

The sample identities and verification URLs are fictional. Decide how your
organization prevents duplicate IDs and authenticates verification links.
