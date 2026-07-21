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

The project intends to maintain both an AGPL Community Edition and separately licensed commercial modules. Until a contributor agreement has received legal review and is enabled for the repository, maintainers will merge documentation, tests, translations, templates, and small fixes only after confirming licensing provenance. Substantial code contributions should begin with a Discussion.

By submitting a contribution, you certify that you have the right to submit it and that it may be distributed under the repository's stated open-source license.

## Community spaces

- Issues: reproducible defects and scoped implementation work;
- Discussions: usage questions, ideas, polls, and template showcases;
- Security reports: `security@docflowlocal.com`, never a public Issue.
