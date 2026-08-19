import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { describe, expect, test } from "vitest";
import type {
  AgentAppendSystemPromptComposer,
  AgentManager,
  AgentPromptContextComposer,
  ManagedAgent,
} from "../agent/agent-manager.js";
import { PaseoMemoryService } from "./memory-service.js";
import { PaseoMemoryStore } from "./memory-store.js";

describe("PaseoMemoryService prompt integration", () => {
  test("keeps user input unchanged and exposes only the total memory path through system prompt", async () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-memory-service-"));
    const logger = pino({ level: "silent" });
    const store = new PaseoMemoryStore({ paseoHome, logger });
    store.update({
      settings: {
        ...store.getState().settings,
        enabled: true,
      },
    });
    store.upsertExtractedMemory({
      title: "Build workflow",
      category: "procedure",
      content: "Build, install, restart, test, then commit.",
      keywords: ["build"],
      confidence: 1,
      importance: 1,
      sourceAgentId: "agent-1",
      origin: "explicit",
      scope: { type: "global" },
    });

    let promptComposer: AgentPromptContextComposer | null = null;
    let systemPromptComposer: AgentAppendSystemPromptComposer | null = null;
    const agentManager = {
      setPromptContextComposer: (composer: AgentPromptContextComposer | null) => {
        promptComposer = composer;
      },
      setAgentAppendSystemPromptComposer: (composer: AgentAppendSystemPromptComposer | null) => {
        systemPromptComposer = composer;
      },
      subscribe: () => () => undefined,
    } as unknown as AgentManager;
    const service = new PaseoMemoryService({
      store,
      paseoHome,
      agentManager,
      providerSnapshotManager: {
        listProviders: async () => [],
      },
      readDaemonConfig: () => ({}),
      logger,
    });
    service.start();

    const agent = {
      id: "agent-1",
      cwd: paseoHome,
      labels: {},
      config: { provider: "codex", cwd: paseoHome },
      internal: false,
    } as ManagedAgent;
    const userInput = "Please build and restart Paseo.";
    await expect(promptComposer!.compose(agent, userInput)).resolves.toBe(userInput);

    const systemPrompt = systemPromptComposer!("agent-1", agent.config);
    const totalMemoryPath = path.join(paseoHome, "memory", "agent-indexes", "agent-1.md");
    expect(systemPrompt).toContain(`Total memory document path: ${totalMemoryPath}`);
    expect(systemPrompt).not.toContain("Build, install, restart, test, then commit.");
    expect(systemPrompt).not.toContain("../details/");

    expect(existsSync(totalMemoryPath)).toBe(true);
    const totalMemory = readFileSync(totalMemoryPath, "utf8");
    expect(totalMemory).toContain("Build workflow");
    expect(totalMemory).toContain("Build, install, restart, test, then commit.");
    expect(totalMemory).toContain("../details/");
  });
});
