import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { PaseoMemoryStore } from "./memory-store.js";

describe("PaseoMemoryStore", () => {
  let paseoHome: string;
  let store: PaseoMemoryStore;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-memory-"));
    store = new PaseoMemoryStore({ paseoHome, logger: pino({ level: "silent" }) });
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  test("stores a summary index and separate topic detail files", () => {
    const detail = store.upsertExtractedMemory({
      title: "Build workflow",
      category: "procedure",
      content: "Build the test app, install it, restart app and daemon, test, then commit.",
      keywords: ["build", "restart", "commit"],
      confidence: 0.97,
      sourceAgentId: "agent-1",
    });

    const state = store.getState();
    expect(state.details).toHaveLength(1);
    expect(state.details[0]).toMatchObject({
      id: detail.id,
      title: "Build workflow",
      category: "procedure",
      sourceAgentIds: ["agent-1"],
    });
    expect(state.summary).toContain("Build workflow");
    expect(state.summary).toContain(detail.path);
    expect(readFileSync(state.summaryPath, "utf8")).toBe(state.summary);
    expect(readFileSync(detail.path, "utf8")).toContain("Build the test app");
  });

  test("upserts the same topic instead of appending duplicate files", () => {
    store.upsertExtractedMemory({
      title: "Build workflow",
      category: "procedure",
      content: "Build and test before committing.",
      keywords: ["build"],
      confidence: 0.8,
      sourceAgentId: "agent-1",
    });
    store.upsertExtractedMemory({
      title: "Build workflow",
      category: "procedure",
      content: "Build, install, restart, test, and commit.",
      keywords: ["build", "install"],
      confidence: 0.95,
      sourceAgentId: "agent-2",
    });

    const state = store.getState();
    expect(state.details).toHaveLength(1);
    expect(state.details[0]?.content).toBe("Build, install, restart, test, and commit.");
    expect(state.details[0]?.sourceAgentIds).toEqual(["agent-1", "agent-2"]);
  });

  test("disabling memory preserves files while clear removes them", () => {
    const detail = store.upsertExtractedMemory({
      title: "Preference",
      category: "preference",
      content: "Prefer concise answers.",
      keywords: ["concise"],
      confidence: 1,
      sourceAgentId: "agent-1",
    });
    store.update({ settings: { ...store.getState().settings, enabled: false } });

    expect(store.getState().settings.enabled).toBe(false);
    expect(existsSync(detail.path)).toBe(true);

    const cleared = store.clear();
    expect(cleared.details).toEqual([]);
    expect(existsSync(detail.path)).toBe(false);
  });
});
