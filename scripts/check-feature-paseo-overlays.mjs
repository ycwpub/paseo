#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const LEGACY_OVERLAY_BASELINE = "faa79fa9da8a45c088b0cfa8f00afdd3fec9da32";
const APP_SOURCE_ROOT = "packages/app/src/";
const OVERRIDE_MANIFEST = "packages/app/feature-paseo-source-overrides.txt";
const RUNTIME_OVERLAY_PATTERN = /\.feature-paseo\.(?:ts|tsx)$/u;
const TEST_FILE_PATTERN = /\.(?:test|spec)\./u;

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function isRuntimeOverlay(path) {
  return (
    path.startsWith(APP_SOURCE_ROOT) &&
    RUNTIME_OVERLAY_PATTERN.test(path) &&
    !TEST_FILE_PATTERN.test(path)
  );
}

function listGitPaths(treeish) {
  return git(["ls-tree", "-r", "--name-only", "-z", treeish, APP_SOURCE_ROOT])
    .split("\0")
    .filter(isRuntimeOverlay)
    .sort();
}

function listCurrentPaths(cached) {
  if (cached) {
    return git(["ls-files", "-z", "--", APP_SOURCE_ROOT])
      .split("\0")
      .filter(isRuntimeOverlay)
      .sort();
  }
  return git(["ls-files", "-z", "--cached", "--others", "--exclude-standard", APP_SOURCE_ROOT])
    .split("\0")
    .filter((path) => isRuntimeOverlay(path) && existsSync(path))
    .sort();
}

function readPath(path, cached) {
  return cached ? git(["show", `:${path}`]) : readFileSync(path, "utf8");
}

function readBaselinePath(path) {
  return git(["show", `${LEGACY_OVERLAY_BASELINE}:${path}`]);
}

function countLines(value) {
  if (!value) return 0;
  return value.split("\n").length - (value.endsWith("\n") ? 1 : 0);
}

function basePathForOverlay(path) {
  return path.replace(".feature-paseo.", ".");
}

function parseOverrideManifest(value) {
  const entries = new Map();
  for (const [index, rawLine] of value.split("\n").entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(" -> ");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(`Invalid ${OVERRIDE_MANIFEST}:${index + 1}: ${rawLine}`);
    }
    entries.set(parts[1], parts[0]);
  }
  return entries;
}

function main() {
  const cached = process.argv.slice(2).includes("--cached");
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--cached");
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown argument: ${unknownArguments[0]}`);
  }

  if (git(["branch", "--show-current"]).trim() !== "feature_paseo") {
    console.log("feature_paseo overlay check: skipped outside feature_paseo");
    return;
  }

  const baselinePaths = listGitPaths(LEGACY_OVERLAY_BASELINE);
  const baselinePathSet = new Set(baselinePaths);
  const currentPaths = listCurrentPaths(cached);
  const currentPathSet = new Set(currentPaths);
  const manifest = parseOverrideManifest(readPath(OVERRIDE_MANIFEST, cached));
  const errors = [];
  let baselineLines = 0;
  let currentLines = 0;

  for (const path of baselinePaths) {
    baselineLines += countLines(readBaselinePath(path));
  }

  for (const path of currentPaths) {
    const currentContent = readPath(path, cached);
    const currentLineCount = countLines(currentContent);
    currentLines += currentLineCount;

    if (!baselinePathSet.has(path)) {
      errors.push(`禁止新增运行时 overlay：${path}`);
      continue;
    }

    const baselineLineCount = countLines(readBaselinePath(path));
    if (currentLineCount > baselineLineCount) {
      errors.push(
        `legacy overlay 不得继续膨胀：${path} (${currentLineCount} > ${baselineLineCount})`,
      );
    }

    const expectedBasePath = basePathForOverlay(path);
    if (manifest.get(path) !== expectedBasePath) {
      errors.push(`overlay 映射缺失或不一致：${expectedBasePath} -> ${path}`);
    }
  }

  for (const [overlayPath, basePath] of manifest) {
    if (!currentPathSet.has(overlayPath)) {
      errors.push(`overlay 映射指向不存在的文件：${basePath} -> ${overlayPath}`);
    }
    if (basePath !== basePathForOverlay(overlayPath)) {
      errors.push(`overlay 映射不是同名替换：${basePath} -> ${overlayPath}`);
    }
  }

  const summary =
    `${currentPaths.length}/${baselinePaths.length} 个 legacy runtime overlays，` +
    `${currentLines}/${baselineLines} 行`;
  if (errors.length === 0) {
    console.log(`feature_paseo overlay debt: ${summary}`);
    return;
  }

  console.error(`feature_paseo overlay check failed: ${summary}`);
  console.error("把业务逻辑抽到新增文件，并在原文件保留少量稳定接线；不要扩展平行源码副本。");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`feature_paseo overlay check failed: ${message}`);
  process.exitCode = 1;
}
