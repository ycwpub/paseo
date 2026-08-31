#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { findSemanticSourceOverlayErrors } from "./source-overlay-policy.mjs";

const SAME_BASENAME_OVERLAY_PATTERN = /\.feature-paseo\./u;
const BRANCH_NAME_PATH_PATTERN = /(?:^|\/)[^/]*(?:feature-paseo|feature_paseo)[^/]*(?:\/|$)/u;
const FORBIDDEN_INFRASTRUCTURE_PATHS = new Set([
  "packages/app/feature-paseo-overlay.cjs",
  "packages/app/feature-paseo-source-overrides.txt",
  "packages/app/feature-paseo-test-overrides.ts",
  "packages/app/feature-paseo-vite-plugin.ts",
  "packages/app/vitest.feature-paseo.setup.ts",
  "packages/cli/feature-paseo-test-overrides.ts",
  "packages/cli/tsconfig.feature-paseo.json",
  "packages/client/feature-paseo-test-overrides.ts",
  "packages/desktop/feature-paseo-test-overrides.ts",
  "packages/protocol/feature-paseo-test-overrides.ts",
  "packages/relay/feature-paseo-test-overrides.ts",
  "packages/server/feature-paseo-test-overrides.ts",
]);
const FORBIDDEN_REFERENCES = [
  "feature-paseo-source-overrides",
  "feature-paseo-test-overrides",
  "feature-paseo-overlay",
  "feature-paseo-vite-plugin",
  "featurePaseoOverlayPlugin",
  "applyFeaturePaseoOverlay",
  '"moduleSuffixes": [".feature-paseo", ""]',
  "tsconfig.feature-paseo.json",
];
const CONFIG_PATHS = [
  "packages/app/metro.config.cjs",
  "packages/app/tsconfig.json",
  "packages/app/vitest.config.ts",
  "packages/cli/package.json",
  "packages/cli/vitest.config.ts",
  "packages/client/vitest.config.ts",
  "packages/desktop/vitest.config.ts",
  "packages/protocol/vitest.config.ts",
  "packages/relay/vitest.config.ts",
  "packages/server/vitest.config.ts",
];

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function listCurrentPaths(cached) {
  if (cached) {
    return git(["ls-files", "-z"]).split("\0").filter(Boolean).sort();
  }
  return git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    .split("\0")
    .filter((path) => path && existsSync(path))
    .sort();
}

function readPath(path, cached) {
  return cached ? git(["show", `:${path}`]) : readFileSync(path, "utf8");
}

function basePathForOverlay(path) {
  return path.replace(".feature-paseo.", ".");
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

  const currentPaths = listCurrentPaths(cached);
  const currentPathSet = new Set(currentPaths);
  const errors = [];

  for (const path of currentPaths) {
    if (BRANCH_NAME_PATH_PATTERN.test(path)) {
      errors.push(`新增文件或目录不得使用分支名，应按职责命名：${path}`);
    }
    if (FORBIDDEN_INFRASTRUCTURE_PATHS.has(path)) {
      errors.push(`禁止恢复 overlay 基础设施：${path}`);
    }
    if (SAME_BASENAME_OVERLAY_PATTERN.test(path)) {
      const basePath = basePathForOverlay(path);
      if (currentPathSet.has(basePath)) {
        errors.push(`禁止同名 overlay：${basePath} <- ${path}`);
      }
    }
  }

  for (const path of CONFIG_PATHS) {
    if (!currentPathSet.has(path)) continue;
    const source = readPath(path, cached);
    for (const reference of FORBIDDEN_REFERENCES) {
      if (source.includes(reference)) {
        errors.push(`禁止 overlay 接线：${path} 包含 ${reference}`);
      }
    }
  }

  errors.push(...findSemanticSourceOverlayErrors(currentPaths, (path) => readPath(path, cached)));

  if (errors.length === 0) {
    console.log("feature_paseo overlays: 0");
    return;
  }

  console.error(`feature_paseo overlay check failed: ${errors.length} 个问题`);
  console.error("业务逻辑应放入新增模块，原文件只保留少量稳定接线，禁止平行源码副本。");
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
