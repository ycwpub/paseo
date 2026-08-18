import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PluginHttpJobStore } from "./plugin-http-job-store.js";

describe("PluginHttpJobStore", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("persists jobs and marks interrupted jobs failed after restart", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-http-jobs-"));
    const directory = path.join(tempRoot, "jobs");
    const store = new PluginHttpJobStore(directory);
    store.initialize("2026-08-18T08:00:00.000Z");
    const created = await store.create({
      pluginId: "demo-plugin",
      serviceName: "processor",
      input: { question: "hello" },
      createdAt: "2026-08-18T08:01:00.000Z",
    });
    await store.update(created.id, (job) => ({
      ...job,
      status: "running",
      startedAt: "2026-08-18T08:02:00.000Z",
    }));

    const reloaded = new PluginHttpJobStore(directory);
    reloaded.initialize("2026-08-18T08:03:00.000Z");

    expect(reloaded.get(created.id)).toMatchObject({
      status: "failed",
      errorCode: "DAEMON_RESTARTED",
      endedAt: "2026-08-18T08:03:00.000Z",
      input: { question: "hello" },
    });
  });
});
