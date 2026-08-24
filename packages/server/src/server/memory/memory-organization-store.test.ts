import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { PaseoMemoryStore } from "./memory-store.js";

describe("PaseoMemoryStore daily organization", () => {
  let paseoHome: string;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-memory-organization-"));
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  test("merges duplicate files and removes low-value automatic memory", async () => {
    const store = new PaseoMemoryStore({
      paseoHome,
      logger: pino({ level: "silent" }),
      resolveWorkspaceProjectId: (workspaceId) =>
        workspaceId === "workspace-1" ? "project-1" : null,
    });
    const duplicate = store.upsertExtractedMemory({
      title: "Concise answer preference",
      category: "preference",
      content: "Prefer concise Chinese answers.",
      keywords: ["concise"],
      confidence: 0.8,
      sourceAgentId: "agent-1",
      scope: { type: "project", id: "project-1" },
    });
    const lowValue = store.upsertExtractedMemory({
      title: "Temporary observation",
      category: "other",
      content: "A temporary observation that was never useful.",
      keywords: ["temporary"],
      confidence: 0.4,
      importance: 0.1,
      sourceAgentId: "agent-1",
      scope: { type: "project", id: "project-1" },
    });
    const exported = JSON.parse(store.getState().exportJson!) as {
      settings: object;
      summary: string;
      details: Array<Record<string, unknown>>;
    };
    const duplicateExport = structuredClone(
      exported.details.find((detail) => detail.id === duplicate.id)!,
    );
    duplicateExport.id = "imported-duplicate";
    duplicateExport.title = "Chinese answer style";
    duplicateExport.sourceAgentIds = ["agent-2"];
    duplicateExport.keywords = ["Chinese"];
    store.update({
      importJson: JSON.stringify({
        version: 2,
        exportedAt: "2026-08-25T00:00:00.000Z",
        settings: exported.settings,
        summary: exported.summary,
        details: [duplicateExport],
      }),
    });

    const catalogPath = path.join(paseoHome, "memory", "catalog.json");
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
      details: Array<Record<string, unknown>>;
    };
    for (const detail of catalog.details) {
      detail.createdAt = "2026-08-25T00:00:00.000Z";
      detail.updatedAt = "2026-08-25T00:00:00.000Z";
    }
    await writeFile(catalogPath, JSON.stringify(catalog, null, 2));

    const reloaded = new PaseoMemoryStore({
      paseoHome,
      logger: pino({ level: "silent" }),
      resolveWorkspaceProjectId: (workspaceId) =>
        workspaceId === "workspace-1" ? "project-1" : null,
    });
    const plan = reloaded.organizeOlderMemories(new Date("2026-08-26T00:00:00.000Z").getTime());
    const state = reloaded.getState();

    expect(plan.merges).toHaveLength(1);
    expect(plan.removeIds).toEqual([lowValue.id]);
    expect(state.details).toHaveLength(1);
    expect(state.details[0]).toMatchObject({
      scope: { type: "project", id: "project-1" },
      sourceAgentIds: expect.arrayContaining(["agent-1", "agent-2"]),
      keywords: expect.arrayContaining(["concise", "Chinese"]),
    });
    expect(existsSync(lowValue.path)).toBe(false);
    expect(existsSync(duplicate.path)).toBe(plan.merges[0]?.survivorId === duplicate.id);
  });
});
