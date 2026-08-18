import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { retrieveRelevantMemoryDetails } from "./memory-retrieval.js";
import { PaseoMemoryStore } from "./memory-store.js";

describe("memory quality evaluation", () => {
  let paseoHome: string;
  let store: PaseoMemoryStore;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-memory-eval-"));
    store = new PaseoMemoryStore({ paseoHome, logger: pino({ level: "silent" }) });
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  test("retrieves the right scoped preference without leaking another project", () => {
    store.upsertExtractedMemory({
      title: "Response language",
      category: "preference",
      content: "Use concise Chinese answers.",
      keywords: ["Chinese", "concise"],
      confidence: 1,
      sourceAgentId: "user",
      origin: "explicit",
      scope: { type: "global" },
    });
    store.upsertExtractedMemory({
      title: "Release command",
      category: "procedure",
      content: "Run npm run release:a.",
      keywords: ["release"],
      confidence: 0.95,
      sourceAgentId: "agent-a",
      scope: { type: "project", id: "project-a" },
    });
    store.upsertExtractedMemory({
      title: "Release command",
      category: "procedure",
      content: "Run npm run release:b.",
      keywords: ["release"],
      confidence: 0.95,
      sourceAgentId: "agent-b",
      scope: { type: "project", id: "project-b" },
    });

    const matches = retrieveRelevantMemoryDetails(
      "Please explain the release command in concise Chinese.",
      store.getState().details,
      {
        limit: 4,
        scopes: [{ type: "global" }, { type: "project", id: "project-a" }],
      },
    );

    expect(matches.map((detail) => detail.content)).toEqual([
      "Run npm run release:a.",
      "Use concise Chinese answers.",
    ]);
  });

  test("uses the latest active revision and rejects disputed knowledge", () => {
    const old = store.upsertExtractedMemory({
      title: "Default daemon port",
      category: "fact",
      content: "The daemon uses port 6767.",
      keywords: ["daemon", "port"],
      confidence: 0.9,
      sourceAgentId: "agent-1",
    });
    const latest = store.upsertExtractedMemory({
      title: "Default daemon port",
      category: "fact",
      content: "The daemon uses port 6769 in this environment.",
      keywords: ["daemon", "port"],
      confidence: 0.95,
      sourceAgentId: "agent-2",
    });
    store.update({ feedback: [{ id: latest.id, value: "incorrect" }] });

    const matches = retrieveRelevantMemoryDetails(
      "What port does the daemon use?",
      store.getState().details,
      { limit: 4 },
    );

    expect(store.getState().details.find((detail) => detail.id === old.id)?.status).toBe(
      "superseded",
    );
    expect(matches).toEqual([]);
  });

  test("keeps explicit corrections stable against automatic pollution", () => {
    const explicit = store.upsertExtractedMemory({
      title: "Preferred branch",
      category: "fact",
      content: "Use feature_paseo for Paseo feature work.",
      keywords: ["branch", "feature_paseo"],
      confidence: 1,
      sourceAgentId: "user",
      origin: "explicit",
    });
    store.upsertExtractedMemory({
      title: "Preferred branch",
      category: "fact",
      content: "Use main for Paseo feature work.",
      keywords: ["branch", "main"],
      confidence: 0.9,
      sourceAgentId: "agent-2",
      origin: "automatic",
    });

    expect(store.getState().details).toEqual([
      expect.objectContaining({
        id: explicit.id,
        origin: "explicit",
        content: "Use feature_paseo for Paseo feature work.",
        status: "active",
      }),
    ]);
  });
});
