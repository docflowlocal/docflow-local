# Reproducible repository exports

The transition monorepo includes a source-only exporter for preparing six public
repository trees without writing into the checkout:

```bash
npm run export:repositories -- --dry-run
npm run export:repositories
npm run export:repositories -- --output /absolute/clean/directory
node scripts/export-repositories.js --verify /absolute/export/directory
```

Without `--output`, a new directory named `docflow-repositories-*` is created
under the operating-system temporary directory. An explicit output path must be
outside this source checkout and must either not exist or be an empty, regular
directory. A non-empty directory is rejected without modifying its contents.
The exporter first writes and verifies a sibling staging directory, then renames
the complete tree into place.

`--dry-run` performs the complete source walk and prints the manifest without
creating an output directory. `--manifest` prints the full manifest after a real
export, while `--hash` prints only its aggregate SHA-256.

## Repository map

| Export | Transition sources |
| --- | --- |
| `docflow` | Core/CLI/local API, contracts, license verifier, desktop extension SDK |
| `docflow-desktop` | Electron main/preload code, renderer assets, build resources, current desktop package metadata |
| `templates` | Starter DOCX packs, manifests, samples, build and validation scripts |
| `plugins` | Public plugin examples and validation scripts |
| `examples` | Sanitized runnable workflows |
| `docs` | Public product and developer documentation |

Every tree contains `LICENSE`, `NOTICE.md`, `README.md`, `package.json`, the
applicable public policy files, and its source-specific metadata. Package name,
version, license, scripts, and dependency metadata are preserved unless the
split requires a documented rewrite. Repository, bugs, and homepage fields are
normalized to the corresponding public repository.

The `docflow` and docs root workspace manifests are generated deterministically.
The desktop manifest drops transition-only workspaces/scripts and pins
`@docflow-local/core` and `@docflow-local/license-verifier` to their exact
current versions; it never retains `file:`, `link:`, or `workspace:` references.
The transition root lockfile is deliberately not exported because it describes
paths that do not exist in `docflow-desktop`. Generate the first desktop
lockfile only after those exact public package versions have been published,
then review and commit it in that repository.

The templates repository uses its CC-BY attribution notice as its root
`LICENSE` summary. This is not represented as a bundled copy of the complete
legal code: each template manifest remains the authoritative per-pack
declaration and the summary links to the official CC-BY-4.0 terms.

## Manifest and verification

The output root contains `export-manifest.json`. It has no timestamp, output
path, or absolute source path. For each sorted file it records:

- repository-relative source and destination paths;
- normalized executable mode;
- byte length;
- SHA-256.

Repository hashes cover the sorted path, mode, length, and file hash tuples. The
top-level hash covers the six ordered repository names and their hashes. Running
the exporter twice against the same source bytes produces the same manifest and
aggregate hash. Every real export is automatically re-read and verified before
success is reported; `--verify` repeats that check later and rejects missing,
extra, modified, or forbidden files.

## Exclusion and secret policy

The exporter never follows symbolic links. It excludes dependency, build, VCS,
and scratch directories named `node_modules`, `dist`, `.git`, `.wrangler`,
`coverage`, or `work` at any depth. Environment files other than documented
examples, private-key/signing file extensions, credential filenames, PEM
private-key markers, and common AWS access-key identifiers fail closed instead
of being copied.

Only explicit paths beneath this public checkout are eligible. The private Pro
repository is not consulted, and any selected path segment named `docflow-pro`
is rejected.

Package manifests are also rejected if any dependency uses `file:`, `link:`,
`workspace:`, or a relative filesystem path. Relative Markdown links must
resolve within their exported repository; cross-repository links use stable
`https://github.com/docflowlocal/...` URLs.

The `docflow` export carries the machine-readable license boundary manifest,
complete MPL/AGPL texts, clean-room plan, and `npm run test:licenses`. Its
`--exported-source` check confirms current SPDX/NOTICE/package boundaries and
that the pure-MPL gate remains closed. It explicitly reports historical Git blob
and installed-dependency deep auditing as unavailable; that deeper audit must be
run in this transition repository and is never fabricated by the export.
