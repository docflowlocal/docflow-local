# DocFlow Local

[简体中文](README.zh-CN.md) · [Website](https://docflowlocal.com) · [Download](https://docflowlocal.com/download/) · [Security](https://docflowlocal.com/security/)

DocFlow Local is a privacy-first desktop application that turns Excel/CSV data and Word/PDF templates into validated, consistently named PDF delivery packages.

> Customer documents are processed locally through the loopback interface and memory. The Community Edition does not upload document content.

## What it does

- Imports CSV, XLSX, and XLSM data;
- Detects `{{field}}` placeholders in DOCX templates;
- Maps fields and validates required values before generation;
- Supports conditional and safely evaluated computed fields;
- Generates bilingual quotation and project-appendix PDFs in batches;
- Inserts QR codes, signatures, and images;
- Applies naming rules and per-customer folder structures;
- Combines multiple templates into one ZIP delivery package;
- Includes validation reports and a delivery manifest;
- Switches between English and Simplified Chinese.

## Quick start

Node.js 22+ is recommended:

```bash
npm ci
node desktop/smoke-test.js
npm run desktop
```

Build for macOS Apple Silicon:

```bash
npm run build:mac
```

Build for Windows x64 on a Windows machine:

```powershell
npm ci
npm run build:win
```

## Community and Pro

The Community Edition will remain genuinely useful for local data import, mapping, validation, and document generation. Planned Pro capabilities include high-fidelity output using original Word layouts, a visual PDF field designer, saved projects, a visual rule editor, watched folders, CLI batch jobs, and business support.

Paid editions will not be differentiated by hidden telemetry, document uploads, or reduced security.

## Privacy architecture

The Electron main process starts a temporary Node engine on a random `127.0.0.1` port. The renderer uses `contextIsolation`, sandboxing, and no Node integration. The local engine stops when the application exits.

See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) for the project policies.

## Current boundaries

- Custom DOCX placeholders can be discovered and mapped, while generation currently uses built-in HTML/PDF layouts;
- Visual PDF coordinate mapping and AcroForm writing are not implemented yet;
- Multi-template generation currently creates multiple PDFs inside each customer folder;
- Windows binaries must be built on a Windows build host;
- Public commercial distribution requires Developer ID/notarization on macOS and code signing on Windows.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Use Issues for reproducible bugs and Discussions for questions, template sharing, and product ideas.

## License and trademarks

Community Edition code is intended to be released under the GNU Affero General Public License v3.0 or later. The DocFlow Local name, logo, and official industry templates are not granted under the code license; see [TRADEMARKS.md](TRADEMARKS.md). For OEM, proprietary embedding, or enterprise licensing, contact `sales@docflowlocal.com`.
