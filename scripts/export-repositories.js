#!/usr/bin/env node
"use strict";

// SPDX-License-Identifier: MPL-2.0

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TOOL_NAME = "docflow-repository-export";
const TOOL_VERSION = 1;
const MANIFEST_FILENAME = "export-manifest.json";
const SOURCE_ROOT = path.resolve(__dirname, "..");
const PUBLIC_PACKAGE_BOOTSTRAP_REF =
  "d49835883200da227d643745d5a46dec0807f338";
const FORBIDDEN_DIRECTORY_NAMES = Object.freeze([
  ".git",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
  "work"
]);
const FORBIDDEN_SECRET_BASENAMES = new Set([
  ".dev.vars",
  ".npmrc",
  "credentials.json",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "id_rsa",
  "notary-profile.json",
  "private-key.json",
  "secrets.json",
  "service-account.json"
]);
const FORBIDDEN_SECRET_EXTENSIONS = new Set([
  ".jks",
  ".key",
  ".keystore",
  ".mobileprovision",
  ".p12",
  ".pem",
  ".pfx"
]);
const SECRET_CONTENT_PATTERNS = Object.freeze([
  /-----BEGIN (?:DSA |EC |OPENSSH |RSA )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/
]);
const COMMON_METADATA = Object.freeze([
  ".gitattributes",
  ".gitignore",
  "CHANGELOG.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "TRADEMARKS.md"
]);

class RepositoryExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RepositoryExportError";
    this.code = code;
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function normalizedMode(stats) {
  return stats.mode & 0o111 ? "0755" : "0644";
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function posixPath(...parts) {
  return parts
    .filter(part => part != null && String(part) !== "" && String(part) !== ".")
    .map(part => String(part).replaceAll("\\", "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function assertRelativePath(value, label) {
  const candidate = String(value || "").replaceAll("\\", "/");
  const normalized = path.posix.normalize(candidate);
  if (
    !candidate
    || candidate.includes("\0")
    || path.posix.isAbsolute(candidate)
    || normalized === ".."
    || normalized.startsWith("../")
  ) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_PATH_INVALID",
      `${label} must stay inside the public source or export root: ${value}`
    );
  }
  return normalized.replace(/^\.\//, "");
}

function resolveSourcePath(sourceRoot, relativePath) {
  const safeRelative = assertRelativePath(relativePath, "Source path");
  const root = path.resolve(sourceRoot);
  const resolved = path.resolve(root, ...safeRelative.split("/"));
  if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) return resolved;
  throw new RepositoryExportError(
    "DOCFLOW_EXPORT_PATH_INVALID",
    `Source path escapes the public repository: ${relativePath}`
  );
}

function secretPathReason(relativePath) {
  const normalized = String(relativePath).replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  const basename = String(parts.at(-1) || "").toLowerCase();
  if (parts.some(part => part.toLowerCase() === "docflow-pro")) {
    return "private Pro path";
  }
  if (
    (basename === ".env" || basename.startsWith(".env."))
    && ![".env.example", ".env.sample"].includes(basename)
  ) {
    return "environment secret file";
  }
  if (FORBIDDEN_SECRET_BASENAMES.has(basename)) return "credential or signing file";
  if (FORBIDDEN_SECRET_EXTENSIONS.has(path.extname(basename))) return "private key or signing file";
  return "";
}

function assertNoSecretContent(bytes, relativePath) {
  const text = bytes.toString("utf8");
  if (SECRET_CONTENT_PATTERNS.some(pattern => pattern.test(text))) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_SECRET",
      `Refusing to export secret-like content from ${relativePath}`
    );
  }
}

function assertPublishablePackageDependencies(bytes, relativePath) {
  let packageJson;
  try {
    packageJson = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_PACKAGE_INVALID",
      `Invalid package metadata in ${relativePath}: ${error.message}`
    );
  }
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies"
  ]) {
    for (const [packageName, rawSpecifier] of Object.entries(packageJson[field] || {})) {
      const specifier = String(rawSpecifier);
      if (/^(?:file:|link:|workspace:|\.{1,2}[\\/])/i.test(specifier)) {
        throw new RepositoryExportError(
          "DOCFLOW_EXPORT_DEPENDENCY_LOCAL",
          `${relativePath}: ${field}.${packageName} must use a publishable version, not ${specifier}`
        );
      }
    }
  }
  return packageJson;
}

function sourceEntry(source, target = source, options = {}) {
  return Object.freeze({ source, target, ...options });
}

function generatedEntry(target, sourceLabel, generate) {
  return Object.freeze({ target, sourceLabel, generate });
}

async function readJson(filename) {
  return JSON.parse(await fs.promises.readFile(filename, "utf8"));
}

function repositoryLocationMetadata(packageJson, repositoryName) {
  return {
    ...packageJson,
    homepage: `https://github.com/docflowlocal/${repositoryName}#readme`,
    repository: {
      type: "git",
      url: `https://github.com/docflowlocal/${repositoryName}.git`
    },
    bugs: {
      url: `https://github.com/docflowlocal/${repositoryName}/issues`
    }
  };
}

async function generatedRepositoryPackage(sourceRoot, sourcePath, repositoryName, transform) {
  const sourcePackage = await readJson(path.join(sourceRoot, ...sourcePath.split("/")));
  const located = repositoryLocationMetadata(sourcePackage, repositoryName);
  return Buffer.from(canonicalJson(transform ? await transform(located, sourceRoot) : located));
}

async function withExactPublicDependencies(packageJson, sourceRoot, directories) {
  const packageManifests = await Promise.all(
    directories.map(directory => (
      readJson(path.join(sourceRoot, "packages", directory, "package.json"))
    ))
  );
  return {
    ...packageJson,
    dependencies: {
      ...(packageJson.dependencies || {}),
      ...Object.fromEntries(packageManifests.map(manifest => [
        manifest.name,
        manifest.version
      ]))
    }
  };
}

async function rewrittenSource(sourceRoot, sourcePath, transform) {
  const source = await fs.promises.readFile(
    path.join(sourceRoot, ...sourcePath.split("/")),
    "utf8"
  );
  return Buffer.from(transform(source));
}

function npmTarballName(packageJson) {
  return `${packageJson.name.replace(/^@/, "").replace("/", "-")}-${packageJson.version}.tgz`;
}

async function generatedCiWorkflow(sourceRoot, repositoryName) {
  const header = [
    "name: CI",
    "",
    "on:",
    "  push:",
    "    branches: [main]",
    "  pull_request:",
    "",
    "permissions:",
    "  contents: read",
    ""
  ];
  if (repositoryName === "docflow") {
    return Buffer.from(`${[
      ...header,
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "        with:",
      "          fetch-depth: 0",
      "      - uses: actions/setup-node@v7",
      "        with:",
      "          node-version: 22",
      "      - run: npm install --ignore-scripts --package-lock=true",
      "      - run: npm audit --audit-level=high",
      "      - run: npm test",
      "      - run: npm run test:licenses"
    ].join("\n")}\n`);
  }
  if (repositoryName === "docs") {
    return Buffer.from(`${[
      ...header,
      "jobs:",
      "  documentation:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v7",
      "      - uses: actions/setup-node@v7",
      "        with:",
      "          node-version: 22",
      "      - run: npm test"
    ].join("\n")}\n`);
  }

  const packageDirectories = repositoryName === "docflow-desktop"
    ? ["contracts", "core", "license-verifier"]
    : ["contracts", "core"];
  const tarballs = [];
  for (const directory of packageDirectories) {
    const packageJson = await readJson(
      path.join(sourceRoot, "packages", directory, "package.json")
    );
    tarballs.push({
      directory,
      filename: npmTarballName(packageJson),
      name: packageJson.name,
      version: packageJson.version
    });
  }
  const targetCommands = {
    "docflow-desktop": [
      "npm run test:syntax",
      "npm test",
      "npm run test:api",
      "npm run test:release"
    ],
    templates: ["npm test"],
    plugins: ["npm test"],
    examples: ["npm test"]
  }[repositoryName];
  if (!targetCommands) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_CI_UNKNOWN",
      `No CI workflow is defined for ${repositoryName}`
    );
  }
  const packCommands = tarballs.map(({ directory }) => (
    `          npm pack ./packages/${directory} --ignore-scripts --pack-destination "$RUNNER_TEMP/docflow-packages"`
  ));
  const installTarballs = tarballs.map(({ filename }) => (
    `"$RUNNER_TEMP/docflow-packages/${filename}"`
  )).join(" ");
  const expectedDependencies = Object.fromEntries(
    tarballs.map(({ name, version }) => [name, version])
  );
  const dependencyCheckSource = [
    `const expected=${JSON.stringify(expectedDependencies)};`,
    'const packageJson=require("./package.json");',
    "for(const [name,version] of Object.entries(expected)){",
    "const actual=packageJson.dependencies?.[name];",
    "if(actual!==version){",
    'throw new Error(name+" must equal reviewed package version "+version+" (found "+actual+")");',
    "}",
    "}"
  ].join("");
  const dependencyCheckCommand = `node -e ${JSON.stringify(dependencyCheckSource)}`;
  const desktopMatrix = repositoryName === "docflow-desktop"
    ? [
        "  committed-lock:",
        "    name: Committed lock (${{ matrix.os }})",
        "    strategy:",
        "      fail-fast: false",
        "      matrix:",
        "        os: [ubuntu-latest, macos-latest, windows-latest]",
        "    runs-on: ${{ matrix.os }}",
        "    steps:",
        "      - uses: actions/checkout@v7",
        "      - uses: actions/setup-node@v7",
        "        if: ${{ hashFiles('package-lock.json') != '' }}",
        "        with:",
        "          node-version: 22",
        "      - name: Validate release lock",
        "        if: ${{ hashFiles('package-lock.json') != '' }}",
        "        run: node scripts/release-readiness.js --lockfile-only",
        "      - name: Install committed lock without lifecycle scripts",
        "        if: ${{ hashFiles('package-lock.json') != '' }}",
        "        run: npm ci --ignore-scripts",
        "      - name: Verify installed dependency tree",
        "        if: ${{ hashFiles('package-lock.json') != '' }}",
        "        run: npm ls --all",
        "      - name: Audit production and build dependencies",
        "        if: ${{ hashFiles('package-lock.json') != '' }}",
        "        run: npm audit --audit-level=high",
        ...targetCommands.flatMap(command => [
          `      - run: ${command}`,
          "        if: ${{ hashFiles('package-lock.json') != '' }}"
        ])
      ]
    : [];
  const bootstrapIf = repositoryName === "docflow-desktop"
    ? ["        if: ${{ hashFiles('project/package-lock.json') == '' }}"]
    : [];
  return Buffer.from(`${[
    ...header,
    "jobs:",
    ...desktopMatrix,
    "  bootstrap:",
    "    runs-on: ubuntu-latest",
    "    steps:",
      "      - uses: actions/checkout@v7",
    "        with:",
    "          path: project",
    "      - name: Check out reviewed DocFlow packages",
    ...bootstrapIf,
    "        uses: actions/checkout@v7",
    "        with:",
    "          repository: docflowlocal/docflow",
    `          ref: ${PUBLIC_PACKAGE_BOOTSTRAP_REF}`,
    "          path: docflow-source",
    "          persist-credentials: false",
    "      - uses: actions/setup-node@v7",
    ...bootstrapIf,
    "        with:",
    "          node-version: 22",
    "      - name: Pack reviewed public dependencies",
    ...bootstrapIf,
    "        working-directory: docflow-source",
    "        run: |",
    "          mkdir -p \"$RUNNER_TEMP/docflow-packages\"",
    ...packCommands,
    "      - name: Verify reviewed dependency versions",
    ...bootstrapIf,
    "        working-directory: project",
    `        run: ${dependencyCheckCommand}`,
    "      - name: Install dependencies from reviewed tarballs",
    ...bootstrapIf,
    "        working-directory: project",
    `        run: npm install --ignore-scripts --save-exact --package-lock=true ${installTarballs}`,
    "      - name: Verify installed dependency tree",
    ...bootstrapIf,
    "        working-directory: project",
    "        run: npm ls --all",
    "      - name: Audit production and build dependencies",
    ...bootstrapIf,
    "        run: npm audit --audit-level=high",
    "        working-directory: project",
    "      - name: Restore reviewed package metadata",
    ...bootstrapIf,
    "        working-directory: project",
    "        run: |",
    "          git checkout -- package.json",
    "          rm -f package-lock.json",
    ...targetCommands.flatMap(command => [
      `      - run: ${command}`,
      ...bootstrapIf,
      "        working-directory: project"
    ])
  ].join("\n")}\n`);
}

function ciWorkflowEntry(repositoryName) {
  return generatedEntry(
    ".github/workflows/ci.yml",
    `generated:${repositoryName}/.github/workflows/ci.yml`,
    sourceRoot => generatedCiWorkflow(sourceRoot, repositoryName)
  );
}

function commonMetadataEntries(repositoryName) {
  const metadata = COMMON_METADATA.map(filename => {
    if (filename !== "CONTRIBUTING.md") return sourceEntry(filename);
    return generatedEntry(
      filename,
      `generated:${repositoryName}/${filename}`,
      sourceRoot => rewrittenSource(sourceRoot, filename, source => {
        const commands = {
          docflow: "npm install\nnpm test\nnpm run test:licenses",
          "docflow-desktop": "npm install\nnpm run test:syntax\nnpm test\nnpm run desktop:debug",
          templates: "npm install\nnpm test",
          plugins: "npm install\nnpm test",
          examples: "npm install\nnpm test",
          docs: "npm test"
        };
        const development = repositoryName === "docs"
          ? `## Development\n\n${commands[repositoryName]}`
          : `## Development\n\n\`\`\`bash\n${commands[repositoryName]}\n\`\`\``;
        return source
          .replace(/## Development\n\n```bash\n[\s\S]*?```/, development)
          .replace(
            /`templates\/NOTICE\.md`/g,
            "`https://github.com/docflowlocal/templates/blob/main/NOTICE.md`"
          );
      })
    );
  });
  return [...metadata, ciWorkflowEntry(repositoryName)];
}

function generatedNotice(repositoryName) {
  const notices = {
    "docflow-desktop": `# License and distribution notice

The historical DocFlow Local desktop source in this repository is licensed
under GNU AGPL-3.0-or-later. The complete terms are in [LICENSE](LICENSE).

The separately published DocFlow Core and license-verifier dependencies retain
the license declarations and notices in their own packages. The complete
MPL-2.0 text bundled for applicable notices is in
[LICENSES/MPL-2.0.txt](LICENSES/MPL-2.0.txt). Starter templates are maintained
in the [templates repository](https://github.com/docflowlocal/templates) and
are not included in this source tree.

No private Pro source, customer material, license payload, signing key, or
commercial build log is included. Trademark rights are described in
[TRADEMARKS.md](TRADEMARKS.md).
`,
    plugins: `# License and distribution notice

Source code in this repository is licensed under MPL-2.0 as declared by the
package and source SPDX identifiers. The complete terms are in
[LICENSE](LICENSE). Third-party dependencies retain their own terms.

No private Pro source, customer material, credentials, or signing keys are
included. Trademark rights are described in [TRADEMARKS.md](TRADEMARKS.md).
`,
    examples: `# License and distribution notice

Source code in this repository is licensed under MPL-2.0 as declared by the
package and source SPDX identifiers. The complete terms are in
[LICENSE](LICENSE). Example data is synthetic, and third-party dependencies
retain their own terms.

No private Pro source, customer material, credentials, or signing keys are
included. Trademark rights are described in [TRADEMARKS.md](TRADEMARKS.md).
`,
    docs: `# License and distribution notice

These public documentation sources retain the transition repository's
AGPL-3.0-or-later default unless a file states otherwise. The complete terms
are in [LICENSE](LICENSE). This notice does not change the separate licenses
of DocFlow code, starter templates, plugins, or examples.

No private Pro source, customer material, credentials, or signing keys are
included. Trademark rights are described in [TRADEMARKS.md](TRADEMARKS.md).
`
  };
  return Buffer.from(notices[repositoryName]);
}

function rewriteDesktopDocument(sourcePath, source) {
  let rewritten = source;
  if (sourcePath === "README.md") {
    rewritten = rewritten.replace(
      /On macOS you can also double-click `启动 DocFlow\.command`\.[\s\S]*?prototype\.\n\n/,
      ""
    );
    rewritten += `
## Split repository bootstrap (maintainers only)

This source export intentionally excludes the transition monorepo lockfile.
After the exact Core and license-verifier versions in \`package.json\` have been
published, create the first standalone lockfile with:

\`\`\`bash
npm install --package-lock-only --ignore-scripts
npm ci
npm run test:release
\`\`\`

Review and commit that lockfile before any build. Do not copy the transition
lockfile: public release checks reject workspace, \`file:\`, and linked Core or
verifier resolutions.
`;
  } else if (sourcePath === "README.zh-CN.md") {
    rewritten = rewritten.replace(
      /macOS 也可以双击 `启动 DocFlow\.command`，[\s\S]*?原型。\n\n/,
      ""
    );
    rewritten += `
## 拆仓首次初始化（仅维护者）

此源码导出会刻意排除过渡单仓的锁文件。请先发布 \`package.json\` 中指定的
Core 与 license-verifier 精确版本，再创建独立 Desktop 锁文件：

\`\`\`bash
npm install --package-lock-only --ignore-scripts
npm ci
npm run test:release
\`\`\`

构建前必须审查并提交该锁文件。不要复制过渡单仓的锁文件；公开发布门禁会
拒绝 workspace、\`file:\` 以及本地链接的 Core/Verifier 解析。
`;
  } else if (sourcePath === "DESKTOP_BUILD.md") {
    rewritten = rewritten
      .replace(
        /macOS 可双击项目根目录的 `启动 DocFlow\.command`，[\s\S]*?reportlab。\n\n/,
        ""
      )
      .replace(/^npm run test:core\nnpm run test:packages\n/m, "")
      .replace(
        /`test:packages` 会把四个公开包打成真实 npm tarball，[\s\S]*?tarball。\n\n/,
        "Core and verifier package tests run in the separate `docflow` repository; this repository tests the exact published dependency versions consumed by Desktop.\n\n"
      );
    rewritten += `
## 拆仓锁文件初始化

导出的独立 Desktop 仓库不包含过渡单仓锁文件。维护者必须先发布精确版本的
Core/Verifier，再运行 \`npm install --package-lock-only --ignore-scripts\`，
审查并提交新锁文件；此后安装和 CI 统一使用 \`npm ci\`。公开发布门禁会拒绝
缺失、陈旧、workspace 或本地链接的锁文件。
`;
  } else if (sourcePath === "RELEASE_CHECKLIST.md") {
    rewritten = rewritten.replace(
      /\[`docs\/core-relicensing-clean-room-plan\.md`\]\(docs\/core-relicensing-clean-room-plan\.md\)/,
      "[the Core clean-room plan](https://github.com/docflowlocal/docflow/blob/main/docs/core-relicensing-clean-room-plan.md)"
    );
    rewritten += `
## Split Desktop lockfile

After publishing the exact Core and verifier versions, bootstrap the standalone
Desktop lockfile with \`npm install --package-lock-only --ignore-scripts\`,
review and commit it, then use \`npm ci\`. Never copy the transition workspace
lockfile into this repository.
`;
  }
  return rewritten;
}

function rewriteCleanRoomPlan(source, repositoryName) {
  const baseline = repositoryName === "docflow"
    ? "```bash\nnpm run test:licenses\nnpm test\n```"
    : "```bash\n# Run in a checkout of https://github.com/docflowlocal/docflow\nnode scripts/check-license-boundaries.js --exported-source\nnpm test\n```";
  let rewritten = source.replace(
    /```bash\nnpm run test:licenses\nnpm --prefix packages\/core run test:syntax[\s\S]*?npm run test:packages\n```/,
    baseline
  );
  if (repositoryName === "docs") {
    rewritten = rewritten.replace(
      /```bash\nnpm run test:licenses\n```/g,
      "```bash\n# Run in a checkout of https://github.com/docflowlocal/docflow\nnode scripts/check-license-boundaries.js --exported-source\n```"
    );
  }
  return rewritten;
}

function generatedDesktopLicenseTest(sourceRoot) {
  return rewrittenSource(
    sourceRoot,
    "packages/license-verifier/test/license.test.js",
    source => source
      .replace('require("../src/license")', 'require("@docflow-local/license-verifier/license")')
      .replace(
        'require("../src/feature-policy")',
        'require("@docflow-local/license-verifier/feature-policy")'
      )
  );
}

function generatedDesktopLicenseCheck() {
  return Buffer.from(`#!/usr/bin/env node
"use strict";

// SPDX-License-Identifier: AGPL-3.0-or-later

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (packageJson.license !== "AGPL-3.0-or-later") {
  throw new Error("Desktop package must retain AGPL-3.0-or-later");
}
for (const relative of ["LICENSE", "LICENSES/MPL-2.0.txt", "NOTICE.md"]) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(\`Missing \${relative}\`);
}
for (const dependency of [
  "@docflow-local/contracts",
  "@docflow-local/core",
  "@docflow-local/license-verifier"
]) {
  const specifier = String(packageJson.dependencies?.[dependency] || "");
  if (!/^\\d+\\.\\d+\\.\\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(specifier)) {
    throw new Error(\`\${dependency} must use an exact published version\`);
  }
}
process.stdout.write("DESKTOP_LICENSE_MATERIALS_OK\\n");
`);
}

function repositoryDefinitions() {
  return Object.freeze([
    Object.freeze({
      name: "docflow",
      entries: Object.freeze([
        ...commonMetadataEntries("docflow"),
        sourceEntry("packages/core/README.md", "README.md"),
        sourceEntry("packages/core/LICENSE", "LICENSE"),
        sourceEntry("packages/core/NOTICE.md", "NOTICE.md"),
        sourceEntry("packages/core/LICENSES", "LICENSES"),
        sourceEntry("packages/contracts"),
        sourceEntry("packages/core"),
        sourceEntry("packages/desktop-extension-sdk"),
        sourceEntry("packages/license-verifier"),
        sourceEntry("license-boundaries.json"),
        sourceEntry("scripts/check-license-boundaries.js"),
        generatedEntry(
          "docs/core-relicensing-clean-room-plan.md",
          "generated:docflow/docs/core-relicensing-clean-room-plan.md",
          sourceRoot => rewrittenSource(
            sourceRoot,
            "docs/core-relicensing-clean-room-plan.md",
            source => rewriteCleanRoomPlan(source, "docflow")
          )
        ),
        generatedEntry("package.json", "generated:docflow/package.json", async sourceRoot => {
          const [corePackage, rootPackage] = await Promise.all([
            readJson(path.join(sourceRoot, "packages/core/package.json")),
            readJson(path.join(sourceRoot, "package.json"))
          ]);
          return Buffer.from(canonicalJson({
            name: "docflow-source-workspace",
            version: corePackage.version,
            private: true,
            description: "DocFlow Core, CLI, local API, contracts, verifier, and extension SDK source workspace",
            license: corePackage.license,
            workspaces: [
              "packages/contracts",
              "packages/core",
              "packages/desktop-extension-sdk",
              "packages/license-verifier"
            ],
            repository: {
              type: "git",
              url: "https://github.com/docflowlocal/docflow.git"
            },
            bugs: {
              url: "https://github.com/docflowlocal/docflow/issues"
            },
            homepage: "https://github.com/docflowlocal/docflow#readme",
            scripts: {
              test: "npm --workspaces test",
              "test:licenses": "node scripts/check-license-boundaries.js --exported-source"
            },
            overrides: rootPackage.overrides,
            engines: corePackage.engines
          }));
        })
      ]),
      requiredFiles: Object.freeze([
        ".github/workflows/ci.yml",
        "LICENSE",
        "NOTICE.md",
        "README.md",
        "package.json",
        "packages/contracts/package.json",
        "packages/core/package.json",
        "packages/desktop-extension-sdk/package.json",
        "packages/license-verifier/package.json",
        "license-boundaries.json",
        "scripts/check-license-boundaries.js",
        "docs/core-relicensing-clean-room-plan.md"
      ])
    }),
    Object.freeze({
      name: "docflow-desktop",
      entries: Object.freeze([
        ...commonMetadataEntries("docflow-desktop"),
        generatedEntry("README.md", "generated:docflow-desktop/README.md", sourceRoot => (
          rewrittenSource(sourceRoot, "README.md", source => rewriteDesktopDocument("README.md", source))
        )),
        generatedEntry(
          "README.zh-CN.md",
          "generated:docflow-desktop/README.zh-CN.md",
          sourceRoot => rewrittenSource(
            sourceRoot,
            "README.zh-CN.md",
            source => rewriteDesktopDocument("README.zh-CN.md", source)
          )
        ),
        sourceEntry("LICENSE"),
        sourceEntry("LICENSES"),
        generatedEntry("NOTICE.md", "generated:docflow-desktop/NOTICE.md", () => (
          generatedNotice("docflow-desktop")
        )),
        generatedEntry("BENCHMARKS.md", "generated:docflow-desktop/BENCHMARKS.md", sourceRoot => (
          rewrittenSource(
            sourceRoot,
            "BENCHMARKS.md",
            source => rewriteDesktopDocument("BENCHMARKS.md", source)
          )
        )),
        generatedEntry(
          "DESKTOP_BUILD.md",
          "generated:docflow-desktop/DESKTOP_BUILD.md",
          sourceRoot => rewrittenSource(
            sourceRoot,
            "DESKTOP_BUILD.md",
            source => rewriteDesktopDocument("DESKTOP_BUILD.md", source)
          )
        ),
        sourceEntry("PRIVACY.md"),
        sourceEntry("PLATFORM_ARCHITECTURE.md"),
        generatedEntry(
          "RELEASE_CHECKLIST.md",
          "generated:docflow-desktop/RELEASE_CHECKLIST.md",
          sourceRoot => rewrittenSource(
            sourceRoot,
            "RELEASE_CHECKLIST.md",
            source => rewriteDesktopDocument("RELEASE_CHECKLIST.md", source)
          )
        ),
        sourceEntry("ROADMAP.md"),
        sourceEntry("sample-data.csv"),
        sourceEntry("build"),
        sourceEntry("desktop", "desktop", {
          exclude: [
            "license-test.js",
            "package-mac-release.sh",
            "package-win-release.ps1"
          ]
        }),
        generatedEntry(
          "desktop/license-test.js",
          "generated:docflow-desktop/desktop/license-test.js",
          generatedDesktopLicenseTest
        ),
        generatedEntry(
          "desktop/package-mac-release.sh",
          "generated:docflow-desktop/desktop/package-mac-release.sh",
          sourceRoot => rewrittenSource(
            sourceRoot,
            "desktop/package-mac-release.sh",
            source => source.replace("npm run test:packages\n\n", "")
          )
        ),
        generatedEntry(
          "desktop/package-win-release.ps1",
          "generated:docflow-desktop/desktop/package-win-release.ps1",
          sourceRoot => rewrittenSource(
            sourceRoot,
            "desktop/package-win-release.ps1",
            source => source.replace(
              /\nnpm run test:packages\nif \(\$LASTEXITCODE -ne 0\) \{\n  throw "Package consumer tests failed with exit code \$LASTEXITCODE"\n\}\n/,
              ""
            )
          )
        ),
        sourceEntry("release/release-evidence.json"),
        sourceEntry("release/github-repositories.json"),
        sourceEntry("scripts/generate-release-metadata.js"),
        sourceEntry("scripts/release-readiness.js"),
        sourceEntry("scripts/release-readiness-test.js"),
        generatedEntry(
          "scripts/check-desktop-license-materials.js",
          "generated:docflow-desktop/scripts/check-desktop-license-materials.js",
          generatedDesktopLicenseCheck
        ),
        sourceEntry("static"),
        generatedEntry(
          "package.json",
          "generated:docflow-desktop/package.json",
          async sourceRoot => generatedRepositoryPackage(
            sourceRoot,
            "package.json",
            "docflow-desktop",
            async (packageJson, root) => {
              const generatedDependencies = await withExactPublicDependencies(
                packageJson,
                root,
                ["contracts", "core", "license-verifier"]
              );
              const allowedScript = name => (
                name === "benchmark:engine"
                || name === "test:api"
                || name === "test:pdf"
                || name === "test:ui"
                || name === "test:desktop"
                || name === "desktop"
                || name === "desktop:debug"
                || name.startsWith("test:packaged:")
                || name.startsWith("build:")
                || name.startsWith("pack:")
              );
              const scripts = Object.fromEntries(
                Object.entries(packageJson.scripts || {}).filter(([name]) => allowedScript(name))
              );
              scripts.test = [
                "node desktop/expression-test.js",
                "node desktop/template-engine-test.js",
                "node desktop/smoke-test.js",
                "node desktop/mvp-regression-test.js",
                "node desktop/license-test.js",
                "node desktop/project-format-test.js"
              ].join(" && ");
              scripts["test:syntax"] = [
                "node --check static/app.js",
                "node --check static/i18n.js",
                "node --check desktop/expression.js",
                "node --check desktop/template-engine.js",
                "node --check desktop/engine.js",
                "node --check desktop/main.js",
                "node --check desktop/preload.js",
                "node --check desktop/docx-render.js",
                "node --check desktop/release-smoke.js",
                "node --check desktop/pdf-smoke.js",
                "node --check desktop/ui-smoke.js",
                "node --check desktop/mvp-regression-test.js",
                "node --check desktop/benchmark-engine.js",
                "node --check desktop/electron-builder.release.cjs",
                "node --check desktop/electron-builder.win-release.cjs",
                "node --check desktop/release-signing-preflight.js",
                "node --check desktop/release-signing-preflight-test.js",
                "node --check desktop/release-signing-preflight-win.js",
                "node --check desktop/release-signing-preflight-win-test.js",
                "node --check scripts/check-desktop-license-materials.js",
                "node --check scripts/release-readiness.js",
                "node --check scripts/release-readiness-test.js",
                "node --check scripts/generate-release-metadata.js"
              ].join(" && ");
              scripts["test:licenses"] = "node scripts/check-desktop-license-materials.js";
              scripts["test:release"] = [
                "npm run test:licenses",
                "node scripts/release-readiness-test.js",
                "node desktop/release-signing-preflight-test.js",
                "node desktop/release-signing-preflight-win-test.js",
                "node scripts/release-readiness.js --channel internal --source-only"
              ].join(" && ");
              scripts["release:check"] = [
                "npm run release:check:mac"
              ].join(" && ");
              scripts["release:check:mac"] = [
                "npm run test:licenses",
                "node scripts/release-readiness.js --channel public --platform macOS"
              ].join(" && ");
              scripts["release:check:win"] = [
                "npm run test:licenses",
                "node scripts/release-readiness.js --channel public --platform windows --arch x64"
              ].join(" && ");
              scripts["release:metadata"] =
                "npm run release:metadata:mac";
              scripts["release:metadata:mac"] =
                "node scripts/generate-release-metadata.js --channel internal --platform macOS";
              scripts["release:metadata:win"] =
                "node scripts/generate-release-metadata.js --channel internal --platform windows --arch x64";
              const generated = {
                ...generatedDependencies,
                name: "docflow-desktop",
                scripts
              };
              delete generated.workspaces;
              if (Array.isArray(generated.build?.files)) {
                generated.build = {
                  ...generated.build,
                  files: generated.build.files.filter(pattern => (
                    !["packages/core/NOTICE.md", "templates/NOTICE.md"].includes(pattern)
                  ))
                };
              }
              return generated;
            }
          )
        )
      ]),
      requiredFiles: Object.freeze([
        ".github/workflows/ci.yml",
        "LICENSE",
        "NOTICE.md",
        "README.md",
        "package.json",
        "desktop/main.js",
        "release/release-evidence.json",
        "scripts/generate-release-metadata.js",
        "static/index.html"
      ])
    }),
    Object.freeze({
      name: "templates",
      entries: Object.freeze([
        ...commonMetadataEntries("templates"),
        sourceEntry("templates", ".", { exclude: ["package.json"] }),
        sourceEntry("templates/NOTICE.md", "LICENSE"),
        generatedEntry(
          "package.json",
          "generated:templates/package.json",
          sourceRoot => generatedRepositoryPackage(
            sourceRoot,
            "templates/package.json",
            "templates",
            (packageJson, root) => withExactPublicDependencies(
              packageJson,
              root,
              ["contracts", "core"]
            )
          )
        )
      ]),
      requiredFiles: Object.freeze([
        ".github/workflows/ci.yml",
        "LICENSE",
        "NOTICE.md",
        "README.md",
        "package.json"
      ])
    }),
    Object.freeze({
      name: "plugins",
      entries: Object.freeze([
        ...commonMetadataEntries("plugins"),
        sourceEntry("plugins", ".", { exclude: ["package.json"] }),
        sourceEntry("packages/contracts/LICENSE", "LICENSE"),
        generatedEntry("NOTICE.md", "generated:plugins/NOTICE.md", () => (
          generatedNotice("plugins")
        )),
        generatedEntry(
          "package.json",
          "generated:plugins/package.json",
          sourceRoot => generatedRepositoryPackage(
            sourceRoot,
            "plugins/package.json",
            "plugins",
            (packageJson, root) => withExactPublicDependencies(
              packageJson,
              root,
              ["contracts", "core"]
            )
          )
        )
      ]),
      requiredFiles: Object.freeze([
        ".github/workflows/ci.yml",
        "LICENSE",
        "NOTICE.md",
        "README.md",
        "package.json"
      ])
    }),
    Object.freeze({
      name: "examples",
      entries: Object.freeze([
        ...commonMetadataEntries("examples"),
        sourceEntry("examples", ".", { exclude: ["package.json"] }),
        sourceEntry("packages/contracts/LICENSE", "LICENSE"),
        generatedEntry("NOTICE.md", "generated:examples/NOTICE.md", () => (
          generatedNotice("examples")
        )),
        generatedEntry(
          "package.json",
          "generated:examples/package.json",
          sourceRoot => generatedRepositoryPackage(
            sourceRoot,
            "examples/package.json",
            "examples",
            (packageJson, root) => withExactPublicDependencies(
              packageJson,
              root,
              ["contracts", "core"]
            )
          )
        )
      ]),
      requiredFiles: Object.freeze([
        ".github/workflows/ci.yml",
        "LICENSE",
        "NOTICE.md",
        "README.md",
        "package.json"
      ])
    }),
    Object.freeze({
      name: "docs",
      entries: Object.freeze([
        ...commonMetadataEntries("docs"),
        sourceEntry("docs", ".", {
          exclude: [
            "core-relicensing-clean-room-plan.md",
            "repository-export.md"
          ]
        }),
        generatedEntry(
          "core-relicensing-clean-room-plan.md",
          "generated:docs/core-relicensing-clean-room-plan.md",
          sourceRoot => rewrittenSource(
            sourceRoot,
            "docs/core-relicensing-clean-room-plan.md",
            source => rewriteCleanRoomPlan(source, "docs")
          )
        ),
        generatedEntry(
          "repository-export.md",
          "generated:docs/repository-export.md",
          sourceRoot => rewrittenSource(
            sourceRoot,
            "docs/repository-export.md",
            source => source.replace(/npm run export:repositories -- --/g, "node scripts/export-repositories.js ")
              .replace("npm run export:repositories\n", "node scripts/export-repositories.js\n")
          )
        ),
        sourceEntry("LICENSE"),
        generatedEntry("NOTICE.md", "generated:docs/NOTICE.md", () => (
          generatedNotice("docs")
        )),
        generatedEntry("package.json", "generated:docs/package.json", async sourceRoot => {
          const rootPackage = await readJson(path.join(sourceRoot, "package.json"));
          return Buffer.from(canonicalJson({
            name: "@docflow-local/docs-workspace",
            version: rootPackage.version,
            private: true,
            description: "Public DocFlow product and developer documentation",
            license: rootPackage.license,
            scripts: {
              test: "node scripts/validate-content.js"
            },
            engines: {
              node: ">=22"
            },
            homepage: "https://github.com/docflowlocal/docs#readme",
            repository: {
              type: "git",
              url: "https://github.com/docflowlocal/docs.git"
            },
            bugs: {
              url: "https://github.com/docflowlocal/docs/issues"
            }
          }));
        })
      ]),
      requiredFiles: Object.freeze([
        ".github/workflows/ci.yml",
        "LICENSE",
        "NOTICE.md",
        "README.md",
        "package.json",
        "scripts/validate-content.js"
      ])
    })
  ]);
}

function isForbiddenDirectory(name) {
  return FORBIDDEN_DIRECTORY_NAMES.includes(String(name).toLowerCase());
}

async function collectSourceFiles(sourceRoot, entry) {
  const sourceRelative = assertRelativePath(entry.source, "Source path");
  const sourceAbsolute = resolveSourcePath(sourceRoot, sourceRelative);
  let rootStats;
  try {
    rootStats = await fs.promises.lstat(sourceAbsolute);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_SOURCE_MISSING",
        `Required export source is missing: ${sourceRelative}`
      );
    }
    throw error;
  }
  if (rootStats.isSymbolicLink()) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_SYMLINK",
      `Symbolic links are not allowed in repository exports: ${sourceRelative}`
    );
  }

  const files = [];
  const excluded = new Set(
    (entry.exclude || []).map(relative => assertRelativePath(relative, "Excluded source path"))
  );
  const targetRoot = entry.target === "." ? "" : assertRelativePath(entry.target, "Target path");
  const visit = async (absolute, relativeFromEntry, sourcePath, stats) => {
    if (stats.isSymbolicLink()) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_SYMLINK",
        `Symbolic links are not allowed in repository exports: ${sourcePath}`
      );
    }
    if (stats.isDirectory()) {
      const basename = path.basename(absolute);
      if (relativeFromEntry && isForbiddenDirectory(basename)) return;
      const children = await fs.promises.readdir(absolute, { withFileTypes: true });
      children.sort((left, right) => compareText(left.name, right.name));
      for (const child of children) {
        const childAbsolute = path.join(absolute, child.name);
        const childRelative = posixPath(relativeFromEntry, child.name);
        const childSource = posixPath(sourcePath, child.name);
        const childStats = await fs.promises.lstat(childAbsolute);
        await visit(childAbsolute, childRelative, childSource, childStats);
      }
      return;
    }
    if (!stats.isFile()) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_FILE_TYPE",
        `Only regular files may be exported: ${sourcePath}`
      );
    }
    if (excluded.has(relativeFromEntry)) return;
    const reason = secretPathReason(sourcePath);
    if (reason) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_SECRET",
        `Refusing to export ${reason}: ${sourcePath}`
      );
    }
    const bytes = await fs.promises.readFile(absolute);
    assertNoSecretContent(bytes, sourcePath);
    const target = assertRelativePath(
      rootStats.isDirectory()
        ? (targetRoot ? posixPath(targetRoot, relativeFromEntry) : relativeFromEntry)
        : entry.target,
      "Target path"
    );
    files.push({
      path: target,
      source: sourcePath,
      sourceAbsolute: absolute,
      bytes: bytes.length,
      mode: normalizedMode(stats),
      sha256: sha256(bytes)
    });
  };

  if (rootStats.isDirectory()) {
    await visit(sourceAbsolute, "", sourceRelative, rootStats);
  } else {
    await visit(sourceAbsolute, "", sourceRelative, rootStats);
  }
  return files;
}

function repositoryContentHash(files) {
  const hash = crypto.createHash("sha256");
  for (const file of [...files].sort((left, right) => compareText(left.path, right.path))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.mode);
    hash.update("\0");
    hash.update(String(file.bytes));
    hash.update("\0");
    hash.update(file.sha256);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function exportContentHash(repositories) {
  const hash = crypto.createHash("sha256");
  for (const repository of repositories) {
    hash.update(repository.name);
    hash.update("\0");
    hash.update(repository.contentSha256);
    hash.update("\n");
  }
  return hash.digest("hex");
}

async function buildExportPlan(options = {}) {
  const sourceRoot = path.resolve(options.sourceRoot || SOURCE_ROOT);
  const definitions = options.repositories || repositoryDefinitions();
  const repositories = [];
  const repositoryNames = new Set();

  for (const definition of definitions) {
    const name = assertRelativePath(definition.name, "Repository name");
    if (name.includes("/")) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_REPOSITORY_INVALID",
        `Repository export names must be one path segment: ${name}`
      );
    }
    if (repositoryNames.has(name)) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_REPOSITORY_INVALID",
        `Duplicate repository export name: ${name}`
      );
    }
    repositoryNames.add(name);
    const files = [];
    for (const entry of definition.entries || []) {
      if (typeof entry.generate === "function") {
        const target = assertRelativePath(entry.target, "Generated target path");
        const generated = await entry.generate(sourceRoot);
        const bytes = Buffer.isBuffer(generated) ? generated : Buffer.from(generated);
        assertNoSecretContent(bytes, entry.sourceLabel || target);
        files.push({
          path: target,
          source: String(entry.sourceLabel || `generated:${target}`),
          generatedBytes: bytes,
          bytes: bytes.length,
          mode: "0644",
          sha256: sha256(bytes)
        });
      } else {
        files.push(...await collectSourceFiles(sourceRoot, entry));
      }
    }
    files.sort((left, right) => compareText(left.path, right.path));
    const targetPaths = new Map();
    for (const file of files) {
      const collisionKey = file.path.normalize("NFC").toLocaleLowerCase("en-US");
      if (targetPaths.has(collisionKey)) {
        throw new RepositoryExportError(
          "DOCFLOW_EXPORT_PATH_COLLISION",
          `Export target collision in ${name}: ${targetPaths.get(collisionKey)} and ${file.path}`
        );
      }
      targetPaths.set(collisionKey, file.path);
      if (path.posix.basename(file.path) === "package.json") {
        const packageBytes = file.generatedBytes
          || await fs.promises.readFile(file.sourceAbsolute);
        assertPublishablePackageDependencies(packageBytes, `${name}/${file.path}`);
      }
    }
    const requiredFiles = [...(definition.requiredFiles || [])]
      .map(required => assertRelativePath(required, "Required metadata path"))
      .sort(compareText);
    for (const required of requiredFiles) {
      if (!targetPaths.has(required.normalize("NFC").toLocaleLowerCase("en-US"))) {
        throw new RepositoryExportError(
          "DOCFLOW_EXPORT_METADATA_MISSING",
          `Repository ${name} is missing required export metadata: ${required}`
        );
      }
    }
    repositories.push({
      name,
      requiredFiles,
      files,
      fileCount: files.length,
      totalBytes: files.reduce((total, file) => total + file.bytes, 0),
      contentSha256: repositoryContentHash(files)
    });
  }

  return {
    sourceRoot,
    repositories,
    contentSha256: exportContentHash(repositories)
  };
}

function manifestFromPlan(plan) {
  return {
    schemaVersion: 1,
    tool: TOOL_NAME,
    toolVersion: TOOL_VERSION,
    hashAlgorithm: "sha256",
    policy: {
      forbiddenDirectoryNames: [...FORBIDDEN_DIRECTORY_NAMES],
      secrets: "reject",
      symbolicLinks: "reject"
    },
    repositories: plan.repositories.map(repository => ({
      name: repository.name,
      fileCount: repository.fileCount,
      totalBytes: repository.totalBytes,
      contentSha256: repository.contentSha256,
      requiredFiles: [...repository.requiredFiles],
      files: repository.files.map(file => ({
        path: file.path,
        source: file.source,
        bytes: file.bytes,
        mode: file.mode,
        sha256: file.sha256
      }))
    })),
    contentSha256: plan.contentSha256
  };
}

async function inspectOutputTarget(outputRoot) {
  try {
    const stats = await fs.promises.lstat(outputRoot);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_OUTPUT_DIRTY",
        `Output path exists but is not a clean directory: ${outputRoot}`
      );
    }
    const entries = await fs.promises.readdir(outputRoot);
    if (entries.length) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_OUTPUT_DIRTY",
        `Refusing to use non-empty output directory: ${outputRoot}`
      );
    }
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function assertOutputOutsideSource(outputRoot, sourceRoot) {
  const output = path.resolve(outputRoot);
  const source = path.resolve(sourceRoot);
  if (output === source || output.startsWith(`${source}${path.sep}`)) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_OUTPUT_UNSAFE",
      "Repository exports must be written outside the transition source repository"
    );
  }
}

async function writePlan(stageRoot, plan, manifest) {
  for (const repository of plan.repositories) {
    const repositoryRoot = path.join(stageRoot, repository.name);
    await fs.promises.mkdir(repositoryRoot, { recursive: true, mode: 0o755 });
    for (const file of repository.files) {
      const destination = path.join(repositoryRoot, ...file.path.split("/"));
      await fs.promises.mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
      if (file.generatedBytes) {
        await fs.promises.writeFile(destination, file.generatedBytes, {
          flag: "wx",
          mode: Number.parseInt(file.mode, 8)
        });
      } else {
        await fs.promises.copyFile(file.sourceAbsolute, destination, fs.constants.COPYFILE_EXCL);
        await fs.promises.chmod(destination, Number.parseInt(file.mode, 8));
      }
    }
  }
  await fs.promises.writeFile(
    path.join(stageRoot, MANIFEST_FILENAME),
    canonicalJson(manifest),
    { flag: "wx", mode: 0o644 }
  );
}

async function listRegularFiles(root) {
  const files = [];
  const visit = async (absolute, relative) => {
    const stats = await fs.promises.lstat(absolute);
    if (stats.isSymbolicLink()) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_SYMLINK",
        `Export contains a symbolic link: ${relative}`
      );
    }
    if (stats.isDirectory()) {
      const children = await fs.promises.readdir(absolute);
      children.sort(compareText);
      for (const child of children) {
        await visit(path.join(absolute, child), posixPath(relative, child));
      }
      return;
    }
    if (!stats.isFile()) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_FILE_TYPE",
        `Export contains a non-regular file: ${relative}`
      );
    }
    files.push(relative);
  };
  await visit(root, "");
  return files.sort(compareText);
}

async function assertResolvableMarkdownLinks(repositoryRoot, relativePath, bytes) {
  const text = bytes.toString("utf8");
  for (const match of text.matchAll(/\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)) {
    let target = match[1].replace(/^<|>$/g, "");
    if (
      !target
      || target.startsWith("#")
      || target.startsWith("/")
      || target.startsWith("//")
      || /^[a-z][a-z0-9+.-]*:/i.test(target)
    ) {
      continue;
    }
    target = target.split("#")[0].split("?")[0];
    if (!target) continue;
    try {
      target = decodeURIComponent(target);
    } catch (_error) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_LINK_INVALID",
        `Invalid encoded Markdown link in ${relativePath}: ${match[1]}`
      );
    }
    const resolved = path.resolve(
      path.dirname(path.join(repositoryRoot, ...relativePath.split("/"))),
      ...target.replaceAll("\\", "/").split("/")
    );
    if (
      resolved !== repositoryRoot
      && !resolved.startsWith(`${repositoryRoot}${path.sep}`)
    ) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_LINK_INVALID",
        `Markdown link escapes repository ${relativePath}: ${match[1]}`
      );
    }
    try {
      await fs.promises.access(resolved, fs.constants.F_OK);
    } catch (_error) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_LINK_MISSING",
        `Markdown link target is missing in ${relativePath}: ${match[1]}`
      );
    }
  }
}

function assertManifestShape(manifest) {
  if (
    !manifest
    || manifest.schemaVersion !== 1
    || manifest.tool !== TOOL_NAME
    || manifest.toolVersion !== TOOL_VERSION
    || manifest.hashAlgorithm !== "sha256"
    || !Array.isArray(manifest.repositories)
  ) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_MANIFEST_INVALID",
      "Export manifest is missing or incompatible"
    );
  }
}

async function verifyExport(outputRoot, options = {}) {
  const root = path.resolve(outputRoot);
  const manifestPath = path.join(root, MANIFEST_FILENAME);
  let manifest;
  try {
    manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_MANIFEST_INVALID",
      `Unable to read export manifest: ${error.message}`
    );
  }
  assertManifestShape(manifest);
  if (
    options.expectedManifest
    && canonicalJson(manifest) !== canonicalJson(options.expectedManifest)
  ) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_MANIFEST_INVALID",
      "Written export manifest differs from the planned manifest"
    );
  }

  const expectedRootEntries = [
    MANIFEST_FILENAME,
    ...manifest.repositories.map(repository => repository.name)
  ].sort(compareText);
  const actualRootEntries = (await fs.promises.readdir(root)).sort(compareText);
  if (canonicalJson(actualRootEntries) !== canonicalJson(expectedRootEntries)) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_CONTENT_MISMATCH",
      "Export root contains missing or unexpected entries"
    );
  }

  const verifiedRepositories = [];
  for (const repository of manifest.repositories) {
    const repositoryName = assertRelativePath(repository.name, "Manifest repository name");
    if (repositoryName.includes("/") || !Array.isArray(repository.files)) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_MANIFEST_INVALID",
        `Invalid repository manifest: ${repository.name}`
      );
    }
    const repositoryRoot = path.join(root, repositoryName);
    const actualPaths = (await listRegularFiles(repositoryRoot))
      .map(relative => assertRelativePath(relative, "Exported file path"));
    const expectedPaths = repository.files.map(file => (
      assertRelativePath(file.path, "Manifest file path")
    )).sort(compareText);
    if (canonicalJson(actualPaths) !== canonicalJson(expectedPaths)) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_CONTENT_MISMATCH",
        `Repository ${repositoryName} contains missing or unexpected files`
      );
    }

    const actualRecords = [];
    const expectedByPath = new Map(repository.files.map(file => [file.path, file]));
    for (const relativePath of actualPaths) {
      const reason = secretPathReason(relativePath);
      if (reason) {
        throw new RepositoryExportError(
          "DOCFLOW_EXPORT_SECRET",
          `Export contains ${reason}: ${repositoryName}/${relativePath}`
        );
      }
      if (
        relativePath.split("/").some(segment => isForbiddenDirectory(segment))
      ) {
        throw new RepositoryExportError(
          "DOCFLOW_EXPORT_FORBIDDEN",
          `Export contains a forbidden build or dependency path: ${repositoryName}/${relativePath}`
        );
      }
      const expected = expectedByPath.get(relativePath);
      const absolute = path.join(repositoryRoot, ...relativePath.split("/"));
      const stats = await fs.promises.lstat(absolute);
      const bytes = await fs.promises.readFile(absolute);
      assertNoSecretContent(bytes, `${repositoryName}/${relativePath}`);
      if (relativePath.toLowerCase().endsWith(".md")) {
        await assertResolvableMarkdownLinks(repositoryRoot, relativePath, bytes);
      }
      if (path.posix.basename(relativePath) === "package.json") {
        assertPublishablePackageDependencies(
          bytes,
          `${repositoryName}/${relativePath}`
        );
      }
      const digest = sha256(bytes);
      if (bytes.length !== expected.bytes || digest !== expected.sha256) {
        throw new RepositoryExportError(
          "DOCFLOW_EXPORT_HASH_MISMATCH",
          `SHA-256 verification failed for ${repositoryName}/${relativePath}`
        );
      }
      if (process.platform !== "win32" && normalizedMode(stats) !== expected.mode) {
        throw new RepositoryExportError(
          "DOCFLOW_EXPORT_MODE_MISMATCH",
          `File mode verification failed for ${repositoryName}/${relativePath}`
        );
      }
      actualRecords.push({
        path: relativePath,
        mode: expected.mode,
        bytes: bytes.length,
        sha256: digest
      });
    }
    for (const required of repository.requiredFiles || []) {
      if (!expectedByPath.has(required)) {
        throw new RepositoryExportError(
          "DOCFLOW_EXPORT_METADATA_MISSING",
          `Repository ${repositoryName} is missing required metadata: ${required}`
        );
      }
    }
    const totalBytes = actualRecords.reduce((total, file) => total + file.bytes, 0);
    const contentSha256 = repositoryContentHash(actualRecords);
    if (
      actualRecords.length !== repository.fileCount
      || totalBytes !== repository.totalBytes
      || contentSha256 !== repository.contentSha256
    ) {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_HASH_MISMATCH",
        `Repository hash verification failed for ${repositoryName}`
      );
    }
    verifiedRepositories.push({
      name: repositoryName,
      contentSha256
    });
  }
  const contentSha256 = exportContentHash(verifiedRepositories);
  if (contentSha256 !== manifest.contentSha256) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_HASH_MISMATCH",
      "Top-level repository export hash verification failed"
    );
  }
  return {
    ok: true,
    output: root,
    manifest: manifestPath,
    repositories: verifiedRepositories.length,
    contentSha256
  };
}

async function exportRepositories(options = {}) {
  const requestedSourceRoot = path.resolve(options.sourceRoot || SOURCE_ROOT);
  if (options.output) {
    assertOutputOutsideSource(path.resolve(options.output), requestedSourceRoot);
  }
  const plan = await buildExportPlan(options);
  const manifest = manifestFromPlan(plan);
  if (options.dryRun) {
    if (options.output) {
      const outputRoot = path.resolve(options.output);
      await inspectOutputTarget(outputRoot);
    }
    return { dryRun: true, manifest };
  }

  let outputRoot;
  let outputExisted = false;
  let defaultReservation = false;
  if (options.output) {
    outputRoot = path.resolve(options.output);
    await fs.promises.mkdir(path.dirname(outputRoot), { recursive: true });
    outputExisted = await inspectOutputTarget(outputRoot);
  } else {
    outputRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "docflow-repositories-"));
    outputExisted = true;
    defaultReservation = true;
  }

  const parent = path.dirname(outputRoot);
  let stagingRoot;
  try {
    stagingRoot = await fs.promises.mkdtemp(
      path.join(parent, `.${path.basename(outputRoot)}.export-`)
    );
  } catch (error) {
    if (defaultReservation) {
      await fs.promises.rm(outputRoot, { recursive: true, force: true }).catch(() => {});
    }
    throw error;
  }
  let removedEmptyTarget = false;
  let committed = false;
  try {
    await writePlan(stagingRoot, plan, manifest);
    await verifyExport(stagingRoot, { expectedManifest: manifest });
    if (outputExisted) {
      await fs.promises.rmdir(outputRoot);
      removedEmptyTarget = true;
    }
    await fs.promises.rename(stagingRoot, outputRoot);
    committed = true;
    const verification = await verifyExport(outputRoot, { expectedManifest: manifest });
    return {
      dryRun: false,
      output: outputRoot,
      manifest,
      verification
    };
  } catch (error) {
    if (!committed) {
      await fs.promises.rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
    } else {
      await fs.promises.rm(outputRoot, { recursive: true, force: true }).catch(() => {});
    }
    if (removedEmptyTarget && !defaultReservation) {
      await fs.promises.mkdir(outputRoot, { recursive: true }).catch(() => {});
    } else if (defaultReservation) {
      await fs.promises.rm(outputRoot, { recursive: true, force: true }).catch(() => {});
    }
    throw error;
  }
}

const HELP = `DocFlow reproducible repository exporter

Usage:
  node scripts/export-repositories.js [--output <directory>] [--dry-run]
  node scripts/export-repositories.js --verify <directory>

Options:
  --output <directory>  Export to this clean directory (default: a new temp directory)
  --dry-run             Build and print the deterministic manifest without writing files
  --manifest            Print the full manifest after export
  --hash                Print only the aggregate SHA-256
  --verify <directory>  Verify an existing export against its manifest
  --help                Show this help

Every completed export contains ${MANIFEST_FILENAME}. Existing non-empty output
directories, symlinks, dependency/build trees, and secret-like files are rejected.
`;

function parseArguments(argv) {
  const options = {
    dryRun: false,
    printManifest: false,
    printHash: false,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index]);
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--manifest") options.printManifest = true;
    else if (argument === "--hash") options.printHash = true;
    else if (argument === "--help") options.help = true;
    else if (argument === "--output" || argument === "--verify") {
      const value = argv[index + 1];
      if (!value || String(value).startsWith("--")) {
        throw new RepositoryExportError(
          "DOCFLOW_EXPORT_ARGUMENT",
          `${argument} requires a directory`
        );
      }
      const key = argument === "--output" ? "output" : "verify";
      options[key] = path.resolve(String(value));
      index += 1;
    } else {
      throw new RepositoryExportError(
        "DOCFLOW_EXPORT_ARGUMENT",
        `Unknown argument: ${argument}`
      );
    }
  }
  if (options.printManifest && options.printHash) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_ARGUMENT",
      "--manifest and --hash cannot be used together"
    );
  }
  if (options.verify && (options.output || options.dryRun)) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_ARGUMENT",
      "--verify cannot be combined with --output or --dry-run"
    );
  }
  if (
    (options.printManifest || options.printHash)
    && !options.dryRun
    && !options.output
    && !options.verify
  ) {
    throw new RepositoryExportError(
      "DOCFLOW_EXPORT_ARGUMENT",
      "--manifest or --hash requires --dry-run, --output, or --verify so the export path is not lost"
    );
  }
  return options;
}

async function runCli(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const parsed = parseArguments(argv);
  if (parsed.help) {
    stdout.write(HELP);
    return 0;
  }
  if (parsed.verify) {
    const verification = await verifyExport(parsed.verify);
    stdout.write(parsed.printHash
      ? `${verification.contentSha256}\n`
      : canonicalJson(verification));
    return 0;
  }
  const result = await exportRepositories({
    output: parsed.output,
    dryRun: parsed.dryRun
  });
  const manifest = result.manifest;
  if (parsed.printHash) {
    stdout.write(`${manifest.contentSha256}\n`);
  } else if (parsed.dryRun || parsed.printManifest) {
    stdout.write(canonicalJson(manifest));
  } else {
    stdout.write(canonicalJson({
      ok: true,
      output: result.output,
      manifest: path.join(result.output, MANIFEST_FILENAME),
      repositories: manifest.repositories.map(repository => ({
        name: repository.name,
        files: repository.fileCount,
        bytes: repository.totalBytes,
        sha256: repository.contentSha256
      })),
      contentSha256: manifest.contentSha256
    }));
  }
  return 0;
}

async function main() {
  try {
    process.exitCode = await runCli();
  } catch (error) {
    process.stderr.write(`docflow-export: ${error.message || String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  FORBIDDEN_DIRECTORY_NAMES,
  HELP,
  MANIFEST_FILENAME,
  PUBLIC_PACKAGE_BOOTSTRAP_REF,
  RepositoryExportError,
  SOURCE_ROOT,
  TOOL_NAME,
  TOOL_VERSION,
  buildExportPlan,
  canonicalJson,
  exportRepositories,
  manifestFromPlan,
  parseArguments,
  repositoryDefinitions,
  runCli,
  verifyExport
};
