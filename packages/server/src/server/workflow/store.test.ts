import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowRunStore } from "./store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("WorkflowRunStore", () => {
  it("skips incompatible persisted runs without blocking daemon startup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "paseo-workflow-store-"));
    tempDirs.push(directory);
    const invalidPath = join(directory, "legacy-run.json");
    await writeFile(
      invalidPath,
      JSON.stringify({
        id: "legacy-run",
        scriptSnapshot: {
          version: 1,
          name: "Legacy workflow",
          steps: [{ id: "agent", type: "agent", outputType: "answer" }],
        },
      }),
    );
    const onInvalidRun = vi.fn();
    const store = new WorkflowRunStore(directory, onInvalidRun);

    await expect(store.list()).resolves.toEqual([]);
    await expect(store.get("legacy-run")).resolves.toBeNull();
    expect(onInvalidRun).toHaveBeenCalledTimes(1);
    expect(onInvalidRun).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: invalidPath,
        error: expect.anything(),
      }),
    );
  });
});
