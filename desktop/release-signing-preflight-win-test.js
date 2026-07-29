"use strict";

const assert = require("assert");
const { validateWindowsSigningEnvironment } = require("./release-signing-preflight-win");

const missing = validateWindowsSigningEnvironment({});
assert.strictEqual(missing.valid, false);
assert(missing.errors.some(message => message.includes("WIN_CSC_LINK")));
assert(missing.errors.some(message => message.includes("PUBLISHER")));

const pfx = validateWindowsSigningEnvironment({
  WIN_CSC_LINK: "C:\\secure\\docflow-signing.pfx",
  WIN_CSC_KEY_PASSWORD: "provided-by-ci-secret-store",
  DOCFLOW_WIN_PUBLISHER_NAME: "Example Company"
});
assert.strictEqual(pfx.valid, true);
assert.strictEqual(pfx.mode, "pfx");

const store = validateWindowsSigningEnvironment({
  DOCFLOW_WIN_CERTIFICATE_SUBJECT: "Example Company",
  DOCFLOW_WIN_PUBLISHER_NAME: "Example Company"
});
assert.strictEqual(store.valid, true);
assert.strictEqual(store.mode, "store");

const missingPassword = validateWindowsSigningEnvironment({
  WIN_CSC_LINK: "C:\\secure\\docflow-signing.pfx",
  DOCFLOW_WIN_PUBLISHER_NAME: "Example Company"
});
assert.strictEqual(missingPassword.valid, false);
assert(missingPassword.errors.some(message => message.includes("WIN_CSC_KEY_PASSWORD")));

process.stdout.write("Signed Windows release preflight tests passed.\n");
