"use strict";

// SPDX-License-Identifier: AGPL-3.0-or-later

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);

function collectMarkdown(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) collectMarkdown(absolutePath, output);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      output.push(absolutePath);
    }
  }
  return output.sort();
}

function linkTarget(rawTarget) {
  const value = String(rawTarget || "").trim();
  if (!value) return "";
  if (value.startsWith("<")) {
    const closing = value.indexOf(">");
    return closing > 0 ? value.slice(1, closing) : value;
  }
  return value.split(/\s+/, 1)[0];
}

function relativeLinkTargets(markdown) {
  const withoutCode = markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
  const targets = [];
  for (const pattern of [
    /!?\[[^\]\n]*\]\(([^)\n]+)\)/g,
    /^\s*\[[^\]\n]+\]:\s*(\S+)/gm
  ]) {
    for (const match of withoutCode.matchAll(pattern)) {
      const target = linkTarget(match[1]);
      if (
        target &&
        !target.startsWith("#") &&
        !/^(?:https?:|mailto:|data:)/i.test(target)
      ) {
        targets.push(target);
      }
    }
  }
  return targets;
}

function resolveRelativeLink(markdownPath, rawTarget) {
  const pathname = rawTarget.split("#", 1)[0].split("?", 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    assert.fail(`${path.relative(ROOT, markdownPath)} has an invalid encoded link: ${rawTarget}`);
  }
  assert(decoded && !path.isAbsolute(decoded), (
    `${path.relative(ROOT, markdownPath)} has a non-relative local link: ${rawTarget}`
  ));
  const target = path.resolve(path.dirname(markdownPath), decoded);
  const relative = path.relative(ROOT, target);
  assert(
    relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative),
    `${path.relative(ROOT, markdownPath)} link escapes the documentation root: ${rawTarget}`
  );
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    return path.join(target, "README.md");
  }
  return target;
}

const markdownFiles = collectMarkdown(ROOT);
assert(markdownFiles.length >= 6, "the documentation repository is unexpectedly empty");

let checkedLinks = 0;
for (const markdownPath of markdownFiles) {
  const markdown = fs.readFileSync(markdownPath, "utf8");
  for (const target of relativeLinkTargets(markdown)) {
    const resolved = resolveRelativeLink(markdownPath, target);
    assert(
      fs.existsSync(resolved) && fs.statSync(resolved).isFile(),
      `${path.relative(ROOT, markdownPath)} has a broken relative link: ${target}`
    );
    checkedLinks += 1;
  }
}

process.stdout.write(
  `validated ${markdownFiles.length} Markdown files and ${checkedLinks} relative links\n`
);
