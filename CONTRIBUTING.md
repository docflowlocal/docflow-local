# Contributing to DocFlow Local

Thank you for helping improve private, local-first document automation.

## Before starting

1. Search existing Issues and Discussions.
2. Open a Discussion for architectural changes or new template formats.
3. Keep changes focused and include a reproducible test.
4. Use synthetic data only. Never attach customer spreadsheets or templates containing personal or confidential information.

## Development

```bash
npm ci
node desktop/smoke-test.js
npm run desktop:debug
```

## Pull requests

- Explain what changed and why.
- Add or update smoke tests for engine behavior.
- Preserve the local-only security model.
- Do not introduce silent telemetry, remote document processing, or dynamic code evaluation.
- Run `node desktop/smoke-test.js` before submitting.

## Contribution licensing

This repository is in a staged license transition. A contribution is accepted
under the license already governing the file or content it changes:

- historical 0.x application code and files marked `AGPL-3.0-or-later` remain
  AGPL;
- original new module files marked `MPL-2.0` are accepted under MPL-2.0;
- starter template content declared `CC-BY-4.0` is accepted under CC-BY-4.0
  with the attribution described in `templates/NOTICE.md`.

Do not remove or change SPDX identifiers, copy code across these boundaries, or
describe historical AGPL code as MPL without maintainer approval and a
documented provenance review. A contribution does not relicense existing
history. Substantial code contributions or license-boundary changes should
begin with a Discussion.

The project uses the [Developer Certificate of Origin 1.1](https://developercertificate.org/)
for contributions. Every commit must include a real-name `Signed-off-by` line:

```text
Signed-off-by: Your Name <you@example.com>
```

Use `git commit --signoff` (or `git commit -s`) to add it. The sign-off certifies
that you have the right to submit the contribution under its applicable
license; it is not merely an authorship label. Maintainers must resolve license
provenance before merging rather than assuming that a DCO sign-off relicenses
third-party or historical code.

## Community spaces

- Issues: reproducible defects and scoped implementation work;
- Discussions: usage questions, ideas, polls, and template showcases;
- Security reports: `security@docflowlocal.com`, never a public Issue.
