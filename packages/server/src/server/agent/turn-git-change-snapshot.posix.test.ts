import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGitCommand } from "../../utils/run-git-command.js";
import { captureTurnGitBaseline, captureTurnGitChanges } from "./turn-git-change-snapshot.js";

const cleanupRoots = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...cleanupRoots].map(async (root) => {
      await rm(root, { force: true, recursive: true });
      cleanupRoots.delete(root);
    }),
  );
});

async function createRepository(root: string, name: string): Promise<string> {
  const repository = path.join(root, "repos", name);
  await mkdir(repository, { recursive: true });
  await runGitCommand(["init", "-b", "main"], { cwd: repository });
  await runGitCommand(["config", "user.name", "Paseo Tests"], { cwd: repository });
  await runGitCommand(["config", "user.email", "paseo@example.test"], { cwd: repository });
  await writeFile(path.join(repository, "first.ts"), "export const first = 1;\n");
  await writeFile(path.join(repository, "second.ts"), "export const second = 1;\n");
  await writeFile(path.join(repository, "third.ts"), "export const third = 1;\n");
  await runGitCommand(["add", "-A"], { cwd: repository });
  await runGitCommand(["commit", "-m", "initial"], { cwd: repository });
  return await realpath(repository);
}

describe("turn Git change snapshots", () => {
  it("retains committed file changes after the working tree becomes clean", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "paseo-turn-changes-"));
    cleanupRoots.add(projectRoot);
    const repository = await createRepository(projectRoot, "service");
    const baseline = await captureTurnGitBaseline({
      cwd: projectRoot,
      writableProjectDirectories: [],
    });

    await writeFile(path.join(repository, "first.ts"), "export const first = 2;\n");
    await writeFile(
      path.join(repository, "second.ts"),
      "export const second = 1;\nexport const added = true;\n",
    );
    await writeFile(path.join(repository, "third.ts"), "");
    await runGitCommand(["add", "-A"], { cwd: repository });
    await runGitCommand(["commit", "-m", "turn changes"], { cwd: repository });

    const snapshot = await captureTurnGitChanges(baseline);

    expect(snapshot).toEqual({
      repositories: [
        {
          cwd: repository,
          files: [
            {
              path: "first.ts",
              isNew: false,
              isDeleted: false,
              additions: 1,
              deletions: 1,
            },
            {
              path: "second.ts",
              isNew: false,
              isDeleted: false,
              additions: 1,
              deletions: 0,
            },
            {
              path: "third.ts",
              isNew: false,
              isDeleted: false,
              additions: 0,
              deletions: 1,
            },
          ],
        },
      ],
    });
  });

  it("groups changes from every configured repository", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "paseo-turn-multi-repo-"));
    cleanupRoots.add(projectRoot);
    const firstRepository = await createRepository(projectRoot, "api");
    const secondRepository = await createRepository(projectRoot, "web");
    const baseline = await captureTurnGitBaseline({
      cwd: projectRoot,
      writableProjectDirectories: [secondRepository, firstRepository],
    });

    await writeFile(path.join(firstRepository, "first.ts"), "export const first = 3;\n");
    await writeFile(path.join(secondRepository, "second.ts"), "export const second = 4;\n");

    const snapshot = await captureTurnGitChanges(baseline);

    expect(snapshot.repositories).toEqual([
      {
        cwd: firstRepository,
        files: [
          {
            path: "first.ts",
            isNew: false,
            isDeleted: false,
            additions: 1,
            deletions: 1,
          },
        ],
      },
      {
        cwd: secondRepository,
        files: [
          {
            path: "second.ts",
            isNew: false,
            isDeleted: false,
            additions: 1,
            deletions: 1,
          },
        ],
      },
    ]);
  });
});
