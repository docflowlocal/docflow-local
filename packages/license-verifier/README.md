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

## Claims schema migration

`docflow-license-claims/v2` is the current schema for newly issued licenses. It
requires an explicit `licenseType`:

- `trial` — time-bounded, installation-bound, at most 21 days, and no grace
  period;
- `subscription` — requires `expiresAt` and may include `graceUntil`;
- `perpetual` — omits `expiresAt` and `graceUntil`; `maxMajorVersion` still
  limits which application major versions are entitled.

Use `CURRENT_CLAIMS_SCHEMA` when issuing a new license. `CLAIMS_SCHEMA` remains
the v1 compatibility identifier so existing issuer integrations do not
silently change the bytes they sign.

The verifier continues to accept already-signed
`docflow-license-claims/v1` payloads. Because v1 had no commercial-type field,
the verifier derives `licenseType: "subscription"` after successful signature
and schema validation. This compatibility rule does not turn a v1 license into
a perpetual entitlement and does not weaken its existing expiry checks.

Example v2 trial claims:

```json
{
  "schema": "docflow-license-claims/v2",
  "licenseId": "trial_opaque_001",
  "licenseType": "trial",
  "product": "docflow-local",
  "edition": "pro",
  "issuedAt": "2026-08-08T00:00:00.000Z",
  "notBefore": "2026-08-08T00:00:00.000Z",
  "expiresAt": "2026-08-29T00:00:00.000Z",
  "features": ["folders.watched", "automation.retries"],
  "maxMajorVersion": 1,
  "installationHashes": ["<lowercase-sha256>"]
}
```

License type is a commercial-duration contract, not an edition shortcut.
Every paid capability still requires an explicit feature entitlement and must
fit both the claimed edition and the host build ceiling.
