#!/usr/bin/env node
/**
 * Check relative Markdown links inside docs/.
 *
 * Usage: node scripts/check-docs-links.mjs
 *
 * Ignores absolute URLs, anchors, mailto: and links inside fenced code blocks.
 * Exits 1 when a relative link target does not exist.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = join(repoRoot, "docs");

/** @param {string} dir */
function markdownFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Strip fenced code blocks so Mermaid/code examples are not parsed as links. */
function stripFences(markdown) {
  return markdown.replace(/^```[\s\S]*?^```/gm, "");
}

const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const missing = [];
let checked = 0;

for (const file of markdownFiles(docsRoot)) {
  const text = stripFences(readFileSync(file, "utf8"));
  for (const match of text.matchAll(linkPattern)) {
    const raw = match[1];
    if (
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("mailto:") ||
      raw.startsWith("#")
    ) {
      continue;
    }

    const withoutAnchor = raw.split("#")[0];
    if (!withoutAnchor) continue;

    const target = resolve(dirname(file), decodeURIComponent(withoutAnchor));
    checked += 1;
    if (!target.startsWith(docsRoot + sep) && target !== docsRoot) {
      missing.push({ file, raw, reason: "outside docs/" });
      continue;
    }

    let exists = false;
    try {
      exists = statSync(target).isFile() || statSync(target).isDirectory();
    } catch {
      exists = false;
    }
    if (!exists) missing.push({ file, raw, reason: "not found" });
  }
}

const relative = (p) => p.slice(repoRoot.length + 1).replaceAll(sep, "/");

if (missing.length > 0) {
  console.error(`Broken links: ${missing.length} (checked ${checked})`);
  for (const item of missing) {
    console.error(`- ${relative(item.file)} -> ${item.raw} (${item.reason})`);
  }
  process.exit(1);
}

console.log(`Docs links OK (${checked} checked).`);
