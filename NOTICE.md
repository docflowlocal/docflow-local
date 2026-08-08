# License and distribution notice

DocFlow Local is a mixed-license transition repository. This notice identifies
the applicable boundaries; it does not replace the complete license texts or
change the license of any existing file.

## Historical Community application

The root [LICENSE](LICENSE) contains the GNU Affero General Public License,
version 3 or later (`AGPL-3.0-or-later`). It continues to apply to the
historical 0.x monolith and to files that carry an
`SPDX-License-Identifier: AGPL-3.0-or-later` notice.

Copying, moving, wrapping, or refactoring historical AGPL code into a new
directory does not make that code MPL-licensed. Previously published AGPL
versions and grants remain available under their original terms; this
modularization does not revoke or replace them.

## New modular source

Original new source in `packages/contracts`, `packages/license-verifier`, and
`packages/desktop-extension-sdk` is licensed under the Mozilla Public License
2.0 (`MPL-2.0`), as declared by the package manifests and file notices. The
complete text is in [LICENSES/MPL-2.0.txt](LICENSES/MPL-2.0.txt).

The current `packages/core` transition package is mixed-license. Files derived
from the historical engine remain `AGPL-3.0-or-later`; independently written
module, contract, CLI, HTTP, and plugin-host files marked `MPL-2.0` use the MPL.
Its package metadata therefore declares
`MPL-2.0 AND AGPL-3.0-or-later`, and its own `NOTICE.md` lists the current
file-level boundary. Do not describe or publish this preview as a pure-MPL Core
until provenance has been reviewed and every inherited file has either an
explicit relicensing grant from all relevant rightsholders or an independently
implemented replacement.

When a file has an SPDX identifier, that identifier controls for the file.
Otherwise, use the nearest applicable package manifest and notice. Material
outside an explicit MPL or template boundary remains under the root AGPL terms.

## Starter templates

The starter template packs, their manifests, sample data, and accompanying
content under `templates/` are licensed under Creative Commons Attribution 4.0
International (`CC-BY-4.0`) as stated in their manifests and
[templates/NOTICE.md](templates/NOTICE.md). Retain the required attribution and
identify modifications. Template build or validation source files with an
explicit `MPL-2.0` identifier remain under the MPL.

No source or template license grants rights to DocFlow Local trademarks. See
[TRADEMARKS.md](TRADEMARKS.md).

## Other material

Third-party dependencies retain their own licenses and notices. Private DocFlow
Pro repositories, paid template packs, signing material, and commercial modules
are not included in this repository and are not licensed by this notice.
