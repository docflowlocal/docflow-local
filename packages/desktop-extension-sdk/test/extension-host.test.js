"use strict";

const assert = require("assert");
const crypto = require("crypto");
const { createExtensionHost, ExtensionHostError } = require("../src");
const {
  CLAIMS_SCHEMA,
  ENVELOPE_SCHEMA,
  PRODUCT,
  verifyLicense
} = require("@docflow-local/license-verifier");

function verifiedLicense(features) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const claims = {
    schema: CLAIMS_SCHEMA,
    licenseId: "sdk_test_license",
    product: PRODUCT,
    edition: "pro",
    issuedAt: "2026-01-01T00:00:00.000Z",
    notBefore: "2026-01-01T00:00:00.000Z",
    expiresAt: "2030-01-01T00:00:00.000Z",
    features,
    maxMajorVersion: 1,
    installationHashes: []
  };
  const payload = Buffer.from(JSON.stringify(claims));
  return verifyLicense({
    schema: ENVELOPE_SCHEMA,
    keyId: "sdk-test",
    payload: payload.toString("base64url"),
    signature: crypto.sign(null, payload, privateKey).toString("base64url")
  }, {
    keyring: { "sdk-test": publicKey },
    now: "2026-07-29T00:00:00.000Z",
    appVersion: "1.0.0",
    buildCeiling: "pro"
  });
}

function extension() {
  return {
    manifest: {
      schemaVersion: 1,
      id: "com.docflow.pro.audit",
      name: "DocFlow Pro Audit",
      version: "1.0.0",
      apiVersion: "1",
      slots: ["automation"],
      requiredFeatures: ["audit.reports"]
    },
    activate(api) {
      api.registerCommand({
        id: "export",
        title: "Export audit report",
        slot: "automation",
        feature: "audit.reports",
        handler: async input => ({ exported: true, count: input.count })
      });
    }
  };
}

async function main() {
  const host = createExtensionHost();
  await host.register(extension());
  assert.strictEqual(host.listExtensions().length, 1);
  assert.strictEqual(host.listContributions()[0].enabled, false);
  await assert.rejects(
    host.invoke("com.docflow.pro.audit:export", { count: 2 }),
    error => error instanceof ExtensionHostError && error.code === "EXTENSION_FEATURE_REQUIRED"
  );

  assert.strictEqual(typeof host.setPolicy, "undefined");
  assert.throws(
    () => host.setVerification({
      valid: true,
      policy: { features: ["audit.reports"] }
    }),
    error => error instanceof ExtensionHostError && error.code === "EXTENSION_LICENSE_UNTRUSTED"
  );
  host.setVerification(verifiedLicense(["audit.reports"]));
  assert.strictEqual(host.listContributions()[0].enabled, true);
  assert.deepStrictEqual(
    await host.invoke("com.docflow.pro.audit:export", { count: 2 }),
    { exported: true, count: 2 }
  );

  await assert.rejects(
    host.register(extension()),
    error => error instanceof ExtensionHostError && error.code === "EXTENSION_DUPLICATE"
  );
  await assert.rejects(
    host.register({
      ...extension(),
      manifest: { ...extension().manifest, id: "com.docflow.bad", apiVersion: "2" }
    }),
    error => error instanceof ExtensionHostError && error.code === "EXTENSION_API_UNSUPPORTED"
  );

  process.stdout.write("Desktop extension host tests passed.\n");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
