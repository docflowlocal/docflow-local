# Release evidence

`release-evidence.json` records release gates that cannot be inferred safely from
source code. A gate is complete only when its `status` is `complete` and its
`reference` identifies review evidence, a workflow run, a signed artifact, or
an internal change record.

`github-repositories.json` is the reviewed repository metadata plan. It keeps
names, visibility, descriptions, homepages, topics, and Discussions settings
separate from the export tool. Creating these repositories remains an explicit
external release action; the metadata file does not create or modify GitHub
state.

Do not put credentials, private keys, signing certificates, license payloads,
customer data, or authentication tokens in this directory. References should
be identifiers or URLs that are safe to publish.

Run the source and artifact checks with:

```bash
node scripts/release-readiness.js --channel internal --platform macOS
node scripts/release-readiness.js --channel public --platform macOS
node scripts/release-readiness.js --channel public --platform windows --arch x64
```

The public check intentionally fails while any manual evidence is pending, the
worktree is dirty, hardened runtime is disabled, Developer ID signing is
disabled, or the installer signature is absent.

Once the selected channel passes, generate a CycloneDX dependency inventory and
release manifest:

```bash
node scripts/generate-release-metadata.js --channel internal --platform macOS
node scripts/generate-release-metadata.js --channel internal --platform windows --arch x64
```

The generator hashes every expected installer, records the exact Git commit and
package/license inventory, and binds the manifest to the SBOM and release
evidence file. Public metadata generation refuses to run when any public gate
is still blocked. In the split `docflow-desktop` repository it also rejects a
missing, stale, workspace-linked, or locally linked lockfile: publish the exact
Core/verifier versions first, run `npm install`, review and commit that
repository's own `package-lock.json`, then generate release metadata. Windows
metadata binds the exact NSIS and portable `.exe` files and is generated only
after Authenticode verification on the Windows release host.
