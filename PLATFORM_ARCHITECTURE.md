# DocFlow platform architecture

Status: accepted for the 1.0 modularization work.

## Product layers

### DocFlow Core

Repository: `docflowlocal/docflow`

Audience: developers and integrators.

Responsibilities:

- JSON, CSV, XLSX, and XLSM data adapters;
- safe DOCX template inspection and rendering;
- variables, loops, conditions, formatting, images, and QR codes;
- deterministic file naming;
- CLI and authenticated loopback API;
- a versioned plugin SDK;
- compatibility fixtures, examples, and developer documentation.

Core does not contain a graphical workflow designer, team administration,
commercial connectors, licensing enforcement, or hosted services.

Planned package names:

- `@docflow-local/core`
- `@docflow-local/plugin-sdk`
- command: `docflow`

### DocFlow Desktop Community

Repository: `docflowlocal/docflow-desktop`

Audience: individual business users.

Responsibilities:

- signed Windows and macOS desktop shell;
- local data import, template selection, mapping, validation, and generation;
- local project files and basic template management;
- bilingual user interface;
- no customer-document upload or mandatory account.

The Community application consumes public Core APIs. It must not import private
Pro implementation files.

### DocFlow Pro

Repository: private.

Audience: small and medium-sized businesses and implementation partners.

Responsibilities:

- relational data sources and reusable data models;
- visual static-PDF and advanced document designers;
- watched folders, schedules, retries, audit history, and approval checkpoints;
- commercial connectors, archival, delivery, and enterprise deployment;
- shared template libraries, roles, policy, offline activation, and support tooling.

Pro extends Core through the public plugin and host contracts. Its private
modules are never copied into public release artifacts or public source maps.

### DocFlow Hub

Future hosted layer. It may add template synchronization, team sharing, queues,
webhooks, marketplace, AI assistance, OCR, and multi-device licensing. Hub is
not required for local generation and is not part of the first modular release.

## Repository map

| Repository | Visibility | License | Purpose |
| --- | --- | --- | --- |
| `docflow` | public | MPL-2.0 target; inherited AGPL must be resolved | Core, CLI, local API, plugin SDK |
| `docflow-desktop` | public | AGPL-3.0-or-later for inherited 0.x; MPL only for marked new files | Community desktop application |
| `templates` | public | per-template manifest | Free starter templates and fixtures |
| `plugins` | public | MPL-2.0 | Community-maintained integrations |
| `examples` | public | MPL-2.0 | Runnable business workflows |
| `docs` | public | documentation license to be selected | Product and developer documentation |
| `docflow-pro` | private | proprietary | Commercial modules and release composition |

The existing public `docflow-local` repository remains the historical 0.x
Community source until the split repositories have reproducible releases.

## Existing public capability policy

The 0.x public repository already contains multi-template packages, computed and
conditional fields, PDF form population, PDF merge, and integrity reporting.
Those published versions remain available under their original AGPL terms.
The modularization must not remove those capabilities from an installed 0.x
application or claim that previously published source became proprietary.

New Pro differentiation therefore focuses on capabilities not yet published:
multi-source relationships, designers, unattended automation, audit and
approval workflows, commercial connectors, team governance, deployment policy,
and commercial support.

## Core contracts

### Node API

```js
const { createEngine } = require("@docflow-local/core");

const engine = createEngine({ plugins: [] });
for await (const artifact of engine.generate({
  data: { filename: "customers.xlsx", bytes: dataBytes },
  template: { filename: "quotation.docx", bytes: templateBytes },
  output: { pattern: "{{customer}}-{{quote_no}}" }
})) {
  // The CLI, server, or desktop host decides where artifact.relativePath is written.
}
```

Every versioned Core generation request and structured Core result has a
`schemaVersion`. Unknown major versions are rejected. Minor additions are
optional and backward compatible.

### CLI

```text
docflow generate --data customers.xlsx --template quotation.docx --output ./generated
docflow inspect --template quotation.docx
docflow serve --host 127.0.0.1 --port 3765
```

The CLI never prints row contents or template contents unless explicitly asked
for a preview. It writes machine-readable diagnostics with `--json`.

### Local API

Version prefix: `/v1`.

- `GET /v1/health`
- `POST /v1/inspect-template`
- `POST /v1/validate`
- `POST /v1/generate`

The default server binds only to `127.0.0.1`, requires a random bearer token,
limits upload and decompression sizes, and rejects untrusted Origin and Host
headers. Binding to another interface requires an explicit insecure-development
flag; it is never the desktop default.

### Plugin SDK

Plugin manifest:

```json
{
  "schemaVersion": 1,
  "id": "example.docflow-plugin",
  "name": "Example DocFlow plugin",
  "version": "1.0.0",
  "apiVersion": "1",
  "capabilities": ["data-source", "transform"],
  "entry": "index.js",
  "permissions": {}
}
```

Initial hooks:

- `registerDataSource(name, adapter)`
- `registerTransform(name, transform)`
- `registerFormatter(name, formatter)`
- `registerOutputSink(name, sink)`

Plugins are executable local code, not template data. The desktop application
does not install or execute an untrusted plugin without an explicit user action.
An in-process Node.js plugin is fully trusted code: manifest permissions document
intent but do not create a security sandbox. Enterprise allowlists and isolated
plugin execution belong to Pro.

## Dependency direction

```text
contracts ──> plugin-sdk ──> community plugins
    │
    └────────> core <──── desktop-community
                 ^                 ^
                 │                 │
                 └────── pro ──────┘

templates/examples ──> published Core, CLI, and plugin contracts

hub ──uses public Core/Pro service contracts; Core never depends on Hub
```

Circular imports between Core, Desktop, and Pro are forbidden. Core contains no
Electron dependency. Desktop owns native dialogs and local rendering adapters.

## Licensing migration

The current repository has one recorded code author, but a license migration is
still treated as an explicit release change:

1. preserve the AGPL license and tags for all 0.x source;
2. publish an authorship and provenance audit;
3. license original new split-repository files under MPL-2.0, without changing
   the license of copied or adapted AGPL files;
4. add SPDX identifiers and the MPL Exhibit A notice to new source files;
5. document that old AGPL releases remain AGPL;
6. require a reviewed Developer Certificate of Origin before accepting
   substantial contributions to open-source Community or Core components; those
   components are not distributed under a proprietary alternative license.

This document is an engineering decision, not legal advice. Commercial release
terms and the final contribution policy require professional legal review.

The current `packages/core` preview contains code copied or adapted from the
historical AGPL engine and is therefore
`MPL-2.0 AND AGPL-3.0-or-later`, not pure MPL. A pure-MPL Core release is blocked
until a documented provenance audit records an explicit grant from every
relevant rightsholder or those inherited implementations are independently
replaced. Merely moving files into a new repository does not satisfy this gate.

## Release gate

The split is complete only when:

- Core CLI and local API generate the same DOCX bytes as the compatibility
  fixtures, apart from documented package metadata differences;
- Desktop uses the published Core package rather than copied engine code;
- the Core provenance gate is resolved before any package or repository is
  labelled pure MPL;
- public repositories have independent tests, changelogs, security policies,
  and reproducible builds;
- private Pro modules are absent from public npm packages and source maps;
- macOS and Windows commercial binaries are signed, timestamped, and verified;
- website claims, pricing, and license labels match the released artifacts.
