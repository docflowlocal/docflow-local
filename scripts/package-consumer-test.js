/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Release test for the mixed-license transition repository. It does not change
 * the file-level licenses of the public packages that it packs and consumes.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "docflow-package-consumer-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const node = process.execPath;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.status !== 0) {
    const detail = options.capture
      ? `\nstdout:\n${result.stdout || ""}\nstderr:\n${result.stderr || ""}`
      : "";
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})${detail}`);
  }
  return result;
}

function pack(packagePath) {
  const packageDirectory = path.resolve(root, packagePath);
  const result = run(
    npm,
    ["pack", "--json", "--pack-destination", tempRoot, packageDirectory],
    { capture: true }
  );
  const report = JSON.parse(result.stdout);
  if (!Array.isArray(report) || !report[0]?.filename) {
    throw new Error(`npm pack returned an unexpected report for ${packagePath}`);
  }
  const files = report[0].files?.map((entry) => entry.path) || [];
  if (!files.some((entry) => /^LICENSE(?:\.|$)/i.test(entry))) {
    throw new Error(`${packagePath} tarball does not contain a LICENSE file`);
  }
  return path.join(tempRoot, report[0].filename);
}

try {
  const tarballs = [
    pack("packages/contracts"),
    pack("packages/core"),
    pack("packages/license-verifier"),
    pack("packages/desktop-extension-sdk")
  ];

  fs.writeFileSync(
    path.join(tempRoot, "package.json"),
    `${JSON.stringify({ name: "docflow-clean-room-consumer", version: "1.0.0", private: true }, null, 2)}\n`
  );

  run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs], {
    cwd: tempRoot
  });

  const cli = path.join(
    tempRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "docflow.cmd" : "docflow"
  );
  run(cli, ["--version"], { cwd: tempRoot });

  const data = path.join(root, "templates", "quotation", "sample.json");
  const template = path.join(root, "templates", "quotation", "starter.docx");
  const output = path.join(tempRoot, "generated");
  run(cli, ["inspect", "--template", template], { cwd: tempRoot });
  run(cli, ["validate", "--data", data, "--template", template], { cwd: tempRoot });
  run(
    cli,
    ["generate", "--data", data, "--template", template, "--output", output],
    { cwd: tempRoot }
  );

  const generated = fs.readdirSync(output, { recursive: true })
    .filter((entry) => String(entry).endsWith(".docx"));
  if (generated.length < 1) {
    throw new Error("Packed CLI did not generate a DOCX artifact");
  }

  run(node, [
    "-e",
    [
      "const verifier=require('@docflow-local/license-verifier');",
      "const sdk=require('@docflow-local/desktop-extension-sdk');",
      "if(!verifier || !sdk) process.exit(1);"
    ].join("")
  ], { cwd: tempRoot });

  console.log(`DOCFLOW_PACKAGE_CONSUMER_OK (${generated.length} DOCX artifacts)`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
