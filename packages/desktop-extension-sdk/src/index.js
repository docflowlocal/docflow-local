"use strict";

// SPDX-License-Identifier: MPL-2.0

const {
  isKnownFeature,
  hasFeature,
  communityPolicy,
  isVerifiedLicenseResult
} = require("@docflow-local/license-verifier");

const API_VERSION = "1";
const SLOTS = Object.freeze([
  "project-menu",
  "template-toolbar",
  "data-source",
  "automation",
  "settings"
]);
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const COMMAND_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,191}$/;
const MAX_EXTENSIONS = 64;
const MAX_COMMANDS = 256;

class ExtensionHostError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ExtensionHostError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ExtensionHostError(code, message);
}

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("EXTENSION_INVALID", `${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("EXTENSION_INVALID", `${label} must be a plain object`);
  }
  for (const key of Object.keys(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) {
      fail("EXTENSION_INVALID", `${label} contains a forbidden key`);
    }
  }
  return value;
}

function strictKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail("EXTENSION_INVALID", `${label} contains an unknown field: ${key}`);
  }
}

function shortString(value, label, pattern = null) {
  if (typeof value !== "string" || !value.trim() || Buffer.byteLength(value, "utf8") > 256) {
    fail("EXTENSION_INVALID", `${label} must be a non-empty string under 256 bytes`);
  }
  const result = value.trim();
  if (pattern && !pattern.test(result)) fail("EXTENSION_INVALID", `${label} has an invalid format`);
  return result;
}

function stringSet(values, label, validator, limit = 32) {
  if (!Array.isArray(values) || values.length > limit) {
    fail("EXTENSION_INVALID", `${label} must be an array with at most ${limit} items`);
  }
  const output = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = shortString(value, label);
    if (!validator(normalized)) fail("EXTENSION_INVALID", `${label} contains an unsupported value: ${normalized}`);
    if (seen.has(normalized)) fail("EXTENSION_INVALID", `${label} contains a duplicate value: ${normalized}`);
    seen.add(normalized);
    output.push(normalized);
  }
  return Object.freeze(output);
}

function normalizeManifest(input) {
  const manifest = plainObject(input, "extension manifest");
  strictKeys(
    manifest,
    new Set(["schemaVersion", "id", "name", "version", "apiVersion", "slots", "requiredFeatures"]),
    "extension manifest"
  );
  if (manifest.schemaVersion !== 1) fail("EXTENSION_API_UNSUPPORTED", "Extension manifest requires schemaVersion 1");
  if (manifest.apiVersion !== API_VERSION) {
    fail("EXTENSION_API_UNSUPPORTED", `Extension API ${manifest.apiVersion} is not supported`);
  }
  const id = shortString(manifest.id, "extension id", ID_PATTERN);
  const version = shortString(manifest.version, "extension version");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    fail("EXTENSION_INVALID", "extension version must be semantic version syntax");
  }
  return Object.freeze({
    schemaVersion: 1,
    id,
    name: shortString(manifest.name, "extension name"),
    version,
    apiVersion: API_VERSION,
    slots: stringSet(manifest.slots || [], "extension slots", value => SLOTS.includes(value)),
    requiredFeatures: stringSet(
      manifest.requiredFeatures || [],
      "required features",
      isKnownFeature
    )
  });
}

function createExtensionHost(options = {}) {
  let policy = communityPolicy("community");
  const extensions = new Map();
  const commands = new Map();
  const logger = options.logger && typeof options.logger === "object"
    ? options.logger
    : Object.freeze({ info() {}, warn() {}, error() {} });

  function requireEntitlements(features) {
    const missing = features.filter(feature => !hasFeature(policy, feature));
    if (missing.length) {
      fail("EXTENSION_FEATURE_REQUIRED", `Required feature is not enabled: ${missing.join(", ")}`);
    }
  }

  function applyVerification(verification) {
    if (
      !isVerifiedLicenseResult(verification)
      || verification.valid !== true
      || !verification.policy
      || !Array.isArray(verification.policy.features)
    ) {
      fail(
        "EXTENSION_LICENSE_UNTRUSTED",
        "Feature policy must come from a successful DocFlow license verification"
      );
    }
    policy = verification.policy;
  }

  if (options.verification !== undefined && options.verification !== null) {
    applyVerification(options.verification);
  }

  async function register(extension) {
    if (extensions.size >= MAX_EXTENSIONS) fail("EXTENSION_LIMIT", "Too many desktop extensions are registered");
    const source = plainObject(extension, "extension");
    strictKeys(source, new Set(["manifest", "activate"]), "extension");
    const manifest = normalizeManifest(source.manifest);
    if (extensions.has(manifest.id)) fail("EXTENSION_DUPLICATE", `Extension is already registered: ${manifest.id}`);
    if (typeof source.activate !== "function") fail("EXTENSION_INVALID", "extension.activate must be a function");

    const staged = [];
    let registrationOpen = true;
    const api = Object.freeze({
      apiVersion: API_VERSION,
      logger: Object.freeze({
        info: (...values) => logger.info(`[${manifest.id}]`, ...values),
        warn: (...values) => logger.warn(`[${manifest.id}]`, ...values),
        error: (...values) => logger.error(`[${manifest.id}]`, ...values)
      }),
      registerCommand(definition) {
        if (!registrationOpen) fail("EXTENSION_REGISTRATION_CLOSED", "Extension registration is closed");
        const command = plainObject(definition, "command");
        strictKeys(command, new Set(["id", "title", "slot", "feature", "handler"]), "command");
        const localId = shortString(command.id, "command id", COMMAND_PATTERN);
        const id = localId.startsWith(`${manifest.id}:`) ? localId : `${manifest.id}:${localId}`;
        if (!COMMAND_PATTERN.test(id) || commands.has(id) || staged.some(item => item.id === id)) {
          fail("EXTENSION_DUPLICATE", `Command id is invalid or duplicate: ${id}`);
        }
        const slot = shortString(command.slot, "command slot");
        if (!SLOTS.includes(slot) || !manifest.slots.includes(slot)) {
          fail("EXTENSION_INVALID", `Command slot was not declared by the extension: ${slot}`);
        }
        const feature = shortString(command.feature, "command feature");
        if (!isKnownFeature(feature) || !manifest.requiredFeatures.includes(feature)) {
          fail("EXTENSION_INVALID", `Command feature was not declared by the extension: ${feature}`);
        }
        if (typeof command.handler !== "function") fail("EXTENSION_INVALID", "command.handler must be a function");
        staged.push(Object.freeze({
          id,
          extensionId: manifest.id,
          title: shortString(command.title, "command title"),
          slot,
          feature,
          handler: command.handler
        }));
      }
    });

    try {
      await source.activate(api);
    } catch (error) {
      fail("EXTENSION_ACTIVATION_FAILED", `${manifest.id} activation failed: ${error?.message || error}`);
    } finally {
      registrationOpen = false;
    }
    if (commands.size + staged.length > MAX_COMMANDS) fail("EXTENSION_LIMIT", "Too many extension commands are registered");
    extensions.set(manifest.id, manifest);
    staged.forEach(command => commands.set(command.id, command));
    return manifest;
  }

  return Object.freeze({
    register,
    setVerification(verification) {
      applyVerification(verification);
    },
    clearVerification() {
      policy = communityPolicy("community");
    },
    listExtensions() {
      return Object.freeze([...extensions.values()]);
    },
    listContributions() {
      return Object.freeze([...commands.values()].map(command => Object.freeze({
        id: command.id,
        extensionId: command.extensionId,
        title: command.title,
        slot: command.slot,
        feature: command.feature,
        enabled: hasFeature(policy, command.feature)
      })));
    },
    async invoke(commandId, input, context = {}) {
      const command = commands.get(String(commandId || ""));
      if (!command) fail("EXTENSION_COMMAND_UNKNOWN", `Unknown extension command: ${commandId}`);
      requireEntitlements([command.feature]);
      return command.handler(input, Object.freeze({
        signal: context.signal,
        taskId: String(context.taskId || ""),
        logger
      }));
    }
  });
}

module.exports = Object.freeze({
  API_VERSION,
  SLOTS,
  ExtensionHostError,
  createExtensionHost,
  normalizeManifest
});
