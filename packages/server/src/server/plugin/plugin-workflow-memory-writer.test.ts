import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PaseoMemoryStore } from "../memory/memory-store.js";
import { PluginWorkflowMemoryStoreWriter } from "./plugin-workflow-memory-writer.js";

describe("PluginWorkflowMemoryStoreWriter", () => {
  let paseoHome: string;
  let store: PaseoMemoryStore;
  let writer: PluginWorkflowMemoryStoreWriter;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-plugin-memory-"));
    store = new PaseoMemoryStore({
      paseoHome,
      logger: pino({ level: "silent" }),
    });
    writer = new PluginWorkflowMemoryStoreWriter(store);
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  it("writes one explicit entry to global, project, and assistant scopes", async () => {
    await writer.write({
      pluginId: "byte-development",
      serviceName: "development",
      outputPath: "memory",
      result: {
        memory: {
          targets: [
            { type: "global" },
            { type: "project", id: "project-1" },
            { type: "assistant", id: "assistant-1" },
            { type: "project", id: "project-1" },
          ],
          entries: [
            {
              title: "Architecture decision",
              category: "decision",
              content: "Use one isolated run directory for every deployment workflow.",
              keywords: ["architecture", "workflow"],
              confidence: 0.95,
              importance: 0.9,
            },
          ],
        },
      },
    });

    const details = store.getState().details;
    expect(details).toHaveLength(3);
    expect(details.map((detail) => detail.scope)).toEqual(
      expect.arrayContaining([
        { type: "global" },
        { type: "project", id: "project-1" },
        { type: "assistant", id: "assistant-1" },
      ]),
    );
    expect(details.every((detail) => detail.origin === "explicit")).toBe(true);
    expect(
      details.every((detail) =>
        detail.sourceAgentIds.includes("plugin:byte-development/development"),
      ),
    ).toBe(true);
  });

  it("rejects secret-bearing memory content", async () => {
    await writer.write({
      pluginId: "byte-development",
      serviceName: "development",
      outputPath: "payload.memory",
      result: {
        payload: {
          memory: {
            targets: [{ type: "global" }],
            entries: [
              {
                title: "Do not store this",
                category: "other",
                content: "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.secret.signature",
                keywords: [],
                confidence: 1,
                importance: 1,
              },
            ],
          },
        },
      },
    });

    expect(store.getState().details).toEqual([]);
  });

  it("fails when the configured output path is absent", async () => {
    await expect(
      writer.write({
        pluginId: "byte-development",
        serviceName: "development",
        outputPath: "memory",
        result: { status: "completed" },
      }),
    ).rejects.toThrow();
  });
});
