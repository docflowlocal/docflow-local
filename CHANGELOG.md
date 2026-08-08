# Changelog

All notable changes to DocFlow Local are documented here. The project uses
semantic versioning after the modular repositories are published.

## 0.6.0 — Release candidate

### Added

- Four in-app starter workflows for trade quotations, engineering handover,
  HR onboarding, and compliance delivery, each with a guided missing-field fix.
- Atomic local `.docflow` project save/open, recent projects, and reusable
  mappings without uploading customer files.
- Privacy-safe `.docflowrecipe` export/import containing only structure,
  mappings, rules, and template requirements—not records, filenames, template
  binaries, assets, or generated output.
- A local-only activation and PQL ledger for guided activation, real batches,
  repeat usage, multi-template use, and explicit Pro-feature intent.
- A Community-side commercial host with strict IPC allowlists, opaque handles,
  bounded inputs, and fail-closed adapter responses.
- A Pro workbench surface for license status, an activation-gated 21-day trial,
  one-off automation, watched folders, schedules, stops, and local history.

### Changed

- Community remains permanently useful without watermarks or document-count
  limits; paid boundaries sit at unattended automation and governance.
- A Pro trial starts only after a real project has completed preflight, saved a
  delivery package, and saved the project, and only after the user opts in.
- Trial, subscription, and perpetual license types are explicit in claims v2;
  legacy claims remain safely verifiable.
- Pro expiry disables new commercial operations without locking Community
  projects, templates, or existing output.

### Security and privacy

- Customer data and operational paths never cross the commercial renderer
  boundary; license and automation responses are recursively allowlisted.
- Project recipes and activation exports are local, bounded, and intentionally
  free of customer content.
- The Community build contains no Pro implementation or signing private key.
- Core 0.1.1 replaces the vulnerable `image-size` parser with a bounded local
  image-header reader; the reviewed dependency lock reports zero known npm
  vulnerabilities at release-review time.

### Release status

The Community and Pro source changes are implemented and tested locally. Public
0.6.0 artifacts remain a release candidate until the dependency publication,
clean-source, signing/notarization, and external account gates pass.

## 0.5.0 — Unreleased modular preview

### Added

- `@docflow-local/core` with versioned JavaScript, CLI, authenticated loopback
  HTTP, and trusted-plugin contracts.
- JSON, CSV, XLSX, and XLSM Core data adapters, including nested JSON arrays.
- DOCX variables, loops, conditions, formatters, images, signatures, QR codes,
  deterministic naming, and validation.
- Versioned JSON Schemas and runtime request validation.
- Six sanitized starter templates, three runnable business examples, and a
  transform plugin example.
- Packaged-application release smoke mode for macOS and Windows.
- Public offline license-verification and Desktop extension-host contracts.
- A private Pro foundation for relations, watched folders, retries, audit
  chains, approval material, and feature entitlements.
- Deterministic six-repository export tooling with hashes, secret rejection,
  publishable dependency validation, and per-repository metadata.
- Machine-readable release evidence, GitHub visibility plan, CycloneDX SBOM,
  artifact manifest, and internal/public readiness gates.
- Fail-closed Developer ID/notarization and Authenticode/timestamp release
  pipelines, separate from unsigned internal packaging.
- Platform-specific release manifests: macOS binds PKG/ZIP signing and
  notarization evidence, while Windows binds the exact NSIS/portable EXEs plus
  signer and timestamp certificate metadata.
- Standalone Desktop lockfile gates that reject copied workspace locks, local
  links, stale dependency roots, and non-registry Core/verifier resolutions.
- A private offline license-issuer CLI with canonical Ed25519 claims, `kid`
  rotation, revocation states, keyring generation rollback protection, and
  build-time public-key injection.

### Changed

- Desktop engine modules consume the public Core package boundaries.
- The product is organized as Core, Desktop Community, private Pro, and future
  Hub layers.
- Community remains useful without document-count quotas; Pro differentiation
  centers on operational complexity, reliability, governance, connectors, and
  support.
- The application version advances from 0.4.0 to 0.5.0 so new artifacts cannot
  overwrite the historical monolith build.
- macOS packaging now signs the fuse-modified application before executing its
  packaged release smoke; Windows packaging runs the equivalent smoke before
  producing NSIS and portable artifacts.
- The desktop bundle includes only the Chinese PDF font slice it uses, reducing
  `app.asar` from roughly 127 MB to 58 MB while preserving the font license.

### Security

- Core and Desktop loopback services require random bearer credentials and
  validate Host and Origin.
- Core request schemas reject unknown and malformed properties.
- HTTP and CLI packaging have explicit artifact and aggregate-output limits.
- Pro license decisions require verifier provenance and fail closed.
- Pro audit and watched-folder state use canonical paths and cross-process locks.
- Public source export rejects private-key files, common credential paths,
  secret-like content, local dependency specifiers, symlinks, and dirty output
  directories.
- Public Desktop release checks require a reviewed standalone lockfile with
  registry integrity hashes before SBOM generation.
- Commercial Pro release checks reject adjacent development dependencies, an
  absent production public keyring, stored key material, and dirty source.

### Licensing

- Historical 0.x and inherited engine files remain
  `AGPL-3.0-or-later`.
- Original new contracts, license-verifier, extension SDK, HTTP/CLI, and plugin
  modules carry file-level MPL-2.0 notices.
- The Core transition tarball is accurately labelled
  `MPL-2.0 AND AGPL-3.0-or-later` and includes both complete licenses plus a
  file-level notice. It must not be published as pure MPL until provenance and
  relicensing are confirmed or inherited files are independently replaced.
- A fixed historical-blob manifest, clean-room migration plan, and executable
  license-boundary check keep the pure-MPL gate closed until reviewed evidence
  exists.

### Release status

This entry describes the local release candidate. It is not a statement that
split GitHub repositories, npm packages, signed installers, or Pro licenses have
already been published.
