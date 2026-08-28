# Modular release checklist

This checklist turns the transition monorepo into independently reproducible
Core, Desktop Community, template, plugin, example, documentation, and private
Pro releases. Do not publish from an unreviewed working tree.

## 1. Provenance and legal

- Preserve the historical `v0.4.0-monolith` tag and AGPL-3.0-or-later source.
- Complete the authorship/provenance audit for files moving to MPL-2.0.
- Treat the current `@docflow-local/core` preview as
  `MPL-2.0 AND AGPL-3.0-or-later`: `src/data.js`, `src/expression.js`,
  `src/index.js`, and `src/template-engine.js` inherit historical AGPL code.
- Do not publish or label Core as pure MPL until every inherited file has a
  documented relicensing grant from all relevant rightsholders or an
  independently implemented replacement.
- Follow the executable
  [`docs/core-relicensing-clean-room-plan.md`](docs/core-relicensing-clean-room-plan.md)
  and require `npm run test:licenses` to pass.
- Include the full applicable license, notices, security policy, contributor
  policy, changelog, and trademark statement in every repository and artifact.
- Obtain professional review of the MPL transition, contributor/DCO process,
  separate commercial-offering terms, template rights, and trademark policy.

## 2. Create repositories

Create these repositories in the existing `docflowlocal` organization:

1. `docflow` — Core, contracts, CLI, local API, and plugin SDK.
2. `docflow-desktop` — Electron Community application and public host contracts.
3. `templates` — CC-BY starter templates and manifests.
4. `plugins` — community plugin examples.
5. `examples` — sanitized runnable workflows.
6. `docs` — optional after Core documentation stabilizes.

Preserve useful history with path-filtered migration where practical. Keep
`docflow-pro` private and never copy it, license payloads, signing keys, or
commercial build logs into public repositories.

Before creating repositories, run:

```bash
npm run test:exports
npm run export:repositories -- --dry-run
```

The exporter must produce the same content hash on repeated runs, reject a
non-empty output directory, contain no `file:`, `link:`, or `workspace:`
cross-repository dependency, and keep the Pro tree and signing material out of
all public exports.

## 3. Publish public packages in dependency order

Before the first npm release, verify ownership and 2FA policy for the
`@docflow-local` scope. Publish immutable exact versions in this order:

1. `@docflow-local/contracts`
2. `@docflow-local/core`
3. `@docflow-local/license-verifier`
4. `@docflow-local/desktop-extension-sdk`

For every tarball:

- run syntax, unit, API, content, security, and `npm audit --omit=dev` checks;
- confirm `LICENSE`, README, package exports, provenance metadata, and no private
  source or secret material;
- for the mixed Core preview, confirm both complete license texts and its
  file-level `NOTICE.md`; for pure-MPL packages, confirm the complete MPL text;
- install the packed tarball in an empty temporary project;
- run `docflow --version`, inspect, validate, and generate against a fixture.

## 4. Make Pro reproducible

The current private development checkout temporarily uses adjacent `file:`
dependencies because public packages are not published. Before any commercial
CI or artifact:

- replace every adjacent `file:` reference with exact approved public package
  versions or an authenticated internal registry;
- regenerate the lockfile in a clean checkout with no public source siblings;
- inject only the vendor Ed25519 **public** verification key into the Electron
  main process;
- keep the signing private key in controlled signing infrastructure;
- test invalid, expired, revoked, wrong-device, and wrong-feature licenses;
- preserve the documented at-least-once watched-folder and approval-identity
  boundaries until stronger implementations exist.

In the private Pro checkout, `npm run test:release` must pass for development
and `npm run release:check` must pass before any commercial artifact. The latter
intentionally blocks adjacent `file:` dependencies, an absent external
production public keyring, stored private material, or a dirty worktree.

## 5. Desktop release

- Run all unit, API, UI, PDF, and packaged release smoke tests.
- Run macOS tests on each target architecture and Windows tests on a Windows
  runner; do not substitute cross-compilation for executing the packaged app.
- Build from the exact reviewed commit.
- Configure Apple Developer ID, hardened runtime, notarization, and stapling.
- Configure trusted Windows Authenticode signing and timestamping.
- Record SHA-256 checksums, SBOM/dependency inventory, signing state, source
  commit, Core version, and reproducible release notes.

Use `npm run build:mac:release` and `npm run build:win:release` for public
artifacts. These are separate from internal ad-hoc/unsigned builds and fail
closed when certificates, notarization/timestamp credentials, release evidence,
packaged smoke, or signature verification is missing. Run
`npm run release:check:mac` or `npm run release:check:win` on the matching
release host and regenerate platform-specific release metadata from the reviewed
commit before upload. Windows metadata must bind both the signed NSIS and
portable executables; a macOS host cannot substitute for Authenticode
verification.

## 6. Public launch

- Publish GitHub Releases and package versions before changing website wording
  from “being prepared” to “available”.
- Update `docflowlocal.com`, sitemap, `llms.txt`, documentation links, install
  commands, and version comparison against the released artifacts.
- Submit the updated sitemap to Google Search Console and Bing Webmaster Tools.
- Announce with runnable examples and template-specific pages; avoid automated
  or undisclosed promotion.

Repository creation, npm publication, code-signing enrollment, installer
publication, and production website deployment are external state changes and
must be performed only after explicit release approval.
