# Privacy Policy for the Community Edition

Last updated: 2026-08-08

DocFlow Local is designed to process customer documents on the user's computer.

## Document processing

- Imported spreadsheets, templates, signatures, generated PDFs, and ZIP packages are processed locally.
- The desktop engine listens only on a random `127.0.0.1` loopback port.
- Uploaded document content is held in local process memory for the active operation and is not sent to DocFlow Local servers.
- Generated files are written only to locations selected by the user or the operating system's download flow.

## Network activity

The Community Edition may eventually check for signed software updates. Any update request must be documented and must not include document names, field values, customer names, or generated content.

Usage analytics are not enabled in the current Community Edition. If optional diagnostics are introduced, they must be opt-in, documented, and exclude document content and identifying file metadata.

A future release may keep a bounded local-only milestone ledger to resume
onboarding, deduplicate successful batches, decide whether to offer a Pro
trial, and show value on the same device. A local ledger is not permission to
transmit data. It must use the allowlist, retention controls, and the controls
to inspect, export, and clear data defined in
[Activation, qualification, trial, and telemetry contract](docs/activation-and-telemetry.md).

Any future telemetry sender must remain disabled until the user makes a
separate, informed opt-in choice. Uploaded diagnostics may contain only the
daily aggregate fields in that contract. In particular, DocFlow must not send
file or folder names, paths, source rows, customer values, field or column
names, mappings, formulas, template contents, generated content, document
counts, workflow/input/template hashes, license identifiers, or hardware
identifiers.

Starting a trial, asking for sales contact, and opting into product diagnostics
are separate choices. None implies either of the others.

## Website

The public website may receive standard web-server request data such as IP address, user agent, referrer, and request timestamp through the hosting provider. Newsletter, checkout, and support services will have separate notices before personal information is collected.

## Contact

Privacy questions: `privacy@docflowlocal.com`
