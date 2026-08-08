"use strict";

const base = require("../package.json").build;

const releaseConfig = {
  ...base,
  artifactName: "DocFlow-Local-${version}-macOS-${arch}.${ext}",
  mac: {
    ...base.mac,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    notarize: true,
    target: ["pkg", "zip"]
  },
  pkg: {
    artifactName: "DocFlow-Local-${version}-macOS-${arch}.${ext}",
    installLocation: "/Applications",
    isRelocatable: true,
    isVersionChecked: true
  }
};

// The internal build explicitly sets identity:null. Remove it for a public
// build so electron-builder can import CSC_LINK or discover CSC_NAME.
delete releaseConfig.mac.identity;
if (process.env.DOCFLOW_PKG_IDENTITY) {
  releaseConfig.pkg.identity = process.env.DOCFLOW_PKG_IDENTITY;
}

module.exports = releaseConfig;
