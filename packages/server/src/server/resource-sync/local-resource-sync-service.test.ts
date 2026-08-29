import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyLocalResource, exportLocalResource } from "./local-resource-sync-service.js";

const roots: string[] = [];

async function temporaryDirectory(name: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `paseo-${name}-`));
  roots.push(root);
  return root;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("local resource sync service", () => {
  it("creates a missing directory and preserves binary content", async () => {
    const sourceRoot = await temporaryDirectory("resource-source");
    const targetRoot = await temporaryDirectory("resource-target");
    await mkdir(path.join(sourceRoot, "nested"));
    await writeFile(path.join(sourceRoot, "nested", "logo.bin"), Buffer.from([0, 1, 2, 255]));

    const snapshot = await exportLocalResource(sourceRoot);
    const targetPath = path.join(targetRoot, "plugin");
    const result = await applyLocalResource({
      targetPath,
      snapshot,
      missingPolicy: "create",
      existingPolicy: "merge",
      sourceLabel: "开发主机",
    });

    expect(result.status).toBe("applied");
    expect(result.created).toBeGreaterThanOrEqual(2);
    expect(await readFile(path.join(targetPath, "nested", "logo.bin"))).toEqual(
      Buffer.from([0, 1, 2, 255]),
    );
  });

  it("skips a missing target when the user does not allow creation", async () => {
    const sourceRoot = await temporaryDirectory("resource-source");
    const targetRoot = await temporaryDirectory("resource-target");
    await writeFile(path.join(sourceRoot, "README.md"), "source");

    const result = await applyLocalResource({
      targetPath: path.join(targetRoot, "missing"),
      snapshot: await exportLocalResource(sourceRoot),
      missingPolicy: "skip",
      existingPolicy: "merge",
    });

    expect(result.status).toBe("skipped_missing");
    await expect(readFile(path.join(targetRoot, "missing", "README.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("keeps target-only files and writes a conflict copy in merge mode", async () => {
    const sourceRoot = await temporaryDirectory("resource-source");
    const targetRoot = await temporaryDirectory("resource-target");
    const targetPath = path.join(targetRoot, "knowledge");
    await writeFile(path.join(sourceRoot, "shared.md"), "source");
    await mkdir(targetPath);
    await writeFile(path.join(targetPath, "shared.md"), "target");
    await writeFile(path.join(targetPath, "target-only.md"), "keep");

    const result = await applyLocalResource({
      targetPath,
      snapshot: await exportLocalResource(sourceRoot),
      missingPolicy: "create",
      existingPolicy: "merge",
      sourceLabel: "Mac A",
    });

    expect(await readFile(path.join(targetPath, "shared.md"), "utf8")).toBe("target");
    expect(await readFile(path.join(targetPath, "shared.paseo-source-Mac-A.md"), "utf8")).toBe(
      "source",
    );
    expect(await readFile(path.join(targetPath, "target-only.md"), "utf8")).toBe("keep");
    expect(result.conflicts).toBe(1);
  });

  it("leaves an existing target unchanged when the user chooses skip", async () => {
    const sourceRoot = await temporaryDirectory("resource-source");
    const targetRoot = await temporaryDirectory("resource-target");
    const targetPath = path.join(targetRoot, "knowledge");
    await writeFile(path.join(sourceRoot, "shared.md"), "source");
    await mkdir(targetPath);
    await writeFile(path.join(targetPath, "shared.md"), "target");

    const result = await applyLocalResource({
      targetPath,
      snapshot: await exportLocalResource(sourceRoot),
      missingPolicy: "create",
      existingPolicy: "skip",
    });

    expect(result.status).toBe("skipped_existing");
    expect(await readFile(path.join(targetPath, "shared.md"), "utf8")).toBe("target");
  });

  it("overwrites same-name files without deleting target-only files", async () => {
    const sourceRoot = await temporaryDirectory("resource-source");
    const targetRoot = await temporaryDirectory("resource-target");
    const targetPath = path.join(targetRoot, "plugin");
    await writeFile(path.join(sourceRoot, "index.ts"), "new");
    await mkdir(targetPath);
    await writeFile(path.join(targetPath, "index.ts"), "old");
    await writeFile(path.join(targetPath, "local.json"), "{}");

    const result = await applyLocalResource({
      targetPath,
      snapshot: await exportLocalResource(sourceRoot),
      missingPolicy: "create",
      existingPolicy: "overwrite",
    });

    expect(await readFile(path.join(targetPath, "index.ts"), "utf8")).toBe("new");
    expect(await readFile(path.join(targetPath, "local.json"), "utf8")).toBe("{}");
    expect(result.updated).toBe(1);
  });

  it("skips symlinks in the exported directory", async () => {
    const sourceRoot = await temporaryDirectory("resource-source");
    const outsideRoot = await temporaryDirectory("resource-outside");
    await writeFile(path.join(outsideRoot, "secret.txt"), "secret");
    await symlink(path.join(outsideRoot, "secret.txt"), path.join(sourceRoot, "linked.txt"));

    const snapshot = await exportLocalResource(sourceRoot);

    expect(snapshot.entries).toEqual([]);
    expect(snapshot.skippedPaths).toEqual(["linked.txt"]);
  });

  it("rejects snapshot paths that escape the target root", async () => {
    const targetRoot = await temporaryDirectory("resource-target");

    await expect(
      applyLocalResource({
        targetPath: path.join(targetRoot, "safe"),
        missingPolicy: "create",
        existingPolicy: "merge",
        snapshot: {
          version: 1,
          rootKind: "directory",
          totalFiles: 1,
          totalDirectories: 0,
          totalBytes: 4,
          skippedPaths: [],
          entries: [
            {
              path: "../escape.txt",
              kind: "file",
              size: 4,
              modifiedAt: new Date().toISOString(),
              hash: "unused",
              contentBase64: Buffer.from("oops").toString("base64"),
            },
          ],
        },
      }),
    ).rejects.toThrow("非法同步路径");
  });
});
