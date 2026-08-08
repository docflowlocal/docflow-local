"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");
const { createLocalEngine } = require("./engine");

const TIMEOUT_MS = 15_000;

async function runPackagedSmoke() {
  if (!app.isPackaged) throw new Error("Release smoke must run from a packaged application");
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "docflow-packaged-smoke-"));
  app.setPath("userData", profile);
  let engine;
  try {
    await app.whenReady();
    engine = await createLocalEngine({
      staticDir: path.join(__dirname, "..", "static")
    });
    const headers = {
      "X-DocFlow-Token": engine.token,
      Origin: engine.origin
    };
    const health = await fetch(`${engine.origin}/api/health`, { headers });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);

    const form = new FormData();
    form.append("file", new Blob([
      JSON.stringify([{
        customer: "Packaged Smoke",
        items: [{ name: "Nested item", quantity: 1 }]
      }])
    ], { type: "application/json" }), "packaged-smoke.json");
    const imported = await fetch(`${engine.origin}/api/import`, {
      method: "POST",
      headers,
      body: form
    });
    assert.equal(imported.status, 200);
    const data = await imported.json();
    assert.deepEqual(data.headers, ["customer", "items"]);
    assert.deepEqual(data.rows[0].items, [{ name: "Nested item", quantity: 1 }]);

    const chineseFont = require.resolve(
      "@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff"
    );
    const fontStat = await fs.stat(chineseFont);
    assert(fontStat.isFile());
    assert(fontStat.size > 1_000_000);

    process.stdout.write(`DOCFLOW_PACKAGED_SMOKE_OK ${JSON.stringify({
      version: app.getVersion(),
      jsonImport: true,
      coreResolved: require.resolve("@docflow-local/core"),
      chinesePdfFontBytes: fontStat.size
    })}\n`);
  } finally {
    if (engine) await new Promise(resolve => engine.close(resolve));
    await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  let timer;
  try {
    await Promise.race([
      runPackagedSmoke(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Release smoke timed out after ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
      })
    ]);
    app.exit(0);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { main, runPackagedSmoke };
