"use strict";

const crypto = require("crypto");
const { constants: FS_CONSTANTS } = require("fs");
const fs = require("fs/promises");
const path = require("path");
const {
  LIMITS,
  buildProjectArchive,
  parseProjectArchive
} = require("./project-format");

const RECENT_INDEX_SCHEMA_VERSION = 1;
const DEFAULT_MAX_RECENT_PROJECTS = 12;
const MAX_RECENT_INDEX_BYTES = 256 * 1024;
const RECENT_ID_PATTERN = /^recent_[a-f0-9]{24}$/;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertAbsoluteProjectPath(value, label = "project path") {
  if (typeof value !== "string" || !value || value.includes("\0") || !path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path`);
  }
  const resolved = path.resolve(value);
  if (path.extname(resolved).toLowerCase() !== ".docflow") {
    throw new Error(`${label} must end in .docflow`);
  }
  return resolved;
}

function ensureProjectExtension(value) {
  if (typeof value !== "string" || !value || value.includes("\0") || !path.isAbsolute(value)) {
    throw new Error("project path must be an absolute path");
  }
  const resolved = path.resolve(value);
  return path.extname(resolved).toLowerCase() === ".docflow"
    ? resolved
    : `${resolved}.docflow`;
}

function safeProjectFilename(value, fallback = "DocFlow-Project.docflow") {
  const normalizedFallback = path.basename(String(fallback || "DocFlow-Project.docflow"));
  const cleaned = path.basename(String(value || normalizedFallback))
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[ .]+|[ .]+$/g, "")
    .slice(0, 160);
  const base = cleaned || normalizedFallback || "DocFlow-Project.docflow";
  return base.toLowerCase().endsWith(".docflow") ? base : `${base}.docflow`;
}

function canonicalPathKey(value) {
  const normalized = path.resolve(value).normalize("NFC");
  return ["darwin", "win32"].includes(process.platform)
    ? normalized.toLocaleLowerCase("en-US")
    : normalized;
}

function recentIdForPath(value) {
  return `recent_${crypto.createHash("sha256").update(canonicalPathKey(value)).digest("hex").slice(0, 24)}`;
}

async function writeFileAtomically(destination, data, mode = 0o600) {
  const target = path.resolve(destination);
  const directory = path.dirname(target);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`
  );
  let handle = null;
  try {
    handle = await fs.open(temporary, "wx", mode);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, target);
    let directoryHandle = null;
    try {
      directoryHandle = await fs.open(directory, "r");
      await directoryHandle.sync();
    } catch (_error) {
      // Directory fsync is not supported on every platform/filesystem.
    } finally {
      await directoryHandle?.close().catch(() => {});
    }
  } catch (error) {
    await handle?.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
}

async function readRegularFile(filePath, maximumBytes, label) {
  const target = path.resolve(filePath);
  const noFollow = process.platform === "win32" ? 0 : (FS_CONSTANTS.O_NOFOLLOW || 0);
  let handle;
  try {
    handle = await fs.open(target, FS_CONSTANTS.O_RDONLY | noFollow);
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error(`${label} is not a regular file`);
    if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > maximumBytes) {
      throw new Error(`${label} size is outside the supported range`);
    }
    const data = await handle.readFile();
    if (data.length !== stat.size) throw new Error(`${label} changed while it was being read`);
    return data;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function publicRecentEntry(entry) {
  return Object.freeze({
    id: entry.id,
    filename: entry.filename,
    projectId: entry.projectId,
    projectName: entry.projectName,
    lastOpenedAt: entry.lastOpenedAt
  });
}

function normalizedRecentEntry(value) {
  if (!isPlainObject(value)) return null;
  let filePath;
  try {
    filePath = assertAbsoluteProjectPath(value.path, "recent project path");
  } catch (_error) {
    return null;
  }
  const expectedId = recentIdForPath(filePath);
  if (value.id !== expectedId || !RECENT_ID_PATTERN.test(value.id)) return null;
  if (typeof value.projectId !== "string" || value.projectId.length < 1 || value.projectId.length > 128) return null;
  if (typeof value.projectName !== "string" || value.projectName.length < 1 || Buffer.byteLength(value.projectName, "utf8") > 512) return null;
  if (typeof value.lastOpenedAt !== "string" || !Number.isFinite(Date.parse(value.lastOpenedAt))) return null;
  return {
    id: expectedId,
    path: filePath,
    filename: path.basename(filePath),
    projectId: value.projectId,
    projectName: value.projectName,
    lastOpenedAt: new Date(value.lastOpenedAt).toISOString()
  };
}

function normalizeTemplateReferences(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError("project templates must be an array");
  if (value.length > LIMITS.MAX_TEMPLATE_COUNT + 16) {
    throw new Error("project contains too many template references");
  }
  return value.filter(entry => entry?.builtIn !== true).map((entry, index) => {
    if (!isPlainObject(entry)) throw new TypeError(`project template ${index + 1} is invalid`);
    const id = String(entry.id || "");
    const projectKey = String(entry.projectKey || "");
    if (!/^template-[a-f0-9]{24}$/i.test(id)) {
      throw new Error(`project template ${index + 1} has an invalid runtime id`);
    }
    if (!/^[a-z0-9][a-z0-9._-]{7,79}$/i.test(projectKey)) {
      throw new Error(`project template ${index + 1} has an invalid project key`);
    }
    return { id, projectKey };
  });
}

function createProjectArchive(payload, exportTemplates) {
  if (!isPlainObject(payload) || !isPlainObject(payload.manifest)) {
    throw new TypeError("project save payload is invalid");
  }
  if (typeof exportTemplates !== "function") {
    throw new TypeError("exportTemplates must be a function");
  }
  const templateReferences = normalizeTemplateReferences(payload.templates);
  const templates = exportTemplates(templateReferences);
  const buffer = buildProjectArchive({ manifest: payload.manifest, templates });
  const parsed = parseProjectArchive(buffer);
  return Object.freeze({ buffer, manifest: parsed.manifest });
}

function createProjectIo({
  userDataDir,
  now = () => new Date(),
  maxRecentProjects = DEFAULT_MAX_RECENT_PROJECTS
} = {}) {
  if (typeof userDataDir !== "string" || !path.isAbsolute(userDataDir)) {
    throw new TypeError("userDataDir must be an absolute path");
  }
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (!Number.isSafeInteger(maxRecentProjects) || maxRecentProjects < 1 || maxRecentProjects > 100) {
    throw new TypeError("maxRecentProjects must be an integer between 1 and 100");
  }

  const recentIndexPath = path.join(path.resolve(userDataDir), "recent-projects.json");
  let indexQueue = Promise.resolve();

  function withIndexLock(operation) {
    const result = indexQueue.then(operation, operation);
    indexQueue = result.catch(() => {});
    return result;
  }

  async function readRecentIndex() {
    try {
      const source = (await readRegularFile(
        recentIndexPath,
        MAX_RECENT_INDEX_BYTES,
        "recent project index"
      )).toString("utf8");
      const parsed = JSON.parse(source);
      if (!isPlainObject(parsed) || parsed.schemaVersion !== RECENT_INDEX_SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
        return [];
      }
      const seen = new Set();
      return parsed.entries.map(normalizedRecentEntry).filter(entry => {
        if (!entry || seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      }).slice(0, maxRecentProjects);
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      return [];
    }
  }

  async function writeRecentIndex(entries) {
    const body = Buffer.from(`${JSON.stringify({
      schemaVersion: RECENT_INDEX_SCHEMA_VERSION,
      entries: entries.slice(0, maxRecentProjects)
    }, null, 2)}\n`, "utf8");
    if (body.length > MAX_RECENT_INDEX_BYTES) throw new Error("recent project index is too large");
    await writeFileAtomically(recentIndexPath, body);
  }

  async function pathIsReadableProject(filePath) {
    try {
      const stat = await fs.lstat(filePath);
      return stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= LIMITS.MAX_ARCHIVE_BYTES;
    } catch (_error) {
      return false;
    }
  }

  async function rememberProject(filePath, manifest) {
    const target = assertAbsoluteProjectPath(filePath);
    if (!isPlainObject(manifest?.project)) throw new TypeError("project manifest metadata is invalid");
    const projectId = String(manifest.project.id || "");
    const projectName = String(manifest.project.name || "");
    if (!projectId || projectId.length > 128 || !projectName || Buffer.byteLength(projectName, "utf8") > 512) {
      throw new TypeError("project manifest metadata is invalid");
    }
    const timestamp = now();
    const lastOpenedAt = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
    if (!Number.isFinite(Date.parse(lastOpenedAt))) throw new TypeError("now returned an invalid timestamp");
    const entry = {
      id: recentIdForPath(target),
      path: target,
      filename: path.basename(target),
      projectId,
      projectName,
      lastOpenedAt
    };
    return withIndexLock(async () => {
      const entries = await readRecentIndex();
      const updated = [entry, ...entries.filter(item => item.id !== entry.id)]
        .slice(0, maxRecentProjects);
      await writeRecentIndex(updated);
      return publicRecentEntry(entry);
    });
  }

  async function listRecentProjects() {
    return withIndexLock(async () => {
      const entries = await readRecentIndex();
      const availability = await Promise.all(entries.map(entry => pathIsReadableProject(entry.path)));
      const available = entries.filter((_entry, index) => availability[index]);
      if (available.length !== entries.length) await writeRecentIndex(available);
      return available.map(publicRecentEntry);
    });
  }

  async function resolveRecentProject(recentId) {
    if (typeof recentId !== "string" || !RECENT_ID_PATTERN.test(recentId)) return null;
    return withIndexLock(async () => {
      const entries = await readRecentIndex();
      const entry = entries.find(item => item.id === recentId);
      if (!entry) return null;
      if (await pathIsReadableProject(entry.path)) return entry.path;
      await writeRecentIndex(entries.filter(item => item.id !== recentId));
      return null;
    });
  }

  async function readProjectFile(filePath) {
    const target = assertAbsoluteProjectPath(filePath);
    const buffer = await readRegularFile(target, LIMITS.MAX_ARCHIVE_BYTES, "project file");
    return parseProjectArchive(buffer);
  }

  async function writeProjectFile(filePath, archiveBuffer) {
    const target = ensureProjectExtension(filePath);
    const buffer = Buffer.from(archiveBuffer || []);
    if (!buffer.length || buffer.length > LIMITS.MAX_ARCHIVE_BYTES) {
      throw new Error("project archive size is outside the supported range");
    }
    const parsed = parseProjectArchive(buffer);
    await writeFileAtomically(target, buffer);
    return Object.freeze({ filePath: target, manifest: parsed.manifest });
  }

  return Object.freeze({
    createArchive: (payload, exportTemplates) => createProjectArchive(payload, exportTemplates),
    listRecentProjects,
    readProjectFile,
    rememberProject,
    resolveRecentProject,
    writeProjectFile
  });
}

module.exports = Object.freeze({
  DEFAULT_MAX_RECENT_PROJECTS,
  MAX_RECENT_INDEX_BYTES,
  RECENT_INDEX_SCHEMA_VERSION,
  assertAbsoluteProjectPath,
  createProjectArchive,
  createProjectIo,
  ensureProjectExtension,
  recentIdForPath,
  safeProjectFilename,
  writeFileAtomically
});
