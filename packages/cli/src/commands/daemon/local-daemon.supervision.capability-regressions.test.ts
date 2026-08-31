import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { resolveLocalDaemonState } from "./local-daemon.js";
const tempRoots: string[] = [];
async function createPaseoHome(config: unknown): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "paseo-local-daemon-"));
  tempRoots.push(root);
  const paseoHome = path.join(root, ".paseo");
  await mkdir(paseoHome, { recursive: true });
  await writeFile(path.join(paseoHome, "config.json"), JSON.stringify(config, null, 2));
  return paseoHome;
}
describe("local daemon launch supervision", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
    vi.restoreAllMocks();
  });
  test("local daemon state does not synthesize a default public Relay", async () => {
    const home = await createPaseoHome({ version: 1 });
    const state = resolveLocalDaemonState({ home });
    expect(state.relayEnabled).toBe(false);
    expect(state.relayEndpoint).toBeNull();
  });
});
