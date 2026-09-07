import { describe, expect, test, vi } from "vitest";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  AgentSession,
  AgentSessionConfig,
  AgentStreamEvent,
  AgentUsage,
} from "../agent-sdk-types.js";
import {
  CodexAppServerAgentClient,
  CodexAppServerAgentSession,
  mapCodexPatchNotificationToToolCall,
  threadItemToTimeline,
} from "./codex-app-server-agent.js";
import { createFakeCodexAppServer } from "./codex/test-utils/fake-app-server.js";
import { createTestLogger } from "../../../test-utils/test-logger.js";
import { asInternals as castInternals, createStub } from "../../test-utils/class-mocks.js";
import { buildProviderRegistry } from "../provider-registry.js";
interface CollaborationModeRecord {
  name: string;
  mode?: string | null;
  model?: string | null;
  reasoning_effort?: string | null;
  developer_instructions?: string | null;
}
interface CodexSessionTestAccess {
  activeTurnStartParams: Record<string, unknown> | null;
  maxOutputTokensContinuationAttempts: number;
  latestUsage: AgentUsage | undefined;
  ensureThreadLoaded(): Promise<void>;
  handleToolApprovalRequest(params: unknown): Promise<unknown>;
  handleNotification(method: string, params: unknown): void;
  loadPersistedHistory(): Promise<void>;
  refreshResolvedCollaborationMode(): void;
  serviceTier: "fast" | null;
  planModeEnabled: boolean;
  collaborationModes: CollaborationModeRecord[];
  config: AgentSessionConfig;
  client: CodexClientLike | null;
  resolvedSandboxPolicy: Record<string, unknown> | null;
  currentThreadId: string | null;
}
interface CodexClientLike {
  request: (method: string, ...rest: unknown[]) => Promise<unknown>;
}
type CodexTestSession = AgentSession & {
  connected: boolean;
  currentThreadId: string | null;
  activeForegroundTurnId: string | null;
  client: CodexClientLike | null;
};
const CODEX_PROVIDER = "codex";
function createConfig(overrides: Partial<AgentSessionConfig> = {}): AgentSessionConfig {
  return {
    provider: CODEX_PROVIDER,
    cwd: "/tmp/codex-question-test",
    modeId: "auto",
    model: "gpt-5.4",
    ...overrides,
  };
}
describe("CodexAppServerAgentClient resolveCreateConfig", () => {
  test("defaults new root agents to auto mode", () => {
    const provider = new CodexAppServerAgentClient(createTestLogger());
    const result = provider.resolveCreateConfig({
      provider: "aiden-codex",
      requestedMode: undefined,
      featureValues: undefined,
      parent: null,
      unattended: false,
      availableModes: [
        { id: "auto", label: "Default Permissions" },
        { id: "full-access", label: "Full Access" },
      ],
    });
    expect(result).toEqual({ modeId: "auto", featureValues: undefined });
  });
  test("inherits mode from same-provider parents", () => {
    const provider = new CodexAppServerAgentClient(createTestLogger());
    const result = provider.resolveCreateConfig({
      provider: "aiden-codex",
      requestedMode: undefined,
      featureValues: undefined,
      parent: {
        provider: "aiden-codex",
        modeId: "full-access",
        isUnattended: false,
      },
      unattended: false,
      availableModes: [
        { id: "auto", label: "Default Permissions" },
        { id: "full-access", label: "Full Access" },
      ],
    });
    expect(result).toEqual({ modeId: "full-access", featureValues: undefined });
  });
});
function createSession(
  configOverrides: Partial<AgentSessionConfig> = {},
  options: {
    goalsEnabled?: boolean;
    autoReviewEnabled?: boolean;
  } = {},
): CodexTestSession {
  const session = new CodexAppServerAgentSession(
    createConfig(configOverrides),
    null,
    createTestLogger(),
    () => {
      throw new Error("Test session cannot spawn Codex app-server");
    },
    {},
    false,
    options.goalsEnabled === true,
    options.autoReviewEnabled === true,
  ) as CodexTestSession;
  session.connected = true;
  session.currentThreadId = "test-thread";
  session.activeForegroundTurnId = "test-turn";
  return session;
}
function asInternals(session: CodexTestSession): CodexSessionTestAccess {
  return castInternals<CodexSessionTestAccess>(session);
}
type CapturedFakeCodexRecord = Record<string, unknown>;
async function runCustomCodexProviderTurn(
  providerId: string,
  baseUrl: string,
): Promise<CapturedFakeCodexRecord[]> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "codex-custom-provider-"));
  const fakeAppServerPath = path.join(tempDir, "fake-codex-app-server.cjs");
  const capturedRequestsPath = path.join(tempDir, "requests.jsonl");
  writeFileSync(
    fakeAppServerPath,
    `
const fs = require("node:fs");

const capturePath = process.env.PASEO_FAKE_CODEX_CAPTURE;
let buffer = "";

fs.appendFileSync(capturePath, JSON.stringify({
  kind: "env",
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
}) + "\\n");

function record(method, params) {
  fs.appendFileSync(capturePath, JSON.stringify({ kind: "request", method, params }) + "\\n");
}

function resultFor(method) {
  if (method === "initialize") return {};
  if (method === "collaborationMode/list") return { data: [] };
  if (method === "skills/list") return { data: [] };
  if (method === "config/read") return { config: {} };
  if (method === "getUserSavedConfig") return { config: {} };
  if (method === "model/list") return { data: [{ id: "custom-model", isDefault: true }] };
  if (method === "thread/start") return { thread: { id: "thread-1" } };
  if (method === "turn/start") return {};
  return {};
}

process.stdin.on("data", (chunk) => {
  buffer += chunk.toString();
  for (;;) {
    const newlineIndex = buffer.indexOf("\\n");
    if (newlineIndex === -1) break;
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    record(message.method, message.params);
    process.stdout.write(JSON.stringify({ id: message.id, result: resultFor(message.method) }) + "\\n");
  }
});
`,
  );
  const registry = buildProviderRegistry(createTestLogger(), {
    providerOverrides: {
      [providerId]: {
        extends: "codex",
        label: "Custom Codex",
        command: [process.execPath, fakeAppServerPath],
        env: {
          OPENAI_API_KEY: "sk-custom",
          OPENAI_BASE_URL: baseUrl,
          PASEO_FAKE_CODEX_CAPTURE: capturedRequestsPath,
        },
      },
    },
  });
  const session = await registry[providerId].createClient(createTestLogger()).createSession({
    provider: providerId,
    cwd: "/workspace/project",
    modeId: "auto",
    model: "custom-model",
  });
  try {
    await session.startTurn("use the custom endpoint");
    return readFileSync(capturedRequestsPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as CapturedFakeCodexRecord);
  } finally {
    await session.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
}
function capturedThreadStartConfig(records: CapturedFakeCodexRecord[]): unknown {
  const threadStart = records.find((record) => record.method === "thread/start");
  const params = threadStart?.params as Record<string, unknown> | undefined;
  return params?.config;
}
describe("Codex app-server provider", () => {
  test("turn/start requests concise commentary progress updates", async () => {
    const session = createSession({ systemPrompt: "Project-specific instructions." });
    const request = vi.fn(async (method: string) => {
      if (method === "thread/loaded/list") {
        return { data: ["test-thread"] };
      }
      if (method === "turn/start") {
        return {};
      }
      throw new Error(`Unexpected request: ${method}`);
    });
    session.activeForegroundTurnId = null;
    session.client = createStub<CodexClientLike>({ request });
    await session.startTurn("Inspect the repository");
    const turnStartCall = request.mock.calls.find(([method]) => method === "turn/start");
    const params = turnStartCall?.[1] as Record<string, unknown> | undefined;
    expect(params?.developerInstructions).toEqual(expect.any(String));
    expect(params?.developerInstructions).toContain("Project-specific instructions.");
    expect(params?.developerInstructions).toContain(
      "brief progress updates sent as commentary messages",
    );
    expect(params?.developerInstructions).toContain("Never expose hidden chain-of-thought");
  });
  test("collaboration mode keeps concise commentary progress updates", async () => {
    const session = createSession({
      systemPrompt: "Project-specific instructions.",
      daemonAppendSystemPrompt: "Daemon-specific instructions.",
    });
    asInternals(session).collaborationModes = [
      {
        name: "Code",
        mode: "code",
        developer_instructions: "Built-in code mode instructions.",
      },
    ];
    asInternals(session).refreshResolvedCollaborationMode();
    const request = vi.fn(async (method: string) => {
      if (method === "thread/loaded/list") {
        return { data: ["test-thread"] };
      }
      if (method === "turn/start") {
        return {};
      }
      throw new Error(`Unexpected request: ${method}`);
    });
    session.activeForegroundTurnId = null;
    session.client = createStub<CodexClientLike>({ request });
    await session.startTurn("Inspect the repository");
    const turnStartCall = request.mock.calls.find(([method]) => method === "turn/start");
    const params = turnStartCall?.[1] as Record<string, unknown> | undefined;
    const collaborationMode = params?.collaborationMode as
      | {
          settings?: {
            developer_instructions?: unknown;
          };
        }
      | undefined;
    const developerInstructions = collaborationMode?.settings?.developer_instructions;
    expect(developerInstructions).toEqual(expect.any(String));
    expect(developerInstructions).toContain("Built-in code mode instructions.");
    expect(developerInstructions).toContain("Project-specific instructions.");
    expect(developerInstructions).toContain("Daemon-specific instructions.");
    expect(developerInstructions).toContain("brief progress updates sent as commentary messages");
    expect(developerInstructions).toContain("Never expose hidden chain-of-thought");
  });
  test("uses the Codex runtime default compact prompt", async () => {
    const requests: Array<{
      method: string;
      params: unknown;
    }> = [];
    const session = createSession({ thinkingOptionId: "medium" });
    session.currentThreadId = null;
    session.activeForegroundTurnId = null;
    session.client = {
      request: vi.fn(async (method: string, params: unknown) => {
        requests.push({ method, params });
        if (method === "thread/start") {
          return { thread: { id: "compact-prompt-thread" } };
        }
        if (method === "turn/start") {
          return {};
        }
        throw new Error(`Unexpected request: ${method}`);
      }),
    };
    await session.startTurn("keep this thread compact");
    const startCall = requests.find((request) => request.method === "thread/start");
    expect(startCall?.params).not.toHaveProperty("config.compact_prompt");
  });
  test("allows explicit Codex config to set a custom compact prompt", async () => {
    const requests: Array<{
      method: string;
      params: unknown;
    }> = [];
    const session = createSession({
      thinkingOptionId: "medium",
      providerOptions: {
        compact_prompt: "Use the workspace-specific compact prompt.",
      },
    });
    session.currentThreadId = null;
    session.activeForegroundTurnId = null;
    session.client = {
      request: vi.fn(async (method: string, params: unknown) => {
        requests.push({ method, params });
        if (method === "thread/start") {
          return { thread: { id: "custom-compact-prompt-thread" } };
        }
        if (method === "turn/start") {
          return {};
        }
        throw new Error(`Unexpected request: ${method}`);
      }),
    };
    await session.startTurn("keep the custom compact prompt");
    const startCall = requests.find((request) => request.method === "thread/start");
    expect(startCall?.params).toMatchObject({
      config: {
        compact_prompt: "Use the workspace-specific compact prompt.",
      },
    });
  });
  test("adds every other Project repository to Codex writable roots", async () => {
    const requests: Array<{
      method: string;
      params: unknown;
    }> = [];
    const session = createSession({
      thinkingOptionId: "medium",
      writableProjectDirectories: ["/tmp/codex-question-test", "/tmp/settle-charge-facade"],
      providerOptions: {
        sandbox_workspace_write: {
          writable_roots: ["/tmp/shared-cache"],
        },
      },
    });
    session.currentThreadId = null;
    session.activeForegroundTurnId = null;
    session.client = {
      request: vi.fn(async (method: string, params: unknown) => {
        requests.push({ method, params });
        if (method === "thread/start") {
          return { thread: { id: "multi-repository-thread" } };
        }
        if (method === "turn/start") {
          return {};
        }
        throw new Error(`Unexpected request: ${method}`);
      }),
    };
    await session.startTurn("update both repositories");
    const startCall = requests.find((request) => request.method === "thread/start");
    expect(startCall?.params).toMatchObject({
      config: {
        sandbox_workspace_write: {
          writable_roots: ["/tmp/shared-cache", "/tmp/settle-charge-facade"],
        },
      },
    });
  });
  test("forces workspace-write sandbox when Project reference directories are configured", async () => {
    const requests: Array<{
      method: string;
      params: unknown;
    }> = [];
    const session = createSession({
      modeId: "full-access",
      thinkingOptionId: "medium",
      readOnlyProjectDirectories: ["/tmp/reference"],
      providerOptions: {
        sandbox_mode: "danger-full-access",
      },
    });
    session.currentThreadId = null;
    session.activeForegroundTurnId = null;
    session.client = {
      request: vi.fn(async (method: string, params: unknown) => {
        requests.push({ method, params });
        if (method === "thread/start") {
          return { thread: { id: "read-only-reference-thread" } };
        }
        if (method === "turn/start") {
          return {};
        }
        throw new Error(`Unexpected request: ${method}`);
      }),
    };
    await session.startTurn("inspect the reference project");
    const startCall = requests.find((request) => request.method === "thread/start");
    expect(startCall?.params).toMatchObject({
      sandbox: "workspace-write",
      config: {
        sandbox_mode: "workspace-write",
      },
    });
  });
  test("adds Project repositories to an already resolved Codex workspace-write policy", async () => {
    const session = createSession({
      modeId: "auto",
      writableProjectDirectories: ["/tmp/codex-question-test", "/tmp/settle-charge-facade"],
    });
    const request = vi.fn(async (method: string) => {
      if (method === "thread/loaded/list") return { data: ["test-thread"] };
      if (method === "turn/start") return {};
      throw new Error(`Unexpected request: ${method}`);
    });
    session.activeForegroundTurnId = null;
    session.client = createStub<CodexClientLike>({ request });
    asInternals(session).resolvedSandboxPolicy = {
      type: "workspaceWrite",
      networkAccess: false,
      writableRoots: ["/tmp/shared-cache"],
    };
    await session.startTurn("update the second repository");
    const turnStartCall = request.mock.calls.find(([method]) => method === "turn/start");
    expect(turnStartCall?.[1]).toEqual(
      expect.objectContaining({
        sandboxPolicy: {
          type: "workspaceWrite",
          networkAccess: false,
          writableRoots: ["/tmp/shared-cache", "/tmp/settle-charge-facade"],
        },
      }),
    );
  });
  test("persists the Codex home returned by app-server initialization", async () => {
    const appServer = createFakeCodexAppServer({
      initialize: () => ({ codexHome: "/tmp/aiden-app-home" }),
      "collaborationMode/list": () => ({ data: [] }),
      "skills/list": () => ({ data: [] }),
    });
    const session = new CodexAppServerAgentSession(
      createConfig({ cwd: "/workspace/project" }),
      null,
      createTestLogger(),
      async () => appServer.child,
    );
    await session.connect();
    castInternals<CodexSessionTestAccess>(session).currentThreadId = "thread-with-custom-home";
    expect(session.describePersistence()?.metadata.codexHome).toBe("/tmp/aiden-app-home");
    appServer.assertNoErrors();
    await session.close();
  });
  test("resumes a persisted thread with its recorded Codex home", async () => {
    const appServer = createFakeCodexAppServer();
    const provider = new CodexAppServerAgentClient(createTestLogger());
    const launchEnvironments: Array<Record<string, string> | undefined> = [];
    const internals = castInternals<{
      goalsEnabledPromise: Promise<boolean> | null;
      autoReviewEnabledPromise: Promise<boolean> | null;
      spawnAppServer: (
        launchEnv?: Record<string, string>,
      ) => Promise<ChildProcessWithoutNullStreams>;
    }>(provider);
    internals.goalsEnabledPromise = Promise.resolve(false);
    internals.autoReviewEnabledPromise = Promise.resolve(false);
    internals.spawnAppServer = async (launchEnv) => {
      launchEnvironments.push(launchEnv);
      return appServer.child;
    };
    const session = await provider.resumeSession({
      sessionId: "thread-with-custom-home",
      metadata: {
        cwd: "/tmp/codex-question-test",
        modeId: "auto",
        model: "gpt-5.4",
        codexHome: "/tmp/aiden-app-home",
      },
    });
    expect(launchEnvironments).toEqual([{ CODEX_HOME: "/tmp/aiden-app-home" }]);
    appServer.assertNoErrors();
    await session.close();
  });
  test("configures Codex app-server to use a custom provider base URL", async () => {
    const capturedRequests = await runCustomCodexProviderTurn(
      "codex-iisb",
      "https://custom-relay.example.com",
    );
    expect(capturedRequests[0]).toEqual({
      kind: "env",
      OPENAI_API_KEY: "sk-custom",
      OPENAI_BASE_URL: "https://custom-relay.example.com",
    });
    expect(capturedThreadStartConfig(capturedRequests)).toMatchObject({
      model_provider: "codex-iisb",
      model_providers: {
        "codex-iisb": {
          name: "Custom Codex",
          base_url: "https://custom-relay.example.com/v1",
          env_key: "OPENAI_API_KEY",
          requires_openai_auth: false,
          wire_api: "responses",
        },
      },
    });
  });
  test("does not append v1 twice for custom Codex provider base URLs", async () => {
    const capturedRequests = await runCustomCodexProviderTurn(
      "codex-custom",
      "https://custom-relay.example.com/v1/",
    );
    expect(capturedThreadStartConfig(capturedRequests)).toMatchObject({
      model_provider: "codex-custom",
      model_providers: {
        "codex-custom": expect.objectContaining({
          base_url: "https://custom-relay.example.com/v1",
        }),
      },
    });
  });
  test("maps Codex commentary messages to reasoning and final answers to assistant output", () => {
    expect(
      threadItemToTimeline({
        type: "agentMessage",
        id: "commentary-history",
        phase: "commentary",
        text: "Inspecting the provider stream.",
      }),
    ).toEqual({
      type: "reasoning",
      text: "Inspecting the provider stream.",
    });
    expect(
      threadItemToTimeline({
        type: "agentMessage",
        id: "final-history",
        phase: "final_answer",
        text: "The provider is fixed.",
      }),
    ).toEqual({
      type: "assistant_message",
      messageId: "final-history",
      text: "The provider is fixed.",
    });
  });
  test("extracts Codex reasoning text from structured summary entries", () => {
    expect(
      threadItemToTimeline({
        type: "reasoning",
        id: "structured-reasoning",
        summary: [{ type: "summary_text", text: "Inspecting the provider stream." }],
      }),
    ).toEqual({
      type: "reasoning",
      text: "Inspecting the provider stream.",
    });
  });
  test("maps patch notifications with object-style single change payloads", () => {
    const item = mapCodexPatchNotificationToToolCall({
      callId: "patch-object-single",
      changes: {
        path: "/tmp/repo/src/object-single.ts",
        kind: "modify",
        patch: "@@\n-before\n+after\n",
      },
      cwd: "/tmp/repo",
      running: false,
    });
    expect(item.detail.type).toBe("edit");
    if (item.detail.type === "edit") {
      expect(item.detail.filePath).toBe("src/object-single.ts");
      expect(item.detail.unifiedDiff).toContain("-before");
      expect(item.detail.unifiedDiff).toContain("+after");
      expect(item.detail.newString).toBeUndefined();
    }
  });
  test("keeps Codex commentary separate from final answers in persisted history", async () => {
    const session = createSession();
    session.client = {
      request: vi.fn(async (method: string) => {
        if (method !== "thread/read") {
          return {};
        }
        return {
          thread: {
            turns: [
              {
                items: [
                  {
                    type: "agentMessage",
                    id: "commentary-history",
                    phase: "commentary",
                    text: "Inspecting the implementation.",
                  },
                  {
                    type: "agentMessage",
                    id: "final-history",
                    phase: "final_answer",
                    text: "The implementation is correct.",
                  },
                ],
              },
            ],
          },
        };
      }),
    };
    await asInternals(session).loadPersistedHistory();
    const history: AgentStreamEvent[] = [];
    for await (const event of session.streamHistory()) {
      history.push(event);
    }
    expect(history.map((event) => (event.type === "timeline" ? event.item : null))).toEqual([
      {
        type: "reasoning",
        text: "Inspecting the implementation.",
      },
      {
        type: "assistant_message",
        messageId: "final-history",
        text: "The implementation is correct.",
      },
    ]);
  });
  test("does not replace a persisted Codex thread when app-server resume fails", async () => {
    const session = createSession({ thinkingOptionId: "medium" });
    session.currentThreadId = "archived-thread-id";
    const requests: Array<{
      method: string;
      params: unknown;
    }> = [];
    session.client = {
      request: vi.fn(async (method: string, params: unknown) => {
        requests.push({ method, params });
        if (method === "thread/loaded/list") {
          return { data: [] };
        }
        if (method === "thread/resume") {
          throw new Error("no tool-call found for thread id archived-thread-id");
        }
        if (method === "thread/start") {
          return { thread: { id: "replacement-empty-thread-id" } };
        }
        return {};
      }),
    };
    await expect(asInternals(session).ensureThreadLoaded()).rejects.toThrow(
      "no tool-call found for thread id archived-thread-id",
    );
    expect(session.currentThreadId).toBe("archived-thread-id");
    expect(requests).toEqual([
      { method: "thread/loaded/list", params: {} },
      {
        method: "thread/resume",
        params: {
          threadId: "archived-thread-id",
          developerInstructions: expect.stringContaining(
            "brief progress updates sent as commentary messages",
          ),
        },
      },
    ]);
  });
  test("lets the Codex runtime own automatic compaction for high-usage threads", async () => {
    const session = createSession();
    session.activeForegroundTurnId = null;
    const requests: Array<{
      method: string;
      params: unknown;
    }> = [];
    const internals = asInternals(session);
    internals.latestUsage = {
      contextWindowMaxTokens: 200000,
      contextWindowUsedTokens: 165000,
    };
    internals.client = {
      request: vi.fn(async (method: string, params: unknown) => {
        requests.push({ method, params });
        if (method === "thread/loaded/list") {
          return { data: ["test-thread"] };
        }
        return {};
      }),
    };
    await expect(session.startTurn("continue the task")).resolves.toEqual({
      turnId: "codex-turn-0",
    });
    expect(requests.map((request) => request.method)).toEqual(["thread/loaded/list", "turn/start"]);
  });
  test("automatically compacts and continues a Codex turn after max_output_tokens", async () => {
    const session = createSession();
    const events: AgentStreamEvent[] = [];
    const requests: Array<{
      method: string;
      params: unknown;
    }> = [];
    const internals = asInternals(session);
    internals.client = {
      request: vi.fn(async (method: string, params: unknown) => {
        requests.push({ method, params });
        return {};
      }),
    };
    internals.activeTurnStartParams = {
      threadId: "test-thread",
      input: [{ type: "text", text: "original prompt" }],
      model: "gpt-5.6",
    };
    session.subscribe((event) => events.push(event));
    internals.handleNotification("item/started", {
      threadId: "test-thread",
      item: {
        type: "contextCompaction",
        id: "compact-before-continuation",
      },
    });
    internals.handleNotification("turn/completed", {
      threadId: "test-thread",
      turn: {
        status: "failed",
        error: {
          message:
            "stream disconnected before completion: Incomplete response returned, reason: max_output_tokens",
        },
      },
    });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({
      method: "thread/compact/start",
      params: { threadId: "test-thread" },
    });
    internals.handleNotification("item/started", {
      threadId: "test-thread",
      item: {
        type: "contextCompaction",
        id: "automatic-recovery-compact",
      },
    });
    internals.handleNotification("item/completed", {
      threadId: "test-thread",
      item: {
        type: "contextCompaction",
        id: "automatic-recovery-compact",
      },
    });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toMatchObject({
      method: "turn/start",
      params: {
        threadId: "test-thread",
        model: "gpt-5.6",
        input: [
          {
            type: "text",
            text: expect.stringContaining("Context compaction has been attempted automatically"),
          },
        ],
      },
    });
    expect(events.some((event) => event.type === "turn_failed")).toBe(false);
    expect(events).toEqual([
      {
        type: "timeline",
        provider: "codex",
        turnId: "test-turn",
        item: {
          type: "compaction",
          status: "loading",
        },
      },
      {
        type: "timeline",
        provider: "codex",
        turnId: "test-turn",
        item: {
          type: "compaction",
          status: "completed",
        },
      },
      {
        type: "timeline",
        provider: "codex",
        turnId: "test-turn",
        item: {
          type: "compaction",
          status: "loading",
          trigger: "auto",
        },
      },
      {
        type: "timeline",
        provider: "codex",
        turnId: "test-turn",
        item: {
          type: "compaction",
          status: "completed",
          trigger: "auto",
        },
      },
    ]);
    internals.handleNotification("turn/started", {
      threadId: "test-thread",
      turn: { id: "continued-turn" },
    });
    internals.handleNotification("turn/completed", {
      threadId: "test-thread",
      turn: { status: "completed", error: null },
    });
    expect(events.filter((event) => event.type === "turn_completed")).toHaveLength(1);
    expect(events).toContainEqual({
      type: "timeline",
      provider: "codex",
      turnId: "test-turn",
      item: {
        type: "compaction",
        status: "completed",
      },
    });
    expect(internals.activeTurnStartParams).toBeNull();
    expect(internals.maxOutputTokensContinuationAttempts).toBe(0);
  });
  test("continues automatically when Codex compaction never reports completion", async () => {
    vi.useFakeTimers();
    try {
      const session = createSession();
      const events: AgentStreamEvent[] = [];
      const requests: Array<{
        method: string;
        params: unknown;
      }> = [];
      const internals = asInternals(session);
      internals.client = {
        request: vi.fn(async (method: string, params: unknown) => {
          requests.push({ method, params });
          return {};
        }),
      };
      internals.activeTurnStartParams = {
        threadId: "test-thread",
        input: [{ type: "text", text: "original prompt" }],
      };
      session.subscribe((event) => events.push(event));
      internals.handleNotification("turn/completed", {
        threadId: "test-thread",
        turn: {
          status: "failed",
          error: { message: "Incomplete response returned, reason: max_output_tokens" },
        },
      });
      expect(requests.map((request) => request.method)).toEqual(["thread/compact/start"]);
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
      expect(requests.map((request) => request.method)).toEqual([
        "thread/compact/start",
        "turn/start",
      ]);
      expect(events.some((event) => event.type === "turn_failed")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  test("surfaces max_output_tokens after the automatic continuation limit", async () => {
    const session = createSession();
    const events: AgentStreamEvent[] = [];
    const internals = asInternals(session);
    internals.client = {
      request: vi.fn(async () => ({})),
    };
    internals.activeTurnStartParams = {
      threadId: "test-thread",
      input: [{ type: "text", text: "original prompt" }],
    };
    internals.maxOutputTokensContinuationAttempts = 8;
    session.subscribe((event) => events.push(event));
    internals.handleNotification("item/started", {
      threadId: "test-thread",
      item: {
        type: "contextCompaction",
        id: "compact-before-final-failure",
      },
    });
    const failure = {
      threadId: "test-thread",
      turn: {
        status: "failed",
        error: { message: "Incomplete response returned, reason: max_output_tokens" },
      },
    };
    internals.handleNotification("turn/completed", failure);
    expect(events).toEqual([
      {
        type: "timeline",
        provider: "codex",
        turnId: "test-turn",
        item: {
          type: "compaction",
          status: "loading",
        },
      },
      {
        type: "timeline",
        provider: "codex",
        turnId: "test-turn",
        item: {
          type: "compaction",
          status: "completed",
        },
      },
      {
        type: "turn_failed",
        provider: "codex",
        turnId: "test-turn",
        error: "Incomplete response returned, reason: max_output_tokens",
      },
    ]);
  });
  test("keeps retryable provider errors non-terminal and preserves the final failure", () => {
    const session = createSession();
    const events: AgentStreamEvent[] = [];
    const internals = asInternals(session);
    const client = {
      request: vi.fn(async () => ({})),
    };
    internals.client = client;
    session.subscribe((event) => events.push(event));

    internals.handleNotification("error", {
      error: {
        message: "unexpected status 529 <unknown status code>",
        codexErrorInfo: "serverOverloaded",
        additionalDetails: "x-aiden-error-code: provider_rate_limited",
      },
      willRetry: true,
      threadId: "test-thread",
      turnId: "provider-turn-1",
    });

    expect(events).toEqual([
      {
        type: "timeline",
        provider: "codex",
        turnId: "test-turn",
        item: {
          type: "error",
          message: "模型服务负载过高，正在重试。",
        },
      },
    ]);
    expect(events.some((event) => event.type === "turn_failed")).toBe(false);
    expect(session.connected).toBe(true);
    expect(session.currentThreadId).toBe("test-thread");
    expect(session.activeForegroundTurnId).toBe("test-turn");
    expect(internals.client).toBe(client);

    internals.handleNotification("error", {
      error: {
        message: "unexpected status 529 <unknown status code>",
        codexErrorInfo: "responseTooManyFailedAttempts",
        additionalDetails: null,
      },
      willRetry: false,
      threadId: "test-thread",
      turnId: "provider-turn-1",
    });
    expect(events).toHaveLength(1);

    internals.handleNotification("turn/completed", {
      threadId: "test-thread",
      turn: {
        id: "provider-turn-1",
        status: "failed",
        error: {
          message:
            "unexpected status 529 <unknown status code>: 模型厂商负载过高，多次返回HTTP 429错误",
        },
      },
    });
    expect(events.at(-1)).toEqual({
      type: "turn_failed",
      provider: "codex",
      turnId: "test-turn",
      error: "unexpected status 529 <unknown status code>: 模型厂商负载过高，多次返回HTTP 429错误",
    });
  });
  test("settles compaction when the automatic continuation cannot start", async () => {
    const session = createSession();
    const events: AgentStreamEvent[] = [];
    const internals = asInternals(session);
    internals.client = {
      request: vi.fn(async () => {
        throw new Error("app-server disconnected");
      }),
    };
    internals.activeTurnStartParams = {
      threadId: "test-thread",
      input: [{ type: "text", text: "original prompt" }],
    };
    session.subscribe((event) => events.push(event));
    internals.handleNotification("item/started", {
      threadId: "test-thread",
      item: {
        type: "contextCompaction",
        id: "compact-before-rejected-continuation",
      },
    });
    internals.handleNotification("turn/completed", {
      threadId: "test-thread",
      turn: {
        status: "failed",
        error: { message: "Incomplete response returned, reason: max_output_tokens" },
      },
    });
    await vi.waitFor(() => {
      expect(events.at(-1)?.type).toBe("turn_failed");
    });
    expect(events).toEqual([
      {
        type: "timeline",
        provider: "codex",
        turnId: "test-turn",
        item: {
          type: "compaction",
          status: "loading",
        },
      },
      {
        type: "timeline",
        provider: "codex",
        turnId: "test-turn",
        item: {
          type: "compaction",
          status: "completed",
        },
      },
      {
        type: "turn_failed",
        provider: "codex",
        turnId: "test-turn",
        error: "Codex automatic recovery failed: app-server disconnected",
      },
    ]);
    expect(internals.activeTurnStartParams).toBeNull();
    expect(internals.maxOutputTokensContinuationAttempts).toBe(0);
  });
  test("streams Codex commentary agent messages as reasoning", () => {
    const session = createSession();
    const events: AgentStreamEvent[] = [];
    session.subscribe((event) => events.push(event));
    asInternals(session).handleNotification("item/started", {
      item: {
        id: "commentary-item-1",
        type: "agentMessage",
        phase: "commentary",
        text: "",
      },
    });
    asInternals(session).handleNotification("item/agentMessage/delta", {
      itemId: "commentary-item-1",
      delta: "正在检查代码。",
    });
    asInternals(session).handleNotification("item/completed", {
      item: {
        id: "commentary-item-1",
        type: "agentMessage",
        phase: "commentary",
        text: "正在检查代码。",
      },
    });
    expect(events).toEqual([
      {
        type: "timeline",
        provider: "codex",
        turnId: "test-turn",
        item: { type: "reasoning", text: "正在检查代码。" },
      },
    ]);
  });
  test("streams Codex final answer agent messages as assistant output", () => {
    const session = createSession();
    const events: AgentStreamEvent[] = [];
    session.subscribe((event) => events.push(event));
    asInternals(session).handleNotification("item/started", {
      item: {
        id: "final-answer-item-1",
        type: "agentMessage",
        phase: "final_answer",
        text: "",
      },
    });
    asInternals(session).handleNotification("item/agentMessage/delta", {
      itemId: "final-answer-item-1",
      delta: "问题已修复。",
    });
    asInternals(session).handleNotification("item/completed", {
      item: {
        id: "final-answer-item-1",
        type: "agentMessage",
        phase: "final_answer",
        text: "问题已修复。",
      },
    });
    expect(events).toEqual([
      {
        type: "timeline",
        provider: "codex",
        turnId: "test-turn",
        item: {
          type: "assistant_message",
          messageId: "final-answer-item-1",
          text: "问题已修复。",
        },
      },
    ]);
  });
  test("uses the started Codex agent message phase when completion omits it", () => {
    const session = createSession();
    const events: AgentStreamEvent[] = [];
    session.subscribe((event) => events.push(event));
    asInternals(session).handleNotification("item/started", {
      item: {
        id: "commentary-item-phase-fallback",
        type: "agentMessage",
        phase: "commentary",
        text: "",
      },
    });
    asInternals(session).handleNotification("item/agentMessage/delta", {
      itemId: "commentary-item-phase-fallback",
      delta: "Checking.",
    });
    asInternals(session).handleNotification("item/completed", {
      item: {
        id: "commentary-item-phase-fallback",
        type: "agentMessage",
        text: "Checking.",
      },
    });
    expect(events).toEqual([
      {
        type: "timeline",
        provider: "codex",
        turnId: "test-turn",
        item: { type: "reasoning", text: "Checking." },
      },
    ]);
  });
  test("streams Codex raw reasoning text deltas used by custom models", () => {
    const session = createSession();
    const events: AgentStreamEvent[] = [];
    session.subscribe((event) => events.push(event));
    asInternals(session).handleNotification("item/reasoning/textDelta", {
      threadId: "test-thread",
      turnId: "test-turn",
      itemId: "reasoning-item-content-1",
      contentIndex: 0,
      delta: "Inspecting the provider stream.",
    });
    expect(events).toEqual([
      {
        type: "timeline",
        provider: "codex",
        turnId: "test-turn",
        item: {
          type: "reasoning",
          text: "Inspecting the provider stream.",
        },
      },
    ]);
  });
});
