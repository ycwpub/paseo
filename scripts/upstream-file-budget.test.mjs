import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGACY_CONFLICT_FILE_CEILING,
  UPSTREAM_BASELINE_SHA,
  collectUpstreamOwnedChanges,
  excludeEquivalentRestoredDeletions,
  parseFileBudgetArguments,
  parseNameStatus,
} from "./upstream-file-budget.mjs";

test("parses regular, renamed, and copied paths", () => {
  assert.deepEqual(
    parseNameStatus("M\0shared.ts\0A\0new.ts\0R095\0old.ts\0renamed.ts\0C100\0a.ts\0b.ts\0"),
    [
      { status: "M", paths: ["shared.ts"] },
      { status: "A", paths: ["new.ts"] },
      { status: "R095", paths: ["old.ts", "renamed.ts"] },
      { status: "C100", paths: ["a.ts", "b.ts"] },
    ],
  );
});

test("counts only paths owned by upstream", () => {
  const changes = parseNameStatus("M\0shared.ts\0M\0branch-owned.ts\0R100\0old.ts\0new-name.ts\0");

  assert.deepEqual(collectUpstreamOwnedChanges(changes, new Set(["shared.ts", "old.ts"])), [
    "old.ts",
    "shared.ts",
  ]);
});

test("does not count deleted upstream files restored as identical untracked files", () => {
  const changes = parseNameStatus(
    "D\0restored.ts\0D\0still-deleted.ts\0M\0modified.ts\0A\0new.ts\0",
  );

  assert.deepEqual(
    excludeEquivalentRestoredDeletions(changes, (path) => path === "restored.ts"),
    [
      { status: "D", paths: ["still-deleted.ts"] },
      { status: "M", paths: ["modified.ts"] },
      { status: "A", paths: ["new.ts"] },
    ],
  );
});

test("defaults to the fixed feature branch upstream baseline", () => {
  assert.deepEqual(parseFileBudgetArguments([]), {
    upstream: UPSTREAM_BASELINE_SHA,
    maxModified: 100,
    legacyCeiling: LEGACY_CONFLICT_FILE_CEILING,
    cached: false,
  });
});

test("parses the staged branch-wide budget options", () => {
  assert.deepEqual(
    parseFileBudgetArguments([
      "--cached",
      "--upstream",
      "upstream/main",
      "--max-modified",
      "25",
      "--legacy-ceiling",
      "40",
    ]),
    {
      upstream: "upstream/main",
      maxModified: 25,
      legacyCeiling: 40,
      cached: true,
    },
  );
});
