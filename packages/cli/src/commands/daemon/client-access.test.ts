import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadConfig } from "@getpaseo/server";
import { getClientAccessConfig, setClientAccessConfig } from "./client-access";

const tempDirs: string[] = [];

async function createPaseoHome(): Promise<string> {
  const paseoHome = await mkdtemp(path.join(os.tmpdir(), "paseo-client-access-cli-"));
  tempDirs.push(paseoHome);
  return paseoHome;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("client access CLI configuration", () => {
  test("reports approval validation as disabled by default", async () => {
    const paseoHome = await createPaseoHome();

    expect((await getClientAccessConfig({ home: paseoHome })).requireApproval).toBe(false);
  });

  test("disables approval validation for the next daemon startup", async () => {
    const paseoHome = await createPaseoHome();

    const result = await setClientAccessConfig(false, { home: paseoHome });

    expect(result).toMatchObject({
      action: "client_access_updated",
      applied: "next_start",
      requireApproval: false,
    });
    expect(loadConfig(paseoHome, { env: {} }).clientAccessRequireApproval).toBe(false);
  });

  test("enables approval validation again", async () => {
    const paseoHome = await createPaseoHome();
    await setClientAccessConfig(false, { home: paseoHome });

    const result = await setClientAccessConfig(true, { home: paseoHome });

    expect(result.requireApproval).toBe(true);
    expect((await getClientAccessConfig({ home: paseoHome })).requireApproval).toBe(true);
  });
});
