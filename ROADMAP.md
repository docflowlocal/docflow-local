# Roadmap

The roadmap communicates direction, not a delivery guarantee.

## Shipped in the desktop MVP

- CSV, XLSX, and XLSM import with physical source-row tracking, displayed-number-format preservation, field mapping, and required-field validation.
- Original-layout DOCX population, including cross-run placeholders, conditional sections, QR codes, PNG/JPEG images, and image signatures.
- PDF AcroForm inspection and population for text, checkboxes, radio groups, choices, images, QR codes, and image signatures, with optional flattening.
- A visual editor for safely evaluated computed and conditional rules.
- Multi-template generation, optional populated DOCX output, per-record PDF merging, naming rules, and nested output folders.
- Validation reports, delivery manifests, generated-file structure checks, ZIP entry verification, and SHA-256 integrity metadata.
- English and Simplified Chinese desktop interfaces.
- Session-token-protected loopback APIs with renderer sandboxing and no document upload.

## Community Edition next

- Reusable local project files for mappings, rules, templates, and output settings.
- Richer import diagnostics, data previews, and duplicate-record handling.
- Community template schema, examples, and a local template starter wizard.
- More DOCX compatibility fixtures and documented rendering profiles.
- Accessibility, keyboard navigation, and additional localization improvements.
- Reproducible release automation and signed macOS/Windows community builds.

## Pro

- Visual coordinate designer for static PDFs that do not contain AcroForm fields.
- Watched folders, scheduled local jobs, and CLI batch automation.
- Project history, audit reports, approval checkpoints, and shared template libraries.
- Offline business licensing, deployment controls, and priority support.

## Industry solutions

- Trade quotation packages.
- Engineering delivery packages.
- HR onboarding packages.
- Compliance submission packages.
- School certificates and assessments.
- Real-estate contract and listing packages.

## Explicit non-goals for the current MVP

- Image signatures are not certificate-backed digital signatures.
- The built-in DOCX-to-PDF renderer is not a byte-for-byte substitute for Microsoft Word and can differ on complex documents.
- Static PDF coordinate placement is not available until the visual designer is implemented.
- Public release artifacts are not production-trusted until platform code signing and macOS notarization are configured.

Feature requests and design proposals belong in GitHub Discussions.
