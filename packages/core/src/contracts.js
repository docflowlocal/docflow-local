"use strict";

// SPDX-License-Identifier: MPL-2.0

try {
  module.exports = require("@docflow-local/contracts");
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND" || !String(error.message).includes("@docflow-local/contracts")) {
    throw error;
  }
  // Source-tree fallback for running this package before workspace links have
  // been installed. Published packages resolve the declared npm dependency.
  module.exports = require("../../contracts/src");
}
