# Security Policy

## Supported versions

Security fixes are provided for the latest Community Edition release. Commercial support terms may cover additional versions.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Email `security@docflowlocal.com` with:

- affected version and operating system;
- reproduction steps or proof of concept;
- expected impact;
- whether the report may be publicly credited.

We aim to acknowledge reports within three business days and will coordinate disclosure after a fix is available.

## Security boundaries

- The desktop engine must bind to `127.0.0.1`, never `0.0.0.0`.
- Electron renderers must keep sandboxing and `contextIsolation` enabled and Node integration disabled.
- Navigation outside the local origin must be denied or opened in the system browser.
- Release artifacts must be signed; public macOS releases must use Developer ID and notarization.
- Real customer data, signing credentials, license secrets, and API tokens must never enter the repository.

## Scope

Reports about document parsing, path traversal, arbitrary file access, code execution, unsafe template evaluation, update integrity, or local service exposure are in scope.
