"use strict";

const base = require("../package.json").build;

const signtoolOptions = {
  signingHashAlgorithms: ["sha256"],
  rfc3161TimeStampServer: "http://timestamp.digicert.com",
  timeStampServer: "http://timestamp.digicert.com"
};
if (process.env.DOCFLOW_WIN_CERTIFICATE_SUBJECT) {
  signtoolOptions.certificateSubjectName = process.env.DOCFLOW_WIN_CERTIFICATE_SUBJECT;
}
if (process.env.DOCFLOW_WIN_PUBLISHER_NAME) {
  signtoolOptions.publisherName = process.env.DOCFLOW_WIN_PUBLISHER_NAME;
}

module.exports = {
  ...base,
  artifactName: "DocFlow-Local-${version}-Windows-${arch}.${ext}",
  win: {
    ...base.win,
    forceCodeSigning: true,
    signExecutable: true,
    verifyUpdateCodeSignature: true,
    signtoolOptions
  },
  nsis: {
    ...base.nsis,
    artifactName: "DocFlow-Local-Setup-${version}-${arch}.${ext}"
  }
};
