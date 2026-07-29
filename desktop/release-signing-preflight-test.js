"use strict";

const assert = require("assert");
const {
  requireCompleteEnvironmentGroup,
  validateSigningEnvironment
} = require("./release-signing-preflight");

assert.strictEqual(
  requireCompleteEnvironmentGroup("none", ["A", "B"], {}),
  false
);
assert.throws(
  () => requireCompleteEnvironmentGroup("partial", ["A", "B"], { A: "value" }),
  /incomplete/
);

const missing = validateSigningEnvironment({});
assert.strictEqual(missing.valid, false);
assert(missing.errors.some(message => message.includes("CSC_LINK")));
assert(missing.errors.some(message => message.includes("notary")));

const apiKey = validateSigningEnvironment({
  CSC_LINK: "/secure/application-certificate.p12",
  CSC_INSTALLER_LINK: "/secure/installer-certificate.p12",
  APPLE_API_KEY: "/secure/AuthKey.p8",
  APPLE_API_KEY_ID: "KEY123",
  APPLE_API_ISSUER: "00000000-0000-0000-0000-000000000000"
});
assert.strictEqual(apiKey.valid, true);

const keychain = validateSigningEnvironment({
  CSC_NAME: "Developer ID Application: Example Company (TEAMID)",
  DOCFLOW_PKG_IDENTITY: "Developer ID Installer: Example Company (TEAMID)",
  APPLE_KEYCHAIN: "/Users/release/Library/Keychains/login.keychain-db",
  APPLE_KEYCHAIN_PROFILE: "docflow-notary"
});
assert.strictEqual(keychain.valid, true);

const partial = validateSigningEnvironment({
  CSC_LINK: "/secure/application-certificate.p12",
  CSC_INSTALLER_LINK: "/secure/installer-certificate.p12",
  APPLE_ID: "release@example.com"
});
assert.strictEqual(partial.valid, false);
assert(partial.errors.some(message => message.includes("incomplete")));

process.stdout.write("Signed macOS release preflight tests passed.\n");
