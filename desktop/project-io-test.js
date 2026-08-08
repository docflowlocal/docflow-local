"use strict";

const assert = require("assert");
const fs = require("fs/promises");
const Module = require("module");
const os = require("os");
const path = require("path");
const {
  createProjectIo,
  recentIdForPath,
  safeProjectFilename
} = require("./project-io");

function manifest(name = "Trade quotation workflow") {
  return {
    schemaVersion: 1,
    project: { name },
    workflow: {
      expectedHeaders: ["Customer Name", "Quote Number"],
      mappings: {
        customer: "Customer Name",
        quote: "Quote Number"
      },
      requiredFields: ["customer", "quote"],
      templates: [
        { projectKey: "builtin.quote", builtIn: true, selected: true, order: 0 }
      ],
      settings: {
        filenamePattern: "{{customer}}-{{quote}}",
        folderPattern: "{{customer}}",
        stopOnMissing: true,
        signature: "must-not-be-saved"
      },
      rows: [{ customer: "Secret Customer" }]
    }
  };
}

function loadPreloadApi() {
  const originalLoad = Module._load;
  const calls = [];
  let api = null;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") {
      return {
        contextBridge: {
          exposeInMainWorld(name, value) {
            assert.strictEqual(name, "docflowDesktop");
            api = value;
          }
        },
        ipcRenderer: {
          invoke(...args) {
            calls.push(args);
            return Promise.resolve({ ok: true });
          }
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  const preloadPath = require.resolve("./preload");
  delete require.cache[preloadPath];
  try {
    require(preloadPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[preloadPath];
  }
  return { api, calls };
}

async function testMinimalPreloadProjectApi() {
  const { api, calls } = loadPreloadApi();
  assert(api);
  await api.saveProject({
    manifest: {
      ...manifest(),
      workflow: {
        ...manifest().workflow,
        sourceRows: [2],
        signature: "renderer-secret",
        assets: { secret: "renderer-secret" },
        settings: {
          ...manifest().workflow.settings,
          assets: { secret: "renderer-secret" }
        }
      },
      rows: [{ customer: "Secret Customer" }]
    },
    templates: [{ projectKey: "builtin.quote", builtIn: true }],
    suggestedName: "Quotation"
  });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0][0], "docflow:save-project");
  const safePayload = calls[0][1];
  assert(!Object.prototype.hasOwnProperty.call(safePayload.manifest, "rows"));
  assert(!Object.prototype.hasOwnProperty.call(safePayload.manifest.workflow, "sourceRows"));
  assert(!Object.prototype.hasOwnProperty.call(safePayload.manifest.workflow, "signature"));
  assert(!Object.prototype.hasOwnProperty.call(safePayload.manifest.workflow.settings, "assets"));
  assert.deepStrictEqual(safePayload.templates, [{ id: "", projectKey: "builtin.quote", builtIn: true }]);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(api, "readFile"), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(api, "writeFile"), false);
  assert.throws(() => api.openRecentProject("../../customer.docflow"), /identifier is invalid/);
}

async function run() {
  await testMinimalPreloadProjectApi();
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docflow-project-io-"));
  try {
    const userDataDir = path.join(temporaryRoot, "user-data");
    const projectDir = path.join(temporaryRoot, "projects");
    await fs.mkdir(projectDir, { recursive: true });
    let clock = Date.parse("2026-08-08T01:00:00.000Z");
    const projectIo = createProjectIo({
      userDataDir,
      now: () => new Date(clock)
    });

    assert.strictEqual(safeProjectFilename("../Customer: Quote"), "Customer- Quote.docflow");
    assert.strictEqual(safeProjectFilename("already.docflow"), "already.docflow");

    let exportedReferences = null;
    const archive = projectIo.createArchive({
      manifest: manifest(),
      templates: [{ projectKey: "builtin.quote", builtIn: true }]
    }, references => {
      exportedReferences = references;
      return [];
    });
    assert.deepStrictEqual(exportedReferences, []);
    assert.strictEqual(archive.manifest.project.name, "Trade quotation workflow");
    assert(!Object.prototype.hasOwnProperty.call(archive.manifest.workflow, "rows"));
    assert(!Object.prototype.hasOwnProperty.call(archive.manifest.workflow.settings, "signature"));

    const requestedPath = path.join(projectDir, "quotation");
    const saved = await projectIo.writeProjectFile(requestedPath, archive.buffer);
    assert.strictEqual(saved.filePath, `${requestedPath}.docflow`);
    assert.strictEqual(saved.manifest.project.id, archive.manifest.project.id);
    const stat = await fs.stat(saved.filePath);
    assert(stat.isFile());
    if (process.platform !== "win32") assert.strictEqual(stat.mode & 0o077, 0);

    const remembered = await projectIo.rememberProject(saved.filePath, saved.manifest);
    assert.strictEqual(remembered.id, recentIdForPath(saved.filePath));
    assert.strictEqual(Object.prototype.hasOwnProperty.call(remembered, "path"), false);
    assert.strictEqual(remembered.projectName, "Trade quotation workflow");

    const restarted = createProjectIo({ userDataDir });
    const restored = await restarted.listRecentProjects();
    assert.strictEqual(restored.length, 1);
    assert.deepStrictEqual(
      Object.keys(restored[0]).sort(),
      ["filename", "id", "lastOpenedAt", "projectId", "projectName"]
    );
    assert.strictEqual(await restarted.resolveRecentProject(restored[0].id), saved.filePath);

    const opened = await restarted.readProjectFile(saved.filePath);
    assert.strictEqual(opened.manifest.project.name, "Trade quotation workflow");
    assert.strictEqual(opened.templates.length, 0);

    clock += 60_000;
    const replacementArchive = projectIo.createArchive({
      manifest: {
        ...manifest("Renamed workflow"),
        project: {
          ...manifest("Renamed workflow").project,
          id: saved.manifest.project.id
        }
      },
      templates: []
    }, () => []);
    await projectIo.writeProjectFile(saved.filePath, replacementArchive.buffer);
    const replaced = await projectIo.readProjectFile(saved.filePath);
    assert.strictEqual(replaced.manifest.project.name, "Renamed workflow");
    const temporaryArtifacts = (await fs.readdir(projectDir)).filter(name => name.endsWith(".tmp"));
    assert.deepStrictEqual(temporaryArtifacts, []);

    if (process.platform !== "win32") {
      const symlinkPath = path.join(projectDir, "linked.docflow");
      await fs.symlink(saved.filePath, symlinkPath);
      await assert.rejects(
        () => projectIo.readProjectFile(symlinkPath),
        error => ["ELOOP", "EMLINK"].includes(error.code) || /regular file|symbolic link/i.test(error.message)
      );
    }

    await fs.unlink(saved.filePath);
    assert.deepStrictEqual(await restarted.listRecentProjects(), []);
    assert.strictEqual(await restarted.resolveRecentProject(restored[0].id), null);

    assert.throws(
      () => projectIo.createArchive({
        manifest: manifest(),
        templates: [{ projectKey: "custom.contract", id: "runtime-from-renderer" }]
      }, () => []),
      /invalid runtime id/
    );

    process.stdout.write("project I/O tests passed\n");
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
