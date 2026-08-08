# Roadmap

The roadmap communicates direction, not a delivery guarantee.

## Shipped in the desktop MVP

- JSON, CSV, XLSX, and XLSM import with physical source-row tracking,
  displayed-number-format preservation, nested JSON arrays, field mapping, and
  required-field validation.
- Original-layout DOCX population, including cross-run placeholders, array/table
  loops, conditional sections, date/number/currency formatters, QR codes,
  PNG/JPEG images, and image signatures.
- PDF AcroForm inspection and population for text, checkboxes, radio groups, choices, images, QR codes, and image signatures, with optional flattening.
- A visual editor for safely evaluated computed and conditional rules.
- Multi-template generation, optional populated DOCX output, per-record PDF merging, naming rules, and nested output folders.
- Validation reports, delivery manifests, generated-file structure checks, ZIP entry verification, and SHA-256 integrity metadata.
- English and Simplified Chinese desktop interfaces.
- Session-token-protected loopback APIs with renderer sandboxing and no document upload.
- A modular Core transition preview with `docflow` CLI, authenticated `/v1`
  local API, versioned contracts, and a trusted-code plugin SDK. Original new
  modules are MPL-2.0; inherited engine files remain AGPL-3.0-or-later pending
  provenance review or independent replacement.
- Six sanitized starter templates, three runnable examples, and a transform
  plugin example.
- Deterministic multi-repository export, license-boundary checks, SBOM and
  release-manifest generation, and fail-closed macOS/Windows signing pipelines.
  Production certificates and public release evidence are not yet provisioned.

## Community Edition next

- Reusable local project files for mappings, rules, templates, and output settings;
  save/open remains a permanent Community capability, distinct from paid run history.
- Privacy-reviewed shareable recipe format, separate from local project files,
  with no source rows, original filenames, raw custom templates, customer literals,
  signatures, image assets, or generated content.
- Four first-run scenario packs with guided preflight repair and a 3–5 minute
  sample-to-delivery onboarding path.
- Richer import diagnostics, data previews, and duplicate-record handling.
- Community template schema, examples, and a local template starter wizard.
- More DOCX compatibility fixtures and documented rendering profiles.
- Accessibility, keyboard navigation, and additional localization improvements.
- Publicly trusted, notarized macOS and Authenticode-signed Windows community
  builds from reviewed split-repository commits.

## Pro

- Multi-source relationships, approval checkpoints, PII-free local audit
  chains, watched-folder reliability primitives, and offline feature
  entitlement checks are implemented as a private foundation. The private
  issuer now supports canonical Ed25519 claims, key rotation/revocation,
  generation rollback protection, and build-time public-key injection;
  production UI, real vendor keys, and commercial release packaging remain
  ahead.
- Visual coordinate designer for static PDFs that do not contain AcroForm fields.
- Scheduled jobs, API triggers, persistent retry management, and delivery
  connectors for unattended workflows.
- Project history UI, audit exports, approval workflow UI, offline Pro
  licensing, and priority support.
- The public verifier now defines explicit v2 `trial`, `subscription`, and
  `perpetual` license types while retaining v1 verification compatibility.
  Trial issuance/activation services, secure client storage, and commercial UI
  remain implementation work; a trial may start only after real activation and
  explicit user confirmation.

Activation, PQL, north-star, trial-state, and optional-telemetry privacy
contracts are frozen in
[docs/activation-and-telemetry.md](docs/activation-and-telemetry.md).

## Business and Hub

- Shared team template libraries, roles and permissions, centralized license
  management, branding, deployment controls, and SLA support.
- Optional future synchronization, queues, webhooks, marketplace, AI mapping,
  OCR, and multi-device administration.

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
