import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
      scope: { type: "global", id: "default" },
    });
    expect(state.summary).toContain("Build workflow");
    expect(state.summary).toContain("Build the test app, install it, restart app and daemon");
    expect(state.summary).toContain("../../details/");
    expect(state.summary).not.toContain(detail.path);
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

  test("persists conversation and scope policies while clearing memory content", () => {
    const updated = store.update({
      policyUpdates: [
        {
          target: { type: "project", id: "project-1" },
          enabled: true,
          extractionInstructions: "Remember architecture decisions.",
        },
        {
          target: { type: "conversation", id: "agent-1" },
          enabled: false,
          extractionInstructions: "Remember confirmed conclusions.",
        },
      ],
      scopePolicyUpdates: [
        {
          scope: { type: "global" },
          enabled: true,
          extractionInstructions: "Remember stable preferences.",
        },
        {
          scope: { type: "workspace", id: "workspace-1" },
          enabled: false,
          extractionInstructions: "Remember reusable workspace procedures.",
        },
      ],
    });

    expect(updated.policies).toEqual([
      {
        target: { type: "project", id: "project-1" },
        enabled: true,
        extractionInstructions: "Remember architecture decisions.",
      },
      {
        target: { type: "conversation", id: "agent-1" },
        enabled: false,
        extractionInstructions: "Remember confirmed conclusions.",
      },
    ]);
    expect(updated.scopePolicies).toEqual([
      {
        scope: { type: "global", id: "default" },
        enabled: true,
        extractionInstructions: "Remember stable preferences.",
      },
      {
        scope: { type: "workspace", id: "workspace-1" },
        enabled: false,
        extractionInstructions: "Remember reusable workspace procedures.",
      },
    ]);
    expect(store.clear().policies).toEqual(updated.policies);
    expect(store.getState().scopePolicies).toEqual(updated.scopePolicies);

    const reloaded = new PaseoMemoryStore({
      paseoHome,
      logger: pino({ level: "silent" }),
    });
    expect(reloaded.getState().policies).toEqual(updated.policies);
    expect(reloaded.getState().scopePolicies).toEqual(updated.scopePolicies);
  });

  test("keeps explicit memory authoritative over later automatic extraction", () => {
    const explicit = store.upsertExtractedMemory({
      title: "Answer style",
      category: "preference",
      content: "Always answer in concise Chinese.",
      keywords: ["Chinese", "concise"],
      confidence: 1,
      sourceAgentId: "user",
      origin: "explicit",
    });

    store.upsertExtractedMemory({
      title: "Answer style",
      category: "preference",
      content: "Answer with long English explanations.",
      keywords: ["English"],
      confidence: 0.9,
      sourceAgentId: "agent-2",
      origin: "automatic",
    });

    const state = store.getState();
    expect(state.details).toHaveLength(1);
    expect(state.details[0]).toMatchObject({
      id: explicit.id,
      content: "Always answer in concise Chinese.",
      origin: "explicit",
      sourceAgentIds: ["user", "agent-2"],
    });
  });

  test("isolates global memory by the selected user while sharing narrower scopes", () => {
    const defaultMemory = store.upsertExtractedMemory({
      title: "Answer language",
      category: "preference",
      content: "Use Chinese.",
      keywords: ["Chinese"],
      confidence: 1,
      sourceAgentId: "agent-1",
    });
    store.upsertExtractedMemory({
      title: "Shared project rule",
      category: "project",
      content: "Run tests before commit.",
      keywords: ["tests"],
      confidence: 1,
      sourceAgentId: "agent-1",
      scope: { type: "project", id: "project-1" },
    });

    const created = store.update({
      userOperation: { type: "create", name: "第二位用户" },
    });
    expect(created.users).toHaveLength(2);
    expect(created.users?.find((user) => user.id === created.activeUserId)?.name).toBe(
      "第二位用户",
    );
    expect(created.details.map((detail) => detail.title)).toEqual(["Shared project rule"]);
    expect(created.summary).not.toContain("Answer language");

    const secondMemory = store.upsertExtractedMemory({
      title: "Answer language",
      category: "preference",
      content: "Use English.",
      keywords: ["English"],
      confidence: 1,
      sourceAgentId: "agent-2",
    });
    expect(secondMemory.scope).toEqual({ type: "global", id: created.activeUserId });

    const selectedDefault = store.update({
      userOperation: { type: "select", id: "default" },
    });
    expect(selectedDefault.details.map((detail) => detail.id)).toContain(defaultMemory.id);
    expect(selectedDefault.details.map((detail) => detail.id)).not.toContain(secondMemory.id);
    expect(selectedDefault.details.map((detail) => detail.title)).toContain("Shared project rule");
    expect(selectedDefault.summary).toContain("Answer language");
    expect(selectedDefault.summaryPath).toContain("/memory/users/default/summary.md");

    const lateSecondUserMemory = store.upsertExtractedMemory({
      title: "Captured turn preference",
      category: "preference",
      content: "This turn still belongs to the second user.",
      keywords: ["captured"],
      confidence: 1,
      sourceAgentId: "agent-2",
      scope: { type: "global", id: created.activeUserId },
    });
    expect(store.getState().details.map((detail) => detail.id)).not.toContain(
      lateSecondUserMemory.id,
    );
    expect(
      store
        .getDetailsForScopes([{ type: "global", id: created.activeUserId }])
        .map((detail) => detail.id),
    ).toContain(lateSecondUserMemory.id);
  });

  test("renames and deletes a global memory user with its files and policy", () => {
    const created = store.update({
      userOperation: { type: "create", name: "临时用户" },
      scopePolicyUpdates: [
        {
          scope: { type: "global" },
          enabled: true,
          extractionInstructions: "Only remember stable preferences.",
        },
      ],
    });
    const userId = created.activeUserId!;
    const detail = store.upsertExtractedMemory({
      title: "Temporary preference",
      category: "preference",
      content: "Temporary content.",
      keywords: [],
      confidence: 1,
      sourceAgentId: "agent-1",
    });
    const renamed = store.update({
      userOperation: { type: "rename", id: userId, name: "已重命名用户" },
    });
    expect(renamed.users?.find((user) => user.id === userId)?.name).toBe("已重命名用户");

    const deleted = store.update({
      userOperation: { type: "delete", id: userId },
    });
    expect(deleted.activeUserId).toBe("default");
    expect(deleted.users).toEqual([expect.objectContaining({ id: "default" })]);
    expect(deleted.scopePolicies).not.toContainEqual(
      expect.objectContaining({ scope: { type: "global", id: userId } }),
    );
    expect(existsSync(detail.path)).toBe(false);
  });

  test("does not delete the last global memory user", () => {
    expect(() => store.update({ userOperation: { type: "delete", id: "default" } })).toThrow(
      "At least one global memory user must remain",
    );
  });

  test("preserves superseded revisions for changed durable facts", () => {
    const original = store.upsertExtractedMemory({
      title: "Primary editor",
      category: "fact",
      content: "The user uses Vim.",
      keywords: ["editor"],
      confidence: 0.9,
      sourceAgentId: "agent-1",
    });
    const replacement = store.upsertExtractedMemory({
      title: "Primary editor",
      category: "fact",
      content: "The user now uses Zed.",
      keywords: ["editor", "Zed"],
      confidence: 0.95,
      sourceAgentId: "agent-2",
    });

    const state = store.getState();
    expect(state.details).toHaveLength(2);
    expect(state.details.find((detail) => detail.id === original.id)?.status).toBe("superseded");
    expect(state.details.find((detail) => detail.id === replacement.id)).toMatchObject({
      status: "active",
      supersedes: [original.id],
      content: "The user now uses Zed.",
    });
  });

  test("records answer usage and applies user feedback", () => {
    const detail = store.upsertExtractedMemory({
      title: "Deployment",
      category: "procedure",
      content: "Build before restarting.",
      keywords: ["build"],
      confidence: 0.9,
      sourceAgentId: "agent-1",
    });

    store.recordUsage({
      agentId: "agent-2",
      turnId: "turn-1",
      assistantMessageId: "message-1",
      memoryIds: [detail.id],
    });
    store.update({ feedback: [{ id: detail.id, value: "helpful" }] });
    const updated = store.update({
      feedback: [{ id: detail.id, value: "outdated" }],
    });

    expect(updated.recentUsages).toEqual([
      expect.objectContaining({
        agentId: "agent-2",
        turnId: "turn-1",
        assistantMessageId: "message-1",
        memoryIds: [detail.id],
      }),
    ]);
    expect(updated.details[0]).toMatchObject({
      useCount: 1,
      helpfulCount: 1,
      status: "expired",
    });
  });

  test("exports and merges memories without overwriting colliding ids", () => {
    const original = store.upsertExtractedMemory({
      id: "shared-id",
      title: "Original",
      category: "fact",
      content: "Original content.",
      keywords: [],
      confidence: 1,
      sourceAgentId: "agent-1",
      origin: "explicit",
    });
    const exported = store.getState().exportJson;
    if (!exported) throw new Error("Expected memory export");

    store.update({
      importJson: exported,
      replaceOnImport: false,
    });

    const state = store.getState();
    expect(state.details).toHaveLength(2);
    expect(state.details.filter((detail) => detail.content === "Original content.")).toHaveLength(
      2,
    );
    expect(new Set(state.details.map((detail) => detail.id)).size).toBe(2);
    expect(state.details.some((detail) => detail.id === original.id)).toBe(true);
  });

  test("merges host snapshots idempotently across users and scopes", () => {
    const source = new PaseoMemoryStore({
      paseoHome,
      logger: pino({ level: "silent" }),
      serverId: "host-source",
    });
    source.upsertExtractedMemory({
      id: "shared-id",
      title: "Project convention",
      category: "project",
      content: "Run focused tests before committing.",
      keywords: ["tests"],
      confidence: 1,
      sourceAgentId: "agent-source",
      scope: { type: "project", id: "project-1" },
    });
    source.update({ userOperation: { type: "create", name: "同步用户" } });
    const sourceUserId = source.getState().activeUserId!;
    source.upsertExtractedMemory({
      title: "Answer language",
      category: "preference",
      content: "Prefer concise Chinese.",
      keywords: ["Chinese"],
      confidence: 1,
      sourceAgentId: "agent-source",
      scope: { type: "global", id: sourceUserId },
    });
    source.update({
      scopePolicyUpdates: [
        {
          scope: { type: "global", id: sourceUserId },
          enabled: true,
          extractionInstructions: "Save stable preferences.",
        },
      ],
    });

    const target = new PaseoMemoryStore({
      paseoHome: path.join(paseoHome, "target"),
      logger: pino({ level: "silent" }),
      serverId: "host-target",
    });
    target.upsertExtractedMemory({
      id: "shared-id",
      title: "Target fact",
      category: "fact",
      content: "Keep target-only memory.",
      keywords: [],
      confidence: 1,
      sourceAgentId: "agent-target",
    });

    const sourceSnapshot = source.getSyncSnapshot();
    target.mergeSyncSnapshot(sourceSnapshot);
    const firstMerge = target.getSyncSnapshot();
    target.mergeSyncSnapshot(sourceSnapshot);
    const secondMerge = target.getSyncSnapshot();

    expect(firstMerge.details).toHaveLength(3);
    expect(secondMerge.details).toHaveLength(3);
    expect(secondMerge.users.some((user) => user.name === "同步用户")).toBe(true);
    expect(
      secondMerge.details.find((detail) => detail.title === "Project convention"),
    ).toMatchObject({
      scope: { type: "project", id: "project-1" },
      syncOrigin: { hostId: "host-source", memoryId: "shared-id" },
    });
    expect(
      secondMerge.scopePolicies.some(
        (policy) =>
          policy.scope.type === "global" &&
          policy.scope.id === sourceUserId &&
          policy.extractionInstructions === "Save stable preferences.",
      ),
    ).toBe(true);

    source.mergeSyncSnapshot(target.getSyncSnapshot());
    expect(source.getSyncSnapshot().details).toHaveLength(3);
    source.mergeSyncSnapshot(target.getSyncSnapshot());
    expect(source.getSyncSnapshot().details).toHaveLength(3);
  });

  test("encrypts summary and details at rest while returning plaintext state", () => {
    const detail = store.upsertExtractedMemory({
      title: "Private preference",
      category: "preference",
      content: "Prefer private local storage.",
      keywords: ["private"],
      confidence: 1,
      sourceAgentId: "user",
      origin: "explicit",
    });
    const encrypted = store.update({
      settings: { ...store.getState().settings, encryptAtRest: true },
    });

    expect(encrypted.details[0]?.content).toBe("Prefer private local storage.");
    expect(readFileSync(encrypted.summaryPath, "utf8")).toMatch(/^PASEO_MEMORY_ENCRYPTED_V1/);
    expect(readFileSync(detail.path, "utf8")).toMatch(/^PASEO_MEMORY_ENCRYPTED_V1/);

    const decrypted = store.update({
      settings: { ...encrypted.settings, encryptAtRest: false },
    });
    expect(readFileSync(decrypted.summaryPath, "utf8")).toBe(decrypted.summary);
    expect(readFileSync(detail.path, "utf8")).toBe("Prefer private local storage.");
  });

  test("migrates the previous single-user catalog and summary to the default user", async () => {
    store.upsertExtractedMemory({
      title: "Legacy global memory",
      category: "preference",
      content: "Keep this legacy preference.",
      keywords: ["legacy"],
      confidence: 1,
      sourceAgentId: "agent-1",
    });
    const memoryPath = path.join(paseoHome, "memory");
    const catalogPath = path.join(memoryPath, "catalog.json");
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Record<string, unknown>;
    const details = structuredClone(catalog.details) as Array<Record<string, unknown>>;
    for (const detail of details) detail.scope = { type: "global" };
    await rm(path.join(memoryPath, "users"), { recursive: true, force: true });
    await writeFile(
      path.join(memoryPath, "summary.md"),
      "# Legacy summary\n\n<!-- paseo:memory-detail-index -->\n\nLegacy index",
    );
    await writeFile(
      catalogPath,
      JSON.stringify({
        version: 2,
        settings: catalog.settings,
        details,
        recentUsages: catalog.recentUsages,
        lastExtractedAt: catalog.lastExtractedAt,
        lastExtractionError: catalog.lastExtractionError,
        lastConsolidatedAt: catalog.lastConsolidatedAt,
        policies: catalog.policies,
        scopePolicies: catalog.scopePolicies,
      }),
    );

    const migrated = new PaseoMemoryStore({
      paseoHome,
      logger: pino({ level: "silent" }),
    }).getState();
    expect(migrated.activeUserId).toBe("default");
    expect(migrated.users).toEqual([expect.objectContaining({ id: "default", name: "默认用户" })]);
    expect(migrated.details[0]?.scope).toEqual({ type: "global", id: "default" });
    expect(migrated.summary).toContain("# Legacy summary");
    expect(migrated.summaryPath).toContain("/memory/users/default/summary.md");
    expect(JSON.parse(readFileSync(catalogPath, "utf8"))).toMatchObject({ version: 3 });
  });

  test("migrates a version 1 catalog without losing memory", async () => {
    const detail = store.upsertExtractedMemory({
      title: "Migrated memory",
      category: "fact",
      content: "This survives migration.",
      keywords: ["migration"],
      confidence: 1,
      sourceAgentId: "agent-1",
    });
    const catalogPath = path.join(paseoHome, "memory", "catalog.json");
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Record<string, unknown>;
    await writeFile(
      catalogPath,
      JSON.stringify({
        version: 1,
        settings: catalog.settings,
        details: catalog.details,
        lastExtractedAt: catalog.lastExtractedAt,
        lastExtractionError: catalog.lastExtractionError,
      }),
    );

    const migratedStore = new PaseoMemoryStore({
      paseoHome,
      logger: pino({ level: "silent" }),
    });
    const migrated = migratedStore.getState();

    expect(migrated.details).toHaveLength(1);
    expect(migrated.details[0]).toMatchObject({
      id: detail.id,
      content: "This survives migration.",
      scope: { type: "global", id: "default" },
      origin: "automatic",
      status: "active",
    });
    expect(migrated.users).toEqual([expect.objectContaining({ id: "default", name: "默认用户" })]);
    expect(migrated.activeUserId).toBe("default");
    expect(JSON.parse(readFileSync(catalogPath, "utf8"))).toMatchObject({ version: 3 });
  });
});
