# Code signing policy

This policy applies to Windows builds of the open-source DocFlow Local Desktop
Community application. A build must be labeled according to its actual signing
channel. A cryptographic self-signature must never be described as a publicly
trusted certificate or as completion of the production release-signing gate.

## SignPath status: application pending

The project has applied for free code signing through SignPath.io with a
certificate from SignPath Foundation. Approval is pending. No current
SignPath sponsorship, certificate issuance, or signed release is claimed.

If the application is approved, the SignPath channel will be used only for
eligible Community releases under the approved policy. Such a release must
not be described as publicly trusted until its Authenticode signature,
certificate chain, and timestamp have been verified. Provider attribution
will reflect the service and certificate actually used.

## Independent self-signed Preview channel

The current `0.6.1-preview.2` uses a separate `Self-Signed Preview` channel with a
project-controlled certificate, not a SignPath Foundation certificate. The
build command is `npm run build:win:self-signed-preview`.

Artifacts must retain these names:

- `DocFlow-Local-Setup-${version}-x64-Self-Signed-Preview.exe`
- `DocFlow-Local-${version}-Windows-x64-Self-Signed-Preview.exe`

The public certificate is `DocFlow-Local-Preview-CodeSigning.cer`, with:

- Subject: `CN=DocFlow Local Community Preview`
- SHA-1 thumbprint: `3BDE0D54717DC1A0C7BB19B36B3C2B90A6C00337`
- SHA-256 certificate fingerprint:
  `55A4AB626BD3C54E94161ADEF08B85C24E5E8A61B6CE8F4CB7DF15331F8B8114`
- Valid until: `2027-03-02T15:58:36Z` (UTC)

Certificate fingerprints identify the certificate; they are not executable
checksums. The SHA-1 thumbprint is an identifier, not a SHA-1 file-signing
requirement. Every executable has a separate published SHA-256 checksum.

This channel is intended for owned or IT-approved managed test environments.
It does not establish a third-party-verified publisher identity, create
SmartScreen reputation, satisfy SignPath approval, or satisfy the publicly
trusted signing gate for a formal commercial release. It must never be
relabeled as a production or publicly trusted release.

Self-signed certificates have the same SmartScreen warning behavior as unsigned
files. Smart App Control may still block them because its trusted-signature
check requires a trusted provider. See Microsoft's
[SmartScreen guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
and [Smart App Control signing requirements](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control).

The installer and application never automatically import or trust a
certificate and never modify current-user or local-machine trust stores.
They must not disable security protections, add antivirus exclusions, or
bypass SmartScreen, Smart App Control, firewall, or organizational application
control policy. If a managed device or Smart App Control blocks the Preview,
users must use a publicly trusted signed or Microsoft Store-distributed
version; they must not be instructed to disable protections to run it.

Only the public `.cer` is distributed. Private keys, `.pfx` files, and passwords
are restricted to the controlled signing environment and are never included
in source, logs, packages, or release assets. The Preview guide included in the
release explains read-only hash and signature checks; it does not install
certificate trust for users.

Only an ephemeral GitHub-hosted Windows runner may temporarily import the
pinned public certificate into `LocalMachine\Root`, after signing, for build
verification. Cleanup removes that exact trust entry and the signing key from
`CurrentUser\My`; it never removes unrelated certificates. Signing commands
have a 120-second timeout, and the packaged smoke process has a 60-second
timeout with process-tree termination on timeout. Stage markers distinguish
packaging, smoke-process exit, temporary trust, and verification. These bounds
do not weaken signer pinning, Authenticode verification, RFC 3161 timestamps,
or the separation between Preview and publicly trusted production releases.

## Signing scope

If approved, the SignPath Foundation certificate may be used only for these
Community artifacts built from this repository:

- the Windows x64 NSIS installer;
- the Windows x64 portable executable; and
- DocFlow Local executable files authored and maintained by this project that
  are contained in those packages.

The independent self-signed Preview channel has the same Community-only
artifact scope. Private DocFlow Pro modules, commercial connectors, customer
files, license payloads, credentials, signing keys, and commercial packages
are excluded from all Community packages. Upstream binaries are not signed
with the project's certificate.

Every component included in a signed Community package is distributed under
its applicable OSI-approved open-source license. The Community application,
Core, contracts, and license verifier are not offered under a proprietary
alternative license. Commercial products and services are limited to separate
Pro software that is not included in Community, industry templates,
implementation, training, support, service-level agreements, and trademark
permissions.

## Build and approval

- Source repository: <https://github.com/docflowlocal/docflow-desktop>
- Build system: GitHub Actions on GitHub-hosted runners
- Release inputs: reviewed immutable version tags or full commit SHAs
- Committer and reviewer: [@txianlian](https://github.com/txianlian)
- Release approver: [@txianlian](https://github.com/txianlian)

This is currently a single-maintainer project, so the same maintainer holds
the documented roles. Release signing still requires an explicit manual
approval. Maintainers must enable multi-factor authentication for GitHub and,
when access is granted, SignPath. Signing secrets must be restricted to the
approved release environment and must never be exposed to pull-request code.

## Privacy and user control

The [Community privacy policy](PRIVACY.md) applies to every build. The
Community Edition does not transfer document contents, customer data, file
names, field values, templates, signatures, or generated output to DocFlow
Local or another networked system. A network action explicitly requested by a
user must be separately documented and must not silently upload document
content.

The Windows installer provides an uninstaller. Users can remove DocFlow Local
from **Settings > Apps > Installed apps > DocFlow Local > Uninstall** or from
the Start menu shortcut created by the installer. Neither installation nor
uninstallation changes the user's certificate trust or security controls.

## Verification and release gates

Release notes publish the source commit, SHA-256 checksums, a CycloneDX SBOM,
and the build record. A publicly trusted Windows release must pass both
`Get-AuthenticodeSignature` and `signtool verify /pa /all /v`, including its
trusted chain and timestamp, before publication through that channel.

Self-signed Preview verification is separate: it must check executable
integrity and the pinned Preview certificate. Any temporary certificate trust
used in an isolated build job is a build-only verification context, not proof
that end-user Windows systems trust the certificate. The private key must
never be needed for a user's verification.

An unchanged Windows trust store may report `NotTrusted` for the Preview
certificate chain. That status is not a public-trust success, and by itself
does not prove integrity or authenticity. Users must also compare the exact
artifact's SHA-256 and signer thumbprint against the official release. A
different signer, `HashMismatch`, `NotSigned`, expiration, or checksum mismatch
requires stopping, not bypassing verification.

`npm run build:win:release` and the public/commercial release gates remain
unchanged. Successful self-signed Preview checks must not mark those gates
complete or downgrade their requirement for a publicly trusted signature.
