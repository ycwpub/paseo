import { expect, test, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { AgentManager, type AgentManagerEvent } from "./agent-manager.js";
import { AgentStorage } from "./agent-storage.js";
import type { McpServer, Skill } from "@getpaseo/protocol/messages";
import type { AgentClient, AgentLaunchContext, AgentPromptInput, AgentProvider, AgentPersistenceHandle, AgentRunResult, AgentSession, AgentSessionConfig, AgentSlashCommand, AgentStreamEvent } from "./agent-sdk-types.js";
interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
}
function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}
const TEST_CAPABILITIES = {
    supportsStreaming: false,
    supportsSessionPersistence: false,
    supportsSessionListing: true,
    supportsDynamicModes: false,
    supportsMcpServers: false,
    supportsReasoningStream: false,
    supportsToolInvocations: false,
} as const;
class TestAgentClient implements AgentClient {
    readonly provider: AgentProvider;
    readonly capabilities = TEST_CAPABILITIES;
    readonly createdConfigs: AgentSessionConfig[] = [];
    readonly resumeOverrides: Array<Partial<AgentSessionConfig> | undefined> = [];
    constructor(provider: AgentProvider = "codex") {
        this.provider = provider;
    }
    async isAvailable(): Promise<boolean> {
        return true;
    }
    async createSession(config: AgentSessionConfig): Promise<AgentSession> {
        this.createdConfigs.push(config);
        return new TestAgentSession(config);
    }
    async fetchCatalog() {
        return {
            models: [
                {
                    provider: this.provider,
                    id: "gpt-5.4",
                    label: "GPT-5.4",
                    isDefault: true,
                },
                {
                    provider: this.provider,
                    id: "gpt-5.4-mini",
                    label: "GPT-5.4 Mini",
                },
                {
                    provider: this.provider,
                    id: "gpt-5.2-codex",
                    label: "GPT-5.2 Codex",
                },
            ],
            modes: [],
        };
    }
    async resumeSession(_handle: AgentPersistenceHandle, config?: Partial<AgentSessionConfig>, _launchContext?: AgentLaunchContext): Promise<AgentSession> {
        this.resumeOverrides.push(config);
        return new TestAgentSession({
            provider: this.provider,
            cwd: config?.cwd ?? process.cwd(),
            daemonAppendSystemPrompt: config?.daemonAppendSystemPrompt,
        });
    }
}
class TestAgentSession implements AgentSession {
    readonly provider = "codex" as const;
    readonly capabilities = TEST_CAPABILITIES;
    readonly id = randomUUID();
    private runtimeModel: string | null = null;
    private subscribers = new Set<(event: AgentStreamEvent) => void>();
    private turnIdCounter = 0;
    private interrupted = false;
    constructor(private readonly config: AgentSessionConfig) { }
    async run(): Promise<AgentRunResult> {
        return {
            sessionId: this.id ?? this.config.provider,
            finalText: "",
            timeline: [],
        };
    }
    async startTurn(): Promise<{
        turnId: string;
    }> {
        this.interrupted = false;
        const turnId = `turn-${++this.turnIdCounter}`;
        // Use setTimeout so events arrive after the caller sets up the foreground waiter
        setTimeout(() => {
            this.pushEvent({ type: "turn_started", provider: this.provider, turnId });
            this.pushEvent({ type: "turn_completed", provider: this.provider, turnId });
            this.runtimeModel = "gpt-5.2-codex";
        }, 0);
        return { turnId };
    }
    subscribe(callback: (event: AgentStreamEvent) => void): () => void {
        this.subscribers.add(callback);
        return () => {
            this.subscribers.delete(callback);
        };
    }
    pushEvent(event: AgentStreamEvent): void {
        for (const cb of this.subscribers) {
            try {
                cb(event);
            }
            catch {
            }
        }
    }
    async *streamHistory(): AsyncGenerator<AgentStreamEvent> { }
    async getRuntimeInfo() {
        return {
            provider: this.provider,
            sessionId: this.id,
            model: this.runtimeModel ?? this.config.model ?? null,
            modeId: this.config.modeId ?? null,
        };
    }
    async getAvailableModes() {
        return [];
    }
    async getCurrentMode() {
        return null;
    }
    async setMode(): Promise<void> { }
    getPendingPermissions() {
        return [];
    }
    async respondToPermission(): Promise<void> { }
    describePersistence() {
        return {
            provider: this.provider,
            sessionId: this.id,
        };
    }
    async interrupt(): Promise<void> {
        this.interrupted = true;
    }
    async close(): Promise<void> { }
}
class McpCapableTestAgentSession extends TestAgentSession {
    override readonly capabilities = {
        ...TEST_CAPABILITIES,
        supportsMcpServers: true,
    };
}
class McpCapableTestAgentClient extends TestAgentClient {
    override readonly capabilities = {
        ...TEST_CAPABILITIES,
        supportsMcpServers: true,
    };
    override async createSession(config: AgentSessionConfig): Promise<AgentSession> {
        this.createdConfigs.push(config);
        return new McpCapableTestAgentSession(config);
    }
    override async resumeSession(_handle: AgentPersistenceHandle, config?: Partial<AgentSessionConfig>): Promise<AgentSession> {
        this.resumeOverrides.push(config);
        return new McpCapableTestAgentSession({
            ...config,
            provider: this.provider,
            cwd: config?.cwd ?? process.cwd(),
        });
    }
}
class CommandAwareTestAgentSession extends TestAgentSession {
    readonly prompts: AgentPromptInput[] = [];
    constructor(config: AgentSessionConfig, private readonly commands: AgentSlashCommand[] = []) {
        super(config);
    }
    override async startTurn(prompt: AgentPromptInput): Promise<{
        turnId: string;
    }> {
        this.prompts.push(prompt);
        return super.startTurn(prompt);
    }
    async listCommands(): Promise<AgentSlashCommand[]> {
        return this.commands;
    }
}
class CommandAwareTestAgentClient extends TestAgentClient {
    readonly sessions: CommandAwareTestAgentSession[] = [];
    constructor(provider: AgentProvider = "codex", private readonly commands: AgentSlashCommand[] = []) {
        super(provider);
    }
    override async createSession(config: AgentSessionConfig): Promise<AgentSession> {
        this.createdConfigs.push(config);
        const session = new CommandAwareTestAgentSession(config, this.commands);
        this.sessions.push(session);
        return session;
    }
}
const logger = createTestLogger();
test("createAgent appends per-Agent runtime system prompt without persisting it", async () => {
    const workdir = mkdtempSync(join(tmpdir(), "agent-manager-test-"));
    const storagePath = join(workdir, "agents");
    const storage = new AgentStorage(storagePath, logger);
    const client = new TestAgentClient();
    const agentId = "00000000-0000-4000-8000-000000000105";
    const manager = new AgentManager({
        clients: {
            codex: client,
        },
        registry: storage,
        logger,
        appendSystemPrompt: "Daemon instructions.",
        idFactory: () => agentId,
    });
    manager.setAgentAppendSystemPromptComposer((resolvedAgentId) => `Memory index: /tmp/${resolvedAgentId}.md`);
    const snapshot = await manager.createAgent({
        provider: "codex",
        cwd: workdir,
        systemPrompt: "Agent instructions.",
    }, undefined, { workspaceId: undefined });
    const record = await storage.get(snapshot.id);
    expect(client.createdConfigs[0]?.daemonAppendSystemPrompt).toBe(`Daemon instructions.\n\nMemory index: /tmp/${agentId}.md`);
    expect(snapshot.config).not.toHaveProperty("daemonAppendSystemPrompt");
    expect(record?.config).not.toHaveProperty("daemonAppendSystemPrompt");
});
test("createAgent composes current global knowledge with daemon and per-Agent prompts", async () => {
    const workdir = mkdtempSync(join(tmpdir(), "agent-manager-test-"));
    const storagePath = join(workdir, "agents");
    const storage = new AgentStorage(storagePath, logger);
    const client = new TestAgentClient();
    const agentId = "00000000-0000-4000-8000-000000000106";
    const nextAgentId = "00000000-0000-4000-8000-000000000107";
    const agentIds = [agentId, nextAgentId];
    let hostKnowledgePrompt = "Global standards v1.";
    const manager = new AgentManager({
        clients: {
            codex: client,
        },
        registry: storage,
        logger,
        appendSystemPrompt: "Daemon instructions.",
        daemonKnowledgePromptComposer: () => hostKnowledgePrompt,
        idFactory: () => agentIds.shift() ?? nextAgentId,
    });
    manager.setAgentAppendSystemPromptComposer(() => "Memory index: /tmp/memory.md");
    const first = await manager.createAgent({
        provider: "codex",
        cwd: workdir,
        systemPrompt: "Agent instructions.",
    }, undefined, { workspaceId: undefined });
    hostKnowledgePrompt = "Global standards v2.";
    await manager.createAgent({
        provider: "codex",
        cwd: workdir,
        systemPrompt: "Another Agent.",
    }, undefined, { workspaceId: undefined });
    const record = await storage.get(first.id);
    expect(client.createdConfigs[0]?.daemonAppendSystemPrompt).toBe("Daemon instructions.\n\nGlobal standards v1.\n\nMemory index: /tmp/memory.md");
    expect(client.createdConfigs[1]?.daemonAppendSystemPrompt).toContain("Global standards v2.");
    expect(first.config).not.toHaveProperty("daemonAppendSystemPrompt");
    expect(record?.config).not.toHaveProperty("daemonAppendSystemPrompt");
});
test("resumeAgentFromPersistence waits for global cloud knowledge before launching", async () => {
    const workdir = mkdtempSync(join(tmpdir(), "agent-manager-test-"));
    const storagePath = join(workdir, "agents");
    const storage = new AgentStorage(storagePath, logger);
    const client = new TestAgentClient();
    const manager = new AgentManager({
        clients: {
            codex: client,
        },
        registry: storage,
        logger,
        daemonKnowledgePromptComposer: async () => {
            await Promise.resolve();
            return "Downloaded global standard.";
        },
        idFactory: () => "00000000-0000-4000-8000-000000000108",
    });
    const handle: AgentPersistenceHandle = {
        provider: "codex",
        sessionId: "session-cloud-knowledge",
        metadata: {
            cwd: workdir,
        },
    };
    await manager.resumeAgentFromPersistence(handle);
    expect(client.resumeOverrides[0]?.daemonAppendSystemPrompt).toBe("Downloaded global standard.");
});
test("each completed turn emits attention even when the previous turn is still unread", async () => {
    const workdir = mkdtempSync(join(tmpdir(), "agent-manager-multi-turn-attention-"));
    const storagePath = join(workdir, "agents");
    const storage = new AgentStorage(storagePath, logger);
    const attentionReasons: Array<"finished" | "error" | "permission"> = [];
    const manager = new AgentManager({
        clients: {
            codex: new TestAgentClient(),
        },
        registry: storage,
        logger,
        idFactory: () => "00000000-0000-4000-8000-000000000136",
        onAgentAttention: ({ reason }) => {
            attentionReasons.push(reason);
        },
    });
    const snapshot = await manager.createAgent({
        provider: "codex",
        cwd: workdir,
        title: "Multi-turn attention test",
    }, undefined, { workspaceId: undefined });
    await manager.runAgent(snapshot.id, "first turn");
    await manager.runAgent(snapshot.id, "second turn");
    await manager.flush();
    expect(attentionReasons).toEqual(["finished", "finished"]);
    expect(manager.getAgent(snapshot.id)?.attention).toMatchObject({
        requiresAttention: true,
        attentionReason: "finished",
    });
});
test("publishes compaction progress while startTurn is still pending", async () => {
    const workdir = mkdtempSync(join(tmpdir(), "agent-manager-pending-compaction-"));
    const storage = new AgentStorage(join(workdir, "agents"), logger);
    const compactionStarted = deferred<void>();
    const finishCompaction = deferred<void>();
    class PendingCompactionSession extends TestAgentSession {
        override async startTurn(): Promise<{
            turnId: string;
        }> {
            const turnId = "turn-after-compaction";
            this.pushEvent({
                type: "timeline",
                provider: this.provider,
                turnId,
                item: { type: "compaction", status: "loading", trigger: "auto" },
            });
            compactionStarted.resolve();
            await finishCompaction.promise;
            this.pushEvent({
                type: "timeline",
                provider: this.provider,
                turnId,
                item: { type: "compaction", status: "completed", trigger: "auto" },
            });
            setTimeout(() => {
                this.pushEvent({ type: "turn_started", provider: this.provider, turnId });
                this.pushEvent({ type: "turn_completed", provider: this.provider, turnId });
            }, 0);
            return { turnId };
        }
    }
    class PendingCompactionClient extends TestAgentClient {
        readonly session = new PendingCompactionSession({ provider: "codex", cwd: workdir });
        override async createSession(): Promise<AgentSession> {
            return this.session;
        }
    }
    const manager = new AgentManager({
        clients: { codex: new PendingCompactionClient() },
        registry: storage,
        logger,
        idFactory: () => "00000000-0000-4000-8000-000000000132",
    });
    const agent = await manager.createAgent({ provider: "codex", cwd: workdir }, undefined, {
        workspaceId: undefined,
    });
    const events: AgentManagerEvent[] = [];
    manager.subscribe((event) => events.push(event), { agentId: agent.id, replayState: false });
    const run = manager.runAgent(agent.id, "continue after compaction");
    await compactionStarted.promise;
    await vi.waitFor(() => {
        expect(events).toContainEqual(expect.objectContaining({
            type: "agent_stream",
            event: expect.objectContaining({
                type: "timeline",
                item: { type: "compaction", status: "loading", trigger: "auto" },
            }),
        }));
    });
    finishCompaction.resolve();
    await expect(run).resolves.toEqual(expect.objectContaining({
        sessionId: expect.any(String),
        canceled: false,
    }));
    expect(events.filter((event) => event.type === "agent_stream" &&
        event.event.type === "timeline" &&
        event.event.item.type === "compaction")).toEqual([
        expect.objectContaining({
            event: expect.objectContaining({
                item: { type: "compaction", status: "loading", trigger: "auto" },
            }),
        }),
        expect.objectContaining({
            event: expect.objectContaining({
                item: { type: "compaction", status: "completed", trigger: "auto" },
            }),
        }),
    ]);
});
test("injects enabled daemon MCP servers into launch config without persisting them", async () => {
    const client = new McpCapableTestAgentClient("codex");
    const workdir = mkdtempSync(join(tmpdir(), "agent-manager-shared-mcp-"));
    const timestamp = Date.now();
    const sharedServers: McpServer[] = [
        {
            id: "shared-db",
            name: "db",
            enabled: true,
            transport: { type: "http", url: "http://127.0.0.1:8123/mcp" },
            tools: [],
            createdAt: timestamp,
            updatedAt: timestamp,
            originalJson: "{}",
        },
        {
            id: "disabled-files",
            name: "files",
            enabled: false,
            transport: { type: "stdio", command: "files-mcp" },
            tools: [],
            createdAt: timestamp,
            updatedAt: timestamp,
            originalJson: "{}",
        },
        {
            id: "reserved-paseo",
            name: "paseo",
            enabled: true,
            transport: { type: "http", url: "http://example.com/not-daemon" },
            tools: [],
            createdAt: timestamp,
            updatedAt: timestamp,
            originalJson: "{}",
        },
    ];
    const manager = new AgentManager({
        clients: { codex: client },
        mcpBaseUrl: "http://127.0.0.1:6767/mcp/agents",
        mcpAuthToken: "cap-token",
        mcpStore: { list: () => sharedServers },
        logger,
    });
    const snapshot = await manager.createAgent({
        provider: "codex",
        cwd: workdir,
        mcpServers: {
            files: { type: "stdio", command: "explicit-files" },
        },
    }, undefined, { workspaceId: undefined });
    expect(client.createdConfigs[0]?.mcpServers).toEqual({
        paseo: {
            type: "http",
            url: `http://127.0.0.1:6767/mcp/agents?callerAgentId=${snapshot.id}`,
            headers: { Authorization: "Bearer cap-token" },
        },
        files: { type: "stdio", command: "explicit-files" },
        db: { type: "http", url: "http://127.0.0.1:8123/mcp" },
    });
    expect(snapshot.config.mcpServers).toEqual({
        files: { type: "stdio", command: "explicit-files" },
    });
});
test("lists and expands daemon-managed skills for providers without native collisions", async () => {
    const client = new CommandAwareTestAgentClient("codex");
    const workdir = mkdtempSync(join(tmpdir(), "agent-manager-shared-skills-"));
    const timestamp = Date.now();
    const sharedSkills: Skill[] = [
        {
            id: "skill-review",
            name: "review",
            description: "Review a code change",
            source: "user",
            enabled: true,
            content: "---\nname: review\n---\nCheck correctness and tests.",
            tags: ["code"],
            createdAt: timestamp,
            updatedAt: timestamp,
        },
    ];
    const manager = new AgentManager({
        clients: { codex: client },
        skillStore: { list: () => sharedSkills },
        logger,
    });
    const snapshot = await manager.createAgent({ provider: "codex", cwd: workdir }, undefined, {
        workspaceId: undefined,
    });
    await expect(manager.listCommandsForAgent(snapshot.id)).resolves.toContainEqual({
        name: "review",
        description: "Review a code change",
        argumentHint: "",
        kind: "skill",
    });
    await manager.runAgent(snapshot.id, "/review check auth flow");
    expect(client.sessions[0]?.prompts[0]).toEqual(expect.stringContaining("Use the following Paseo-managed skill: review."));
    expect(client.sessions[0]?.prompts[0]).toEqual(expect.stringContaining("Check correctness and tests."));
    expect(client.sessions[0]?.prompts[0]).toEqual(expect.stringContaining("check auth flow"));
});
test("does not expand daemon-managed skill when provider owns the same slash command", async () => {
    const workdir = mkdtempSync(join(tmpdir(), "agent-manager-shared-skill-collision-"));
    const client = new CommandAwareTestAgentClient("codex", [
        {
            name: "review",
            description: "Native provider review command",
            argumentHint: "",
            kind: "command",
        },
    ]);
    const timestamp = Date.now();
    const manager = new AgentManager({
        clients: { codex: client },
        skillStore: {
            list: () => [
                {
                    id: "skill-review",
                    name: "review",
                    description: "Shared review skill",
                    source: "user",
                    enabled: true,
                    content: "Shared skill content",
                    createdAt: timestamp,
                    updatedAt: timestamp,
                },
            ],
        },
        logger,
    });
    const snapshot = await manager.createAgent({ provider: "codex", cwd: workdir }, undefined, {
        workspaceId: undefined,
    });
    await expect(manager.listCommandsForAgent(snapshot.id)).resolves.toContainEqual({
        name: "review",
        description: "Native provider review command",
        argumentHint: "",
        kind: "command",
    });
    await manager.runAgent(snapshot.id, "/review keep native behavior");
    expect(client.sessions[0]?.prompts[0]).toBe("/review keep native behavior");
});
