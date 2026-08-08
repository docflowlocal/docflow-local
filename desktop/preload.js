const { contextBridge, ipcRenderer } = require("electron");

function transferableBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError("Output data must be an ArrayBuffer or typed array");
}

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function copyPresent(source, target, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = source[key];
  }
}

function projectManifestForIpc(value) {
  const source = plainObject(value, "Project manifest");
  const project = plainObject(source.project || {}, "Project metadata");
  const workflow = plainObject(source.workflow || {}, "Project workflow");
  const settings = plainObject(workflow.settings || {}, "Project settings");
  const safeManifest = {};
  copyPresent(source, safeManifest, ["format", "schemaVersion"]);
  safeManifest.project = {};
  copyPresent(project, safeManifest.project, ["id", "name", "createdAt", "updatedAt"]);
  safeManifest.workflow = {};
  copyPresent(workflow, safeManifest.workflow, [
    "expectedHeaders",
    "mappings",
    "requiredFields",
    "unconfirmedFields",
    "requiredOverrides",
    "computedFields",
    "conditionalFields",
    "templates"
  ]);
  safeManifest.workflow.settings = {};
  copyPresent(settings, safeManifest.workflow.settings, [
    "filenamePattern",
    "folderPattern",
    "skipBlank",
    "stopOnMissing",
    "validationReport",
    "includeSourceDocx",
    "mergePdfs",
    "flattenPdf"
  ]);
  if (source.privacy && typeof source.privacy === "object" && !Array.isArray(source.privacy)) {
    safeManifest.privacy = {};
    copyPresent(source.privacy, safeManifest.privacy, ["containsCustomerData", "excluded"]);
  }
  const serialized = JSON.stringify(safeManifest);
  if (Buffer.byteLength(serialized, "utf8") > 1024 * 1024) {
    throw new Error("Project configuration is too large");
  }
  return JSON.parse(serialized);
}

function projectSavePayload(value) {
  const source = plainObject(value, "Project save request");
  const templates = source.templates == null ? [] : source.templates;
  if (!Array.isArray(templates) || templates.length > 40) {
    throw new TypeError("Project template references are invalid");
  }
  const payload = {
    manifest: projectManifestForIpc(source.manifest),
    templates: templates.map((template, index) => {
      const entry = plainObject(template, `Project template ${index + 1}`);
      return {
        id: String(entry.id || ""),
        projectKey: String(entry.projectKey || ""),
        builtIn: entry.builtIn === true
      };
    })
  };
  if (source.projectToken != null) payload.projectToken = String(source.projectToken).slice(0, 128);
  if (source.suggestedName != null) payload.suggestedName = String(source.suggestedName).slice(0, 200);
  return payload;
}

function recentProjectId(value) {
  const id = String(value || "");
  if (!/^recent_[a-f0-9]{24}$/.test(id)) throw new TypeError("Recent project identifier is invalid");
  return id;
}

function stringArrayForIpc(value, label, maximum = 1000) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maximum) throw new TypeError(`${label} is invalid`);
  return value.map((item, index) => {
    if (typeof item !== "string") throw new TypeError(`${label}[${index}] must be a string`);
    return item;
  });
}

function copyTypedPresent(source, target, schema, label) {
  for (const [key, type] of Object.entries(schema)) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = source[key];
    const valid = type === "integer" ? Number.isSafeInteger(value) : typeof value === type;
    if (!valid) throw new TypeError(`${label}.${key} must be ${type === "integer" ? "an integer" : `a ${type}`}`);
    target[key] = value;
  }
}

function recipeMappingsForIpc(value) {
  if (value == null) return {};
  const source = plainObject(value, "Recipe mappings");
  const result = Object.create(null);
  const entries = Object.entries(source);
  if (entries.length > 1000) throw new TypeError("Recipe mappings are too large");
  for (const [target, mapping] of entries) {
    if (["__proto__", "prototype", "constructor"].includes(target)) {
      throw new TypeError("Recipe mapping contains a forbidden key");
    }
    if (typeof mapping === "string") {
      result[target] = mapping;
      continue;
    }
    const definition = plainObject(mapping, `Recipe mapping ${target}`);
    const safe = {};
    copyTypedPresent(
      definition,
      safe,
      { kind: "string", source: "string", expression: "string" },
      `Recipe mapping ${target}`
    );
    result[target] = safe;
  }
  return result;
}

function requiredOverridesForIpc(value) {
  if (value == null) return {};
  const source = plainObject(value, "Recipe required overrides");
  const result = Object.create(null);
  const entries = Object.entries(source);
  if (entries.length > 1000) throw new TypeError("Recipe required overrides are too large");
  for (const [field, required] of entries) {
    if (["__proto__", "prototype", "constructor"].includes(field)) {
      throw new TypeError("Recipe required overrides contain a forbidden key");
    }
    if (typeof required !== "boolean") throw new TypeError(`Recipe required override ${field} must be a boolean`);
    result[field] = required;
  }
  return result;
}

function recipeRulesForIpc(value, kind) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 200) throw new TypeError(`Recipe ${kind} rules are invalid`);
  return value.map((rule, index) => {
    const source = plainObject(rule, `Recipe ${kind} rule ${index + 1}`);
    const safe = {};
    copyTypedPresent(
      source,
      safe,
      kind === "computed"
        ? { name: "string", expression: "string", digits: "integer", scope: "string" }
        : { name: "string", expression: "string", scope: "string", whenTrue: "string", whenFalse: "string" },
      `Recipe ${kind} rule ${index + 1}`
    );
    return safe;
  });
}

function recipeTemplatesForIpc(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 40) throw new TypeError("Recipe template requirements are invalid");
  return value.map((template, index) => {
    const source = plainObject(template, `Recipe template requirement ${index + 1}`);
    const safe = {};
    copyTypedPresent(
      source,
      safe,
      {
        key: "string",
        kind: "string",
        builtInId: "string",
        description: "string",
        selected: "boolean",
        order: "integer"
      },
      `Recipe template requirement ${index + 1}`
    );
    safe.fields = stringArrayForIpc(source.fields, `Recipe template requirement ${index + 1} fields`);
    const assets = source.assetRequirements == null ? [] : source.assetRequirements;
    if (!Array.isArray(assets) || assets.length > 1000) {
      throw new TypeError(`Recipe template requirement ${index + 1} assets are invalid`);
    }
    safe.assetRequirements = assets.map((asset, assetIndex) => {
      const entry = plainObject(asset, `Recipe asset requirement ${index + 1}.${assetIndex + 1}`);
      const safeAsset = {};
      copyTypedPresent(
        entry,
        safeAsset,
        { kind: "string", field: "string", required: "boolean" },
        `Recipe asset requirement ${index + 1}.${assetIndex + 1}`
      );
      return safeAsset;
    });
    return safe;
  });
}

function projectRecipeForIpc(value) {
  const source = plainObject(value, "Project recipe");
  const workflow = plainObject(source.workflow || {}, "Project recipe workflow");
  const naming = plainObject(workflow.naming || {}, "Project recipe naming");
  if (source.scenario != null && typeof source.scenario !== "string") {
    throw new TypeError("Project recipe scenario must be a string");
  }
  const recipe = {
    scenario: source.scenario ?? "custom",
    workflow: {
      expectedHeaders: stringArrayForIpc(workflow.expectedHeaders, "Recipe expected headers"),
      mappings: recipeMappingsForIpc(workflow.mappings),
      requiredFields: stringArrayForIpc(workflow.requiredFields, "Recipe required fields"),
      unconfirmedFields: stringArrayForIpc(workflow.unconfirmedFields, "Recipe unconfirmed fields"),
      requiredOverrides: requiredOverridesForIpc(workflow.requiredOverrides),
      computedFields: recipeRulesForIpc(workflow.computedFields, "computed"),
      conditionalFields: recipeRulesForIpc(workflow.conditionalFields, "conditional"),
      naming: {},
      templateRequirements: recipeTemplatesForIpc(workflow.templateRequirements)
    }
  };
  copyTypedPresent(
    naming,
    recipe.workflow.naming,
    { filenamePattern: "string", folderPattern: "string" },
    "Project recipe naming"
  );
  const serialized = JSON.stringify(recipe);
  if (Buffer.byteLength(serialized, "utf8") > 512 * 1024) {
    throw new Error("Project recipe is too large");
  }
  return JSON.parse(serialized);
}

function activationProjectId(value) {
  if (typeof value !== "string" || !/^actprj_[a-f0-9]{32}$/.test(value)) {
    throw new TypeError("Activation project identifier is invalid");
  }
  return value;
}

function activationCreatePayload(value = {}) {
  const source = plainObject(value, "Activation project request");
  return { sampleOrigin: source.sampleOrigin === true };
}

function activationBatchPayload(value) {
  const source = plainObject(value, "Activation batch request");
  const digest = typeof source.dedupeDigest === "string" ? source.dedupeDigest.toLowerCase() : "";
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new TypeError("Activation batch digest is invalid");
  if (typeof source.real !== "boolean") throw new TypeError("Activation batch type is invalid");
  if (!["one", "two_or_more"].includes(source.templateCountBucket)) {
    throw new TypeError("Activation template-count bucket is invalid");
  }
  return {
    projectId: activationProjectId(source.projectId),
    real: source.real,
    dedupeDigest: digest,
    templateCountBucket: source.templateCountBucket
  };
}

function activationProgressPayload(value) {
  const source = plainObject(value, "Activation progress request");
  if (typeof source.event !== "string") throw new TypeError("Activation event is invalid");
  const payload = {
    projectId: activationProjectId(source.projectId),
    event: source.event
  };
  if (["preflight_passed", "artifact_generated", "package_saved"].includes(source.event)) {
    if (!Number.isSafeInteger(source.batchSequence) || source.batchSequence < 1) {
      throw new TypeError("Activation batch sequence is invalid");
    }
    payload.batchSequence = source.batchSequence;
  }
  if (source.event === "package_saved" && source.foregroundActiveSeconds != null) {
    if (!Number.isSafeInteger(source.foregroundActiveSeconds) || source.foregroundActiveSeconds < 0 || source.foregroundActiveSeconds > 86_400) {
      throw new TypeError("Activation foreground time is invalid");
    }
    payload.foregroundActiveSeconds = source.foregroundActiveSeconds;
  }
  if (source.event === "pro_feature_intent") {
    if (typeof source.feature !== "string") throw new TypeError("Activation Pro feature is invalid");
    payload.feature = source.feature;
  }
  return payload;
}

function exactCommercialPayload(value, allowedKeys, label) {
  const source = plainObject(value, label);
  const allowed = new Set(allowedKeys);
  if (Object.keys(source).some(key => !allowed.has(key))) {
    throw new TypeError(`${label} contains an unsupported field`);
  }
  return source;
}

function commercialToken(value, prefix, label) {
  if (typeof value !== "string" || !new RegExp(`^${prefix}_[A-Za-z0-9_-]{32}$`).test(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

function automationConfigTokenPayload(value) {
  const source = exactCommercialPayload(value, ["configToken"], "Automation request");
  return { configToken: commercialToken(source.configToken, "cfg", "Automation configuration token") };
}

function automationSchedulePayload(value) {
  const source = exactCommercialPayload(
    value,
    ["configToken", "everyMs", "runImmediately"],
    "Automation schedule request"
  );
  if (!Number.isSafeInteger(source.everyMs) || source.everyMs < 1000 || source.everyMs > 2678400000) {
    throw new TypeError("Automation schedule interval is invalid");
  }
  if (source.runImmediately !== undefined && typeof source.runImmediately !== "boolean") {
    throw new TypeError("Automation runImmediately value is invalid");
  }
  return {
    configToken: commercialToken(source.configToken, "cfg", "Automation configuration token"),
    everyMs: source.everyMs,
    ...(source.runImmediately === undefined ? {} : { runImmediately: source.runImmediately })
  };
}

function automationStopPayload(value, kind) {
  const source = exactCommercialPayload(value, ["runToken"], `Automation ${kind} stop request`);
  return {
    [`${kind}Token`]: commercialToken(source.runToken, kind, `Automation ${kind} token`)
  };
}

function automationHistoryPayload(value) {
  const source = exactCommercialPayload(value, ["configToken", "limit"], "Automation history request");
  const limit = source.limit === undefined ? 50 : source.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256) {
    throw new TypeError("Automation history limit is invalid");
  }
  return {
    configToken: commercialToken(source.configToken, "cfg", "Automation configuration token"),
    limit
  };
}

contextBridge.exposeInMainWorld("docflowDesktop", Object.freeze({
  isDesktop: true,
  platform: process.platform,
  versions: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome
  }),
  getLocale: () => ipcRenderer.invoke("docflow:get-locale"),
  setLocale: locale => ipcRenderer.invoke("docflow:set-locale", locale),
  getSessionToken: () => ipcRenderer.invoke("docflow:get-session-token"),
  saveOutput: (data, suggestedName) => ipcRenderer.invoke("docflow:save-output", {
    data: transferableBytes(data),
    suggestedName: String(suggestedName || "DocFlow-Package.zip")
  }),
  showRecentOutput: () => ipcRenderer.invoke("docflow:show-recent-output"),
  saveProject: payload => ipcRenderer.invoke("docflow:save-project", projectSavePayload(payload)),
  saveProjectAs: payload => ipcRenderer.invoke("docflow:save-project-as", projectSavePayload(payload)),
  openProject: () => ipcRenderer.invoke("docflow:open-project"),
  openRecentProject: id => ipcRenderer.invoke("docflow:open-recent-project", recentProjectId(id)),
  getRecentProjects: () => ipcRenderer.invoke("docflow:get-recent-projects"),
  previewProjectRecipe: payload => ipcRenderer.invoke("docflow:preview-project-recipe", projectRecipeForIpc(payload)),
  exportProjectRecipe: payload => ipcRenderer.invoke("docflow:export-project-recipe", projectRecipeForIpc(payload)),
  importProjectRecipe: () => ipcRenderer.invoke("docflow:import-project-recipe"),
  createActivationProject: payload => ipcRenderer.invoke("docflow:activation-create-project", activationCreatePayload(payload)),
  beginActivationBatch: payload => ipcRenderer.invoke("docflow:activation-begin-batch", activationBatchPayload(payload)),
  recordActivationProgress: payload => ipcRenderer.invoke("docflow:activation-record-progress", activationProgressPayload(payload)),
  getActivationSummary: () => ipcRenderer.invoke("docflow:activation-summary"),
  exportActivationSummary: () => ipcRenderer.invoke("docflow:activation-export-summary"),
  clearActivationLedger: () => ipcRenderer.invoke("docflow:activation-clear"),
  getCommercialState: () => ipcRenderer.invoke("docflow:commercial-state"),
  requestProTrial: () => ipcRenderer.invoke("docflow:commercial-request-trial"),
  importProLicense: () => ipcRenderer.invoke("docflow:commercial-import-license"),
  selectAutomationConfig: () => ipcRenderer.invoke("docflow:commercial-select-config"),
  runAutomationOnce: payload => ipcRenderer.invoke(
    "docflow:commercial-run-once",
    automationConfigTokenPayload(payload)
  ),
  startAutomationWatch: payload => ipcRenderer.invoke(
    "docflow:commercial-start-watch",
    automationConfigTokenPayload(payload)
  ),
  stopAutomationWatch: payload => ipcRenderer.invoke(
    "docflow:commercial-stop-watch",
    automationStopPayload(payload, "watch")
  ),
  startAutomationSchedule: payload => ipcRenderer.invoke(
    "docflow:commercial-start-schedule",
    automationSchedulePayload(payload)
  ),
  stopAutomationSchedule: payload => ipcRenderer.invoke(
    "docflow:commercial-stop-schedule",
    automationStopPayload(payload, "schedule")
  ),
  listAutomationRuns: () => ipcRenderer.invoke("docflow:commercial-list-runs"),
  getAutomationHistory: payload => ipcRenderer.invoke(
    "docflow:commercial-history",
    automationHistoryPayload(payload)
  )
}));
