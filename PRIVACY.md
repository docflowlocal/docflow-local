# Privacy Policy for the Community Edition

Last updated: 2026-07-21

DocFlow Local is designed to process customer documents on the user's computer.

## Document processing

- Imported spreadsheets, templates, signatures, generated PDFs, and ZIP packages are processed locally.
- The desktop engine listens only on a random `127.0.0.1` loopback port.
- Uploaded document content is held in local process memory for the active operation and is not sent to DocFlow Local servers.
- Generated files are written only to locations selected by the user or the operating system's download flow.

## Network activity

The Community Edition may eventually check for signed software updates. Any update request must be documented and must not include document names, field values, customer names, or generated content.

Usage analytics are not enabled in the current Community Edition. If optional diagnostics are introduced, they must be opt-in, documented, and exclude document content and identifying file metadata.

## Website

The public website may receive standard web-server request data such as IP address, user agent, referrer, and request timestamp through the hosting provider. Newsletter, checkout, and support services will have separate notices before personal information is collected.

## Contact

Privacy questions: `privacy@docflowlocal.com`
