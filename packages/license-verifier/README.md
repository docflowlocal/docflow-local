# @docflow-local/license-verifier

Public, offline-only verification primitives for DocFlow license envelopes.

The package contains feature identifiers and Ed25519 signature verification. It
does not contain a production public key by default, a private signing key,
license issuance logic, activation services, document access, telemetry, or
commercial Pro implementations.

Hosts inject their build-time public keyring:

```js
const { verifyLicense } = require("@docflow-local/license-verifier");

const result = verifyLicense(envelope, {
  keyring: { "vendor-2026-01": publicKey },
  installationHash,
  appVersion: "1.0.0",
  buildCeiling: "pro"
});
```

Verification results carry process-local provenance that cannot be recreated by
deserializing or constructing a lookalike object. Hosts should pass the returned
object directly to entitlement consumers; do not send it through JSON or IPC.
Production clients must keep their vendor keyring in the trusted main process
and must never accept keyring entries from renderers, local APIs, or plugins.

Private keys must remain in controlled issuer infrastructure and must never be
bundled with this package or a DocFlow client.
