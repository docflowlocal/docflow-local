# Repository map

DocFlow is being organized as independent layers with explicit contracts. The
current repository is a transition monorepo. Package contracts are already
independent; examples locate a separately cloned template repository through
`DOCFLOW_TEMPLATES_DIR` so template binaries do not have to be duplicated.

| Current path | Future repository | Audience | Distribution |
| --- | --- | --- | --- |
| `packages/core` | `docflowlocal/docflow` | Developers and integrators | Open source, MPL-2.0 |
| `packages/contracts` | `docflowlocal/docflow` | Core, desktop, and plugin authors | Open source, MPL-2.0 |
| `desktop`, `static` | `docflowlocal/docflow-desktop` | Business users | Community source distribution |
| `templates` | `docflowlocal/templates` | Business users and consultants | Free starters; each pack declares its license |
| `plugins` | `docflowlocal/plugins` | Integrators | Community plugin examples |
| `examples` | `docflowlocal/examples` | Evaluators and developers | Runnable, sanitized scenarios |
| `docs` | `docflowlocal/docs` or Core `/docs` | All users | Public documentation |
| private Pro modules | Private repositories | Paying organizations | Proprietary commercial license |

## Layer contracts

```text
Business data
    │
    ▼
DocFlow Core ── versioned schemas ── CLI / local HTTP API / JavaScript API
    │                                      │
    │                                      ├── Community Desktop
    │                                      └── approved integrations
    ▼
DOCX artifacts

Plugins ── API v1 registration ──► Core
Templates ── documented tags ────► Core
Pro modules ── public contracts ─► Core and Desktop
```

Core owns deterministic data parsing, safe expression evaluation, DOCX template
rendering, validation, artifact naming, and plugin registration. It must not
depend on Electron, a hosted account, or a proprietary service.

Community Desktop owns the local visual workflow: import, mapping, preview,
validation, generation, and delivery packaging. It can consume Core but must not
fork template behavior.

Pro owns operational complexity—multi-source joins, advanced package workflows,
history/retry/audit, enterprise connectors, permissions, deployment, and support.
Private modules should use the same public schemas instead of patching Core files.

Hub is a future optional cloud layer for team sync, queues, webhooks, marketplaces,
and AI-assisted workflows. Local Core must remain usable without Hub.

## Dependency direction

- `contracts` has no dependency on Core or Desktop.
- `core` depends on contracts.
- Desktop and integrations depend on Core/contracts.
- Templates and examples depend only on documented public behavior.
- Community packages never import private Pro code.
- Pro extensions may depend on public packages but must fail closed when a
  required license or capability is unavailable.

## License boundaries

Package manifests, notices, per-file SPDX identifiers, and per-template
manifests identify the applicable terms. The starter templates currently
declare `CC-BY-4.0`. Original new modular source declares `MPL-2.0`, while
historical 0.x files and adaptations retain `AGPL-3.0-or-later`. The current
Core transition package is therefore mixed-license and must not be published as
pure MPL until provenance or independent replacement is resolved. A source
license does not grant rights to DocFlow trademarks. Private Pro code and paid
industry packs require separate commercial terms.

Before publishing split repositories, preserve file history where practical,
copy the applicable license and security policy, update package provenance, and
run the same contract and content validation in every repository.
