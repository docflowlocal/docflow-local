"use strict";

const base = require("../package.json").build;
const { metadata } = require("./windows-preview-certificate").loadPreviewCertificate();

module.exports = {
  ...base,
  artifactName: "DocFlow-Local-${version}-Windows-${arch}-Self-Signed-Preview.${ext}",
  win: {
    ...base.win,
    electronLanguages: ["en-US", "zh-CN"],
    forceCodeSigning: true,
    signExecutable: true,
    verifyUpdateCodeSignature: true,
    signtoolOptions: {
      certificateSha1: metadata.sha1Thumbprint,
      publisherName: metadata.commonName,
      signingHashAlgorithms: ["sha256"],
      rfc3161TimeStampServer: "http://timestamp.digicert.com",
      timeStampServer: "http://timestamp.digicert.com"
    }
  },
  nsis: {
    ...base.nsis,
    multiLanguageInstaller: true,
    installerLanguages: ["en_US", "zh_CN"],
    displayLanguageSelector: true,
    artifactName: "DocFlow-Local-Setup-${version}-${arch}-Self-Signed-Preview.${ext}"
  }
};
