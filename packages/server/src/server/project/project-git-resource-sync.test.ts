import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { syncProjectGitResources } from "./project-git-resource-sync.js";

const roots: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  }).trim();
}

function createRemoteRepository(): { remote: string; source: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), "paseo-project-git-resource-"));
  roots.push(root);
  const source = path.join(root, "source");
  const remote = path.join(root, "remote.git");
  git(root, "init", "-b", "main", source);
  git(source, "config", "user.name", "Paseo Test");
  git(source, "config", "user.email", "paseo@example.com");
  writeFileSync(path.join(source, "branch.txt"), "main\n");
  git(source, "add", "branch.txt");
  git(source, "commit", "-m", "main");
  git(source, "checkout", "-b", "feature/payment");
  writeFileSync(path.join(source, "branch.txt"), "feature\n");
  git(source, "commit", "-am", "feature");
  git(source, "checkout", "main");
  git(root, "clone", "--bare", source, remote);
  return { remote, source };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("syncProjectGitResources", () => {
  it("downloads the configured Project branch into the managed repos directory", async () => {
    const { remote } = createRemoteRepository();
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-project-root-"));
    roots.push(projectRoot);

    const resources = await syncProjectGitResources({
      projectRoot,
      projectConfig: {
        directories: {
          project: [
            {
              type: "git-repository",
              repository: remote,
              branch: "feature/payment",
              directory: "service",
            },
          ],
        },
      },
    });

    const destination = path.join(projectRoot, "repos", "service");
    expect(resources).toMatchObject([
      {
        destination,
        branch: "feature/payment",
        role: "project",
      },
    ]);
    expect(readFileSync(path.join(destination, "branch.txt"), "utf8")).toBe("feature\n");
    expect(git(destination, "branch", "--show-current")).toBe("feature/payment");
  }, 20_000);

  it("downloads Git-backed general knowledge and does not overwrite dirty work", async () => {
    const { remote } = createRemoteRepository();
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-project-root-"));
    roots.push(projectRoot);
    const destination = path.join(projectRoot, "repos", "runbooks");
    const baseConfig = {
      knowledge: {
        general: [
          {
            type: "git-repository" as const,
            source: remote,
            branch: "main",
            directory: "runbooks",
          },
        ],
      },
    };

    await syncProjectGitResources({ projectRoot, projectConfig: baseConfig });
    expect(existsSync(path.join(destination, ".git"))).toBe(true);
    writeFileSync(path.join(destination, "branch.txt"), "local change\n");

    await expect(
      syncProjectGitResources({
        projectRoot,
        projectConfig: {
          knowledge: {
            general: [
              {
                ...baseConfig.knowledge.general[0],
                branch: "feature/payment",
              },
            ],
          },
        },
      }),
    ).rejects.toThrow("有未提交改动");
    expect(readFileSync(path.join(destination, "branch.txt"), "utf8")).toBe("local change\n");
  }, 20_000);

  it("rejects two different remotes that target the same repos directory", async () => {
    const first = createRemoteRepository();
    const second = createRemoteRepository();
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-project-root-"));
    roots.push(projectRoot);

    await expect(
      syncProjectGitResources({
        projectRoot,
        projectConfig: {
          directories: {
            project: [
              {
                type: "git-repository",
                repository: first.remote,
                directory: "shared",
              },
            ],
          },
          knowledge: {
            general: [
              {
                type: "git-repository",
                source: second.remote,
                directory: "shared",
              },
            ],
          },
        },
      }),
    ).rejects.toThrow("Git 仓库目录冲突");
  }, 20_000);
});
