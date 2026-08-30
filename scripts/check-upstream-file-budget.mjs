#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  collectUpstreamOwnedChanges,
  excludeEquivalentRestoredDeletions,
  parseFileBudgetArguments,
  parseNameStatus,
} from "./upstream-file-budget.mjs";

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function currentBranch() {
  return git(["branch", "--show-current"]).trim();
}

function listUpstreamPaths(upstream) {
  return new Set(git(["ls-tree", "-r", "--name-only", "-z", upstream]).split("\0").filter(Boolean));
}

function readChanges(options) {
  const args = ["diff", "--name-status", "-z", "--find-renames"];
  if (options.cached) args.push("--cached");
  args.push(options.upstream);
  const changes = parseNameStatus(git(args));
  if (options.cached) return changes;

  return excludeEquivalentRestoredDeletions(changes, (path) => {
    if (!existsSync(path)) return false;
    try {
      const worktreeBlob = git(["hash-object", "--", path]).trim();
      const upstreamBlob = git(["rev-parse", `${options.upstream}:${path}`]).trim();
      return worktreeBlob === upstreamBlob;
    } catch {
      return false;
    }
  });
}

function main() {
  const options = parseFileBudgetArguments(process.argv.slice(2));
  if (currentBranch() !== "feature_paseo") {
    console.log("feature_paseo file budget: skipped outside feature_paseo");
    return;
  }

  const upstreamPaths = listUpstreamPaths(options.upstream);
  const modifiedPaths = new Set(collectUpstreamOwnedChanges(readChanges(options), upstreamPaths));
  const sortedModifiedPaths = [...modifiedPaths].sort();
  const summary = `${sortedModifiedPaths.length}/${options.maxModified}`;

  if (sortedModifiedPaths.length <= options.maxModified) {
    console.log(`feature_paseo upstream-owned file budget: ${summary}`);
    return;
  }

  if (sortedModifiedPaths.length <= options.legacyCeiling) {
    console.warn(
      `feature_paseo upstream-owned migration debt: ${summary}; ` +
        `hard legacy ceiling ${options.legacyCeiling}`,
    );
    console.warn(
      "Reduce this debt by extracting feature modules and removing obsolete shared-file edits.",
    );
    return;
  }

  console.error(`feature_paseo upstream-owned file budget exceeded: ${summary}`);
  console.error(`Legacy migration ceiling exceeded: ${options.legacyCeiling}`);
  console.error(
    "Move implementation and tests into new feature-owned files; keep upstream files as thin wiring.",
  );
  for (const path of sortedModifiedPaths) console.error(`- ${path}`);
  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`feature_paseo file budget check failed: ${message}`);
  process.exitCode = 1;
}
