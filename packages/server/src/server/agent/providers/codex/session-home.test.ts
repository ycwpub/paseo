import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { resolveCodexSessionHome } from "./session-home.js";

const temporaryDirectories: string[] = [];

async function createTemporaryHome(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "paseo-codex-home-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function writeRollout(codexHome: string, relativeDirectory: string, threadId: string) {
  const directory = path.join(codexHome, relativeDirectory);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `rollout-2026-08-24T12-00-00-${threadId}.jsonl`), "{}\n");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("resolveCodexSessionHome", () => {
  test("finds an active rollout in the Aiden Codex home", async () => {
    const homeDir = await createTemporaryHome();
    const codexHome = path.join(homeDir, ".codex", "aiden-app-home");
    const threadId = "01a02363-3217-7ac3-a3fd-cfbbd1d60bb6";
    await writeRollout(codexHome, "sessions/2026/08/21", threadId);

    await expect(resolveCodexSessionHome(threadId, { homeDir })).resolves.toBe(codexHome);
  });

  test("finds an archived rollout in an explicit Codex home", async () => {
    const homeDir = await createTemporaryHome();
    const codexHome = path.join(homeDir, "custom-codex-home");
    const threadId = "01999999-1111-7222-8333-abcdefabcdef";
    await writeRollout(codexHome, "archived_sessions", threadId);

    await expect(
      resolveCodexSessionHome(threadId, {
        codexHome,
        homeDir,
      }),
    ).resolves.toBe(codexHome);
  });

  test("returns undefined when no candidate contains the thread", async () => {
    const homeDir = await createTemporaryHome();

    await expect(
      resolveCodexSessionHome("01aaaaaaaaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee", { homeDir }),
    ).resolves.toBeUndefined();
  });
});
