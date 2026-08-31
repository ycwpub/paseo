import assert from "node:assert/strict";
import test from "node:test";
import { findSemanticSourceOverlayErrors } from "./source-overlay-policy.mjs";

function inspect(files) {
  const entries = Object.entries(files);
  return findSemanticSourceOverlayErrors(
    entries.map(([path]) => path),
    (path) => files[path],
  );
}

test("rejects a copied CLI management subsystem beside its canonical implementation", () => {
  const errors = inspect({
    "packages/cli/src/commands/plugin/index.ts": "export const plugin = true;",
    "packages/cli/src/commands/plugin-management/index.ts": "export const plugin = true;",
  });

  assert.equal(errors.length, 2);
  assert.match(errors[0], /禁止平行复制 CLI 子系统/u);
  assert.match(errors[1], /内容完全相同的 CLI 语义 overlay/u);
});

test("rejects a divergent CLI management subsystem beside its canonical implementation", () => {
  const errors = inspect({
    "packages/cli/src/commands/schedule/index.ts": "export const version = 1;",
    "packages/cli/src/commands/schedule-management/index.ts": "export const version = 2;",
  });

  assert.equal(errors.length, 1);
  assert.match(errors[0], /禁止平行复制 CLI 子系统/u);
});

test("allows a responsibility-specific module without a parallel canonical subsystem", () => {
  const errors = inspect({
    "packages/cli/src/commands/access-management/index.ts": "export const access = true;",
  });

  assert.deepEqual(errors, []);
});

test("does not inspect documentation copies", () => {
  const errors = inspect({
    "docs/product-extensions/plugin/index.ts": "same",
    "docs/product-extensions/plugin-management/index.ts": "same",
  });

  assert.deepEqual(errors, []);
});
