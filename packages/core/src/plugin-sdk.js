"use strict";

// SPDX-License-Identifier: MPL-2.0

const {
  ERROR_CODES,
  PLUGIN_API_VERSION,
  PLUGIN_CAPABILITIES,
  SCHEMA_VERSION,
  DocFlowError
} = require("./contracts");
const NAME_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const ENTRY_PATTERN = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+\.(?:c?js|mjs)$/;

function normalizeName(value, label = "plugin hook") {
  const name = String(value || "").trim().toLowerCase();
  if (!NAME_PATTERN.test(name)) {
    throw new TypeError(`${label} name must match ${NAME_PATTERN}`);
  }
  return name;
}

function assertFunction(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function`);
  return value;
}

class PluginRegistry {
  #dataSources = new Map();
  #transforms = new Map();
  #formatters = new Map();
  #outputSinks = new Map();
  #plugins = new Map();

  constructor() {
    Object.defineProperty(this, "apiVersion", {
      value: PLUGIN_API_VERSION,
      enumerable: true,
      writable: false
    });
  }

  #add(collection, kind, rawName, implementation) {
    const name = normalizeName(rawName, kind);
    if (collection.has(name)) throw new Error(`${kind} "${name}" is already registered`);
    collection.set(name, implementation);
    return this;
  }

  registerDataSource(name, source) {
    const normalized = typeof source === "function" ? { parse: source } : source;
    if (!normalized || typeof normalized !== "object") {
      throw new TypeError("data-source must be a function or an object");
    }
    const parse = assertFunction(normalized.parse, "data-source.parse");
    const extensions = [...new Set((normalized.extensions || []).map(extension => {
      const value = String(extension || "").trim().toLowerCase();
      return value.startsWith(".") ? value : `.${value}`;
    }))];
    return this.#add(this.#dataSources, "data-source", name, Object.freeze({ parse, extensions }));
  }

  registerTransform(name, transform) {
    return this.#add(this.#transforms, "transform", name, assertFunction(transform, "transform"));
  }

  registerFormatter(name, formatter) {
    return this.#add(this.#formatters, "formatter", name, assertFunction(formatter, "formatter"));
  }

  registerOutputSink(name, sink) {
    const normalized = typeof sink === "function" ? { write: sink } : sink;
    if (!normalized || typeof normalized !== "object") {
      throw new TypeError("output-sink must be a function or an object");
    }
    return this.#add(
      this.#outputSinks,
      "output-sink",
      name,
      Object.freeze({ write: assertFunction(normalized.write, "output-sink.write") })
    );
  }

  use(pluginModule, options = {}) {
    if (!pluginModule || typeof pluginModule !== "object") {
      throw new DocFlowError(ERROR_CODES.PLUGIN_INVALID, "plugin module must be an object");
    }
    const manifest = pluginModule.manifest;
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new DocFlowError(ERROR_CODES.PLUGIN_INVALID, "plugin module must export manifest");
    }
    const requiredKeys = ["schemaVersion", "id", "name", "version", "apiVersion", "entry", "capabilities", "permissions"];
    const unknownKeys = Object.keys(manifest).filter(key => !requiredKeys.includes(key));
    if (requiredKeys.some(key => !Object.prototype.hasOwnProperty.call(manifest, key)) || unknownKeys.length) {
      throw new DocFlowError(ERROR_CODES.PLUGIN_INVALID, "plugin manifest has missing or unknown properties");
    }
    if (
      manifest.schemaVersion !== SCHEMA_VERSION
      || manifest.apiVersion !== PLUGIN_API_VERSION
      || !PLUGIN_ID_PATTERN.test(String(manifest.id || ""))
      || !String(manifest.name || "").trim()
      || String(manifest.name).length > 160
      || !SEMVER_PATTERN.test(String(manifest.version || ""))
      || !ENTRY_PATTERN.test(String(manifest.entry || ""))
      || !Array.isArray(manifest.capabilities)
      || !manifest.capabilities.length
      || new Set(manifest.capabilities).size !== manifest.capabilities.length
      || manifest.capabilities.some(capability => !PLUGIN_CAPABILITIES.includes(capability))
      || !manifest.permissions
      || typeof manifest.permissions !== "object"
      || Array.isArray(manifest.permissions)
    ) {
      throw new DocFlowError(ERROR_CODES.PLUGIN_INVALID, `plugin manifest "${manifest.id || "unknown"}" is invalid`);
    }
    const permissionKeys = Object.keys(manifest.permissions);
    if (permissionKeys.some(key => !["networkHosts", "filesystem"].includes(key))) {
      throw new DocFlowError(ERROR_CODES.PLUGIN_INVALID, "plugin manifest permissions are invalid");
    }
    if (manifest.permissions.networkHosts != null && (
      !Array.isArray(manifest.permissions.networkHosts)
      || new Set(manifest.permissions.networkHosts).size !== manifest.permissions.networkHosts.length
      || manifest.permissions.networkHosts.some(host => typeof host !== "string" || host.length > 255)
    )) {
      throw new DocFlowError(ERROR_CODES.PLUGIN_INVALID, "plugin networkHosts permissions are invalid");
    }
    if (manifest.permissions.filesystem != null && (
      !Array.isArray(manifest.permissions.filesystem)
      || new Set(manifest.permissions.filesystem).size !== manifest.permissions.filesystem.length
      || manifest.permissions.filesystem.some(permission => !["read", "write"].includes(permission))
    )) {
      throw new DocFlowError(ERROR_CODES.PLUGIN_INVALID, "plugin filesystem permissions are invalid");
    }
    if (typeof pluginModule.activate !== "function") {
      throw new DocFlowError(ERROR_CODES.PLUGIN_INVALID, "plugin module must export activate(api)");
    }
    if (this.#plugins.has(manifest.id)) {
      throw new DocFlowError(ERROR_CODES.PLUGIN_INVALID, `plugin "${manifest.id}" is already installed`);
    }
    const capabilities = new Set(manifest.capabilities);
    const registeredBeforeActivation = new Map([
      [this.#dataSources, new Set(this.#dataSources.keys())],
      [this.#transforms, new Set(this.#transforms.keys())],
      [this.#formatters, new Set(this.#formatters.keys())],
      [this.#outputSinks, new Set(this.#outputSinks.keys())]
    ]);
    let activationOpen = true;
    const rollback = () => {
      for (const [collection, priorNames] of registeredBeforeActivation) {
        for (const name of collection.keys()) {
          if (!priorNames.has(name)) collection.delete(name);
        }
      }
    };
    const guarded = (capability, register) => (name, implementation) => {
      if (!activationOpen) {
        throw new DocFlowError(
          ERROR_CODES.PLUGIN_INVALID,
          `plugin "${manifest.id}" attempted registration after activate(api) returned`
        );
      }
      if (!capabilities.has(capability)) {
        throw new DocFlowError(
          ERROR_CODES.PLUGIN_INVALID,
          `plugin "${manifest.id}" did not declare capability "${capability}"`
        );
      }
      register.call(this, name, implementation);
    };
    const api = Object.freeze({
      apiVersion: PLUGIN_API_VERSION,
      registerDataSource: guarded("data-source", this.registerDataSource),
      registerTransform: guarded("transform", this.registerTransform),
      registerFormatter: guarded("formatter", this.registerFormatter),
      registerOutputSink: guarded("output-sink", this.registerOutputSink)
    });
    try {
      // Plugins execute in the host Node.js process and are trusted code.
      // Manifest permissions are descriptive declarations, not a sandbox.
      const result = pluginModule.activate(api, options);
      activationOpen = false;
      if (result && typeof result.then === "function") {
        result.catch(() => {});
        throw new Error("activate(api) must be synchronous");
      }
    } catch (error) {
      activationOpen = false;
      rollback();
      if (error instanceof DocFlowError) throw error;
      throw new DocFlowError(
        ERROR_CODES.PLUGIN_FAILED,
        `plugin "${manifest.id}" activation failed: ${error.message || String(error)}`,
        { cause: error }
      );
    }
    this.#plugins.set(manifest.id, Object.freeze({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      capabilities: Object.freeze([...manifest.capabilities]),
      permissions: Object.freeze({
        ...(manifest.permissions.networkHosts
          ? { networkHosts: Object.freeze([...manifest.permissions.networkHosts]) }
          : {}),
        ...(manifest.permissions.filesystem
          ? { filesystem: Object.freeze([...manifest.permissions.filesystem]) }
          : {})
      })
    }));
    return this;
  }

  getDataSource(name) {
    return this.#dataSources.get(normalizeName(name, "data-source"));
  }

  findDataSource(filename) {
    const lower = String(filename || "").toLowerCase();
    return [...this.#dataSources.entries()].find(([, source]) => (
      source.extensions.some(extension => lower.endsWith(extension))
    )) || null;
  }

  getTransform(name) {
    return this.#transforms.get(normalizeName(name, "transform"));
  }

  getFormatter(name) {
    return this.#formatters.get(normalizeName(name, "formatter"));
  }

  getOutputSink(name) {
    return this.#outputSinks.get(normalizeName(name, "output-sink"));
  }

  formatters() {
    return new Map(this.#formatters);
  }

  describe() {
    return Object.freeze({
      apiVersion: PLUGIN_API_VERSION,
      plugins: Object.freeze([...this.#plugins.values()]),
      dataSources: Object.freeze([...this.#dataSources.keys()]),
      transforms: Object.freeze([...this.#transforms.keys()]),
      formatters: Object.freeze([...this.#formatters.keys()]),
      outputSinks: Object.freeze([...this.#outputSinks.keys()])
    });
  }
}

function createPluginRegistry() {
  return new PluginRegistry();
}

module.exports = {
  PLUGIN_API_VERSION,
  PluginRegistry,
  createPluginRegistry
};
