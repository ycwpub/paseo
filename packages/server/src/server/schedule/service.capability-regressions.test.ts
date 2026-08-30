import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentManager } from "../agent/agent-manager.js";
import { AgentStorage } from "../agent/agent-storage.js";
import { createAgentCommand } from "../agent/create-agent/create.js";
import type { AgentPromptInput } from "../agent/agent-sdk-types.js";
import { createTestAgentClients } from "../test-utils/fake-agent-client.js";
import { createTestLogger } from "../../test-utils/test-logger.js";
import type { ProviderSnapshotManager } from "../agent/provider-snapshot-manager.js";
import { createNoopWorkspaceGitService } from "../test-utils/workspace-git-service-stub.js";
import { type PersistedWorkspaceRecord } from "../workspace-registry.js";
import { archiveByScope, type ActiveWorkspaceRef } from "../workspace-archive-service.js";
import { ScheduleService, type ScheduleServiceOptions } from "./service.js";
import type { WorkflowRun } from "@getpaseo/protocol/workflow/types";
const NO_UNATTENDED_SCHEDULE_POLICY: Pick<ProviderSnapshotManager, "resolveCreateConfig"> = {
    async resolveCreateConfig(input) {
        return {
            modeId: input.unattended ? input.requestedMode : "interactive",
            featureValues: input.featureValues,
        };
    },
};
let _workspaceArchiveInProgress = false;
type TestScheduleServiceOptions = Omit<ScheduleServiceOptions, "createAgent" | "createDirectoryWorkspace" | "createPaseoWorktreeWorkspace" | "archiveWorkspace"> & {
    agentManager: AgentManager;
    providerSnapshotManager: Pick<ProviderSnapshotManager, "resolveCreateConfig">;
    createAgent?: ScheduleServiceOptions["createAgent"];
    createDirectoryWorkspace?: ScheduleServiceOptions["createDirectoryWorkspace"];
    createPaseoWorktreeWorkspace?: ScheduleServiceOptions["createPaseoWorktreeWorkspace"];
    archiveWorkspace?: ScheduleServiceOptions["archiveWorkspace"];
};
function createScheduleService(options: TestScheduleServiceOptions): ScheduleService {
    let workspaceCounter = 0;
    const workspaces = new Map<string, PersistedWorkspaceRecord>();
    const workspaceGitService = createNoopWorkspaceGitService();
    const createDefaultWorkspace: ScheduleServiceOptions["createDirectoryWorkspace"] = async (input) => {
        const timestamp = new Date().toISOString();
        const workspaceId = `wks_schedule_test_${++workspaceCounter}`;
        const workspace: PersistedWorkspaceRecord = {
            workspaceId,
            projectId: "test-project",
            cwd: input.cwd,
            kind: "directory",
            displayName: "test-project",
            title: input.firstAgentContext.prompt,
            branch: null,
            baseBranch: null,
            createdAt: timestamp,
            updatedAt: timestamp,
            archivedAt: null,
        };
        workspaces.set(workspaceId, workspace);
        return workspace;
    };
    const listActiveWorkspaces = async (): Promise<ActiveWorkspaceRef[]> => Array.from(workspaces.values())
        .filter((workspace) => !workspace.archivedAt)
        .map((workspace) => ({
        workspaceId: workspace.workspaceId,
        cwd: workspace.cwd,
        kind: workspace.kind,
    }));
    const archiveDefaultWorkspace: ScheduleServiceOptions["archiveWorkspace"] = async (workspaceId) => {
        _workspaceArchiveInProgress = true;
        try {
            await archiveByScope({
                github: { invalidate: () => { } } as never,
                workspaceGitService,
                agentManager: options.agentManager,
                agentStorage: options.agentStorage,
                findWorkspaceIdForCwd: async (cwd) => Array.from(workspaces.values()).find((workspace) => workspace.cwd === cwd)
                    ?.workspaceId ?? null,
                listActiveWorkspaces,
                archiveWorkspaceRecord: async (id) => {
                    const workspace = workspaces.get(id);
                    if (workspace) {
                        workspaces.set(id, { ...workspace, archivedAt: new Date().toISOString() });
                    }
                },
                emitWorkspaceUpdatesForWorkspaceIds: async () => { },
                markWorkspaceArchiving: () => { },
                clearWorkspaceArchiving: () => { },
                killTerminalsForWorkspace: async () => { },
                sessionLogger: options.logger,
            }, {
                scope: { kind: "workspace", workspaceId },
                requestId: "schedule-service-test",
            });
        }
        finally {
            _workspaceArchiveInProgress = false;
        }
    };
    return new ScheduleService({
        ...options,
        createAgent: options.createAgent ??
            ((input) => createAgentCommand({
                agentManager: options.agentManager,
                agentStorage: options.agentStorage,
                logger: options.logger,
                providerSnapshotManager: options.providerSnapshotManager as ProviderSnapshotManager,
            }, input)),
        createDirectoryWorkspace: options.createDirectoryWorkspace ?? createDefaultWorkspace,
        createPaseoWorktreeWorkspace: options.createPaseoWorktreeWorkspace ??
            (async (input) => {
                const workspace = await createDefaultWorkspace(input);
                return {
                    workspace,
                    worktree: { branchName: "schedule-test", worktreePath: workspace.cwd },
                    intent: { kind: "branch-off", baseBranch: "main", branchName: "schedule-test" },
                    repoRoot: workspace.cwd,
                    created: true,
                };
            }),
        archiveWorkspace: options.archiveWorkspace ?? archiveDefaultWorkspace,
    });
}
describe("ScheduleService", () => {
    let tempDir: string;
    let agentStorage: AgentStorage;
    let now: Date;
    beforeEach(async () => {
        tempDir = await mkdtemp(join(tmpdir(), "schedule-service-test-"));
        await mkdir(join(tempDir, "agents"), { recursive: true });
        agentStorage = new AgentStorage(join(tempDir, "agents"), createTestLogger());
        await agentStorage.initialize();
        now = new Date("2026-01-01T00:00:00.000Z");
    });
    afterEach(async () => {
        // Drain pending background persists before deleting the dir to avoid
        // ENOTEMPTY races when AgentManager flushes a snapshot mid-cleanup.
        await agentStorage.flush();
        await rm(tempDir, { recursive: true, force: true });
    });
    test("run history stores a config snapshot from run start", async () => {
        const service = createScheduleService({
            paseoHome: tempDir,
            logger: createTestLogger(),
            agentManager: new AgentManager({ logger: createTestLogger() }),
            agentStorage,
            providerSnapshotManager: NO_UNATTENDED_SCHEDULE_POLICY,
            now: () => now,
            runner: async () => ({
                agentId: null,
                output: "ok",
            }),
        });
        const expiresAt = "2026-01-02T00:00:00.000Z";
        const created = await service.create({
            name: "Nightly shell",
            prompt: "echo old",
            cadence: { type: "every", everyMs: 60000 },
            target: { type: "bash", config: { cwd: tempDir, shell: "/bin/bash" } },
            maxRuns: 5,
            expiresAt,
            runOnCreate: false,
        });
        await service.runOnce(created.id);
        await service.update({
            id: created.id,
            prompt: "echo new",
            cadence: { type: "every", everyMs: 120000 },
            bashConfig: { cwd: join(tempDir, "next") },
            maxRuns: 10,
            expiresAt: null,
        });
        const logs = await service.logs(created.id);
        expect(logs).toHaveLength(1);
        expect(logs[0]?.configSnapshot).toEqual({
            name: "Nightly shell",
            prompt: "echo old",
            cadence: { type: "every", everyMs: 60000 },
            target: { type: "bash", config: { cwd: tempDir, shell: "/bin/bash" } },
            maxRuns: 5,
            expiresAt,
        });
        expect((await service.inspect(created.id)).prompt).toBe("echo new");
    });
    test("resume reactivates completed schedules and extends exhausted maxRuns", async () => {
        const service = createScheduleService({
            paseoHome: tempDir,
            logger: createTestLogger(),
            agentManager: new AgentManager({ logger: createTestLogger() }),
            agentStorage,
            providerSnapshotManager: NO_UNATTENDED_SCHEDULE_POLICY,
            now: () => now,
            runner: async () => ({
                agentId: null,
                output: "done",
            }),
        });
        const created = await service.create({
            prompt: "One shot",
            cadence: { type: "every", everyMs: 60000 },
            target: { type: "bash", config: { cwd: tempDir } },
            maxRuns: 1,
        });
        now = new Date("2026-01-01T00:01:00.000Z");
        await service.tick();
        expect((await service.inspect(created.id)).status).toBe("completed");
        now = new Date("2026-01-01T00:10:00.000Z");
        const resumed = await service.resume(created.id);
        expect(resumed.status).toBe("active");
        expect(resumed.maxRuns).toBe(2);
        expect(resumed.nextRunAt).toBe("2026-01-01T00:11:00.000Z");
        now = new Date("2026-01-01T00:11:00.000Z");
        await service.tick();
        const rerun = await service.inspect(created.id);
        expect(rerun.runs).toHaveLength(2);
        expect(rerun.status).toBe("completed");
    });
    test("resume clears past expiration so ended schedules can become active", async () => {
        const service = createScheduleService({
            paseoHome: tempDir,
            logger: createTestLogger(),
            agentManager: new AgentManager({ logger: createTestLogger() }),
            agentStorage,
            providerSnapshotManager: NO_UNATTENDED_SCHEDULE_POLICY,
            now: () => now,
            runner: async () => ({
                agentId: null,
                output: "done",
            }),
        });
        const created = await service.create({
            prompt: "Expired job",
            cadence: { type: "every", everyMs: 60000 },
            target: { type: "bash", config: { cwd: tempDir } },
            expiresAt: "2026-01-01T00:01:00.000Z",
            runOnCreate: false,
        });
        now = new Date("2026-01-01T00:02:00.000Z");
        await service.tick();
        expect((await service.inspect(created.id)).status).toBe("completed");
        now = new Date("2026-01-01T00:03:00.000Z");
        const resumed = await service.resume(created.id);
        expect(resumed.status).toBe("active");
        expect(resumed.expiresAt).toBeNull();
        expect(resumed.nextRunAt).toBe("2026-01-01T00:04:00.000Z");
    });
    test("lists only active schedules that target existing agents", async () => {
        const service = createScheduleService({
            paseoHome: tempDir,
            logger: createTestLogger(),
            agentManager: new AgentManager({ logger: createTestLogger() }),
            agentStorage,
            providerSnapshotManager: NO_UNATTENDED_SCHEDULE_POLICY,
            now: () => now,
            runner: async () => ({ agentId: null, output: "ok" }),
        });
        const activeAgentId = "00000000-0000-4000-8000-000000000201";
        const pausedAgentId = "00000000-0000-4000-8000-000000000202";
        const completedAgentId = "00000000-0000-4000-8000-000000000203";
        const cadence = { type: "every" as const, everyMs: 60000 };
        await service.create({
            prompt: "Keep active agent resident",
            cadence,
            target: { type: "agent", agentId: activeAgentId },
        });
        const paused = await service.create({
            prompt: "Paused heartbeat",
            cadence,
            target: { type: "agent", agentId: pausedAgentId },
        });
        await service.pause(paused.id);
        await service.create({
            prompt: "Completed heartbeat",
            cadence,
            target: { type: "agent", agentId: completedAgentId },
        });
        await service.completeForAgent(completedAgentId);
        await service.create({
            prompt: "Fresh agent each run",
            cadence,
            target: { type: "new-agent", config: { provider: "claude", cwd: tempDir } },
        });
        await expect(service.listActiveAgentTargetIds()).resolves.toEqual(new Set([activeAgentId]));
    });
    test("executes bash schedules and records stdout and stderr", async () => {
        const service = createScheduleService({
            paseoHome: tempDir,
            logger: createTestLogger(),
            agentManager: new AgentManager({ logger: createTestLogger() }),
            agentStorage,
            providerSnapshotManager: NO_UNATTENDED_SCHEDULE_POLICY,
            now: () => now,
        });
        const created = await service.create({
            prompt: "printf hello; printf warn >&2",
            cadence: { type: "cron", expression: "0 9 * * *" },
            target: { type: "bash", config: { cwd: tempDir } },
            runOnCreate: false,
        });
        const after = await service.runOnce(created.id);
        expect(after.runs).toHaveLength(1);
        expect(after.runs[0]).toMatchObject({
            status: "succeeded",
            agentId: null,
            output: "stdout:\nhello\n\nstderr:\nwarn",
            error: null,
        });
    });
    test("executes scheduled workflow CLI commands directly without depending on an installed CLI", async () => {
        const runScriptAndWait = vi.fn(async (): Promise<WorkflowRun> => ({
            id: "workflow-run-1",
            scriptPath: join(tempDir, "flow1.json"),
            scriptSnapshot: {
                version: 1,
                name: "Scheduled workflow",
                steps: [{ id: "noop", type: "bash", initialCommand: "echo '{}'" }],
            },
            status: "succeeded",
            inputPayload: '{"control":""}',
            outputPayload: '{"control":"done","error":""}',
            inputFilePath: "",
            outputFilePath: null,
            control: "done",
            error: null,
            errorCode: null,
            startedAt: now.toISOString(),
            endedAt: now.toISOString(),
            nodeRuns: [],
        }));
        const service = createScheduleService({
            paseoHome: tempDir,
            logger: createTestLogger(),
            agentManager: new AgentManager({ logger: createTestLogger() }),
            agentStorage,
            providerSnapshotManager: NO_UNATTENDED_SCHEDULE_POLICY,
            now: () => now,
            workflowService: {
                runScript: runScriptAndWait,
                runScriptAndWait,
            },
        });
        const scriptPath = join(tempDir, "flow1.json");
        const created = await service.create({
            prompt: `paseo workflow run '${scriptPath}' '{"control":""}'`,
            cadence: { type: "cron", expression: "0 9 * * *" },
            target: { type: "bash", config: { cwd: tempDir } },
            runOnCreate: false,
        });
        const after = await service.runOnce(created.id);
        expect(runScriptAndWait).toHaveBeenCalledWith({
            scriptPath,
            inputPayload: '{"control":""}',
            background: false,
        });
        expect(after.runs[0]).toMatchObject({
            status: "succeeded",
            agentId: null,
            error: null,
        });
        expect(after.runs[0]?.output).toContain('"id": "workflow-run-1"');
    });
    test("records bash schedule failures with captured output", async () => {
        const service = createScheduleService({
            paseoHome: tempDir,
            logger: createTestLogger(),
            agentManager: new AgentManager({ logger: createTestLogger() }),
            agentStorage,
            providerSnapshotManager: NO_UNATTENDED_SCHEDULE_POLICY,
            now: () => now,
        });
        const created = await service.create({
            prompt: "printf before; printf nope >&2; exit 7",
            cadence: { type: "cron", expression: "0 9 * * *" },
            target: { type: "bash", config: { cwd: tempDir } },
            runOnCreate: false,
        });
        const after = await service.runOnce(created.id);
        expect(after.runs[0]).toMatchObject({
            status: "failed",
            agentId: null,
            output: "stdout:\nbefore\n\nstderr:\nnope",
        });
        expect(after.runs[0]?.error).toContain("exit code 7");
        expect(after.runs[0]?.error).toContain("nope");
    });
    test("scheduled new-agent runs can use an assistant prompt", async () => {
        const createdInputs: Parameters<ScheduleServiceOptions["createAgent"]>[0][] = [];
        const runPrompts: AgentPromptInput[] = [];
        const manager = new AgentManager({
            logger: createTestLogger(),
            clients: createTestAgentClients(),
            registry: agentStorage,
        });
        manager.runAgent = async (_agentId, prompt) => {
            runPrompts.push(prompt);
            return {
                sessionId: "scheduled-assistant-run",
                finalText: "done",
                timeline: [{ type: "assistant_message", text: "done" }],
            };
        };
        manager.waitForAgentEvent = async () => ({
            status: "idle",
            permission: null,
            lastMessage: "done",
        });
        manager.archiveAgent = async () => { };
        const service = createScheduleService({
            paseoHome: tempDir,
            logger: createTestLogger(),
            agentManager: manager,
            agentStorage,
            providerSnapshotManager: NO_UNATTENDED_SCHEDULE_POLICY,
            assistantStore: {
                get: (id) => id === "assistant-1"
                    ? {
                        id,
                        name: "Reviewer",
                        description: "",
                        prompt: "You are a careful reviewer.",
                        memoryEnabled: false,
                        memory: "",
                        memorySummary: "",
                        memoryFiles: { summaryPath: "", detailFiles: [] },
                        createdAt: "2026-01-01T00:00:00.000Z",
                        updatedAt: "2026-01-01T00:00:00.000Z",
                    }
                    : null,
            },
            createAgent: async (input) => {
                createdInputs.push(input);
                const snapshot = {
                    id: "00000000-0000-0000-0000-000000000323",
                    provider: "claude",
                    cwd: input.cwd ?? tempDir,
                    workspaceId: input.workspaceId,
                    status: "idle",
                    lifecycle: "idle",
                };
                return {
                    snapshot: snapshot as Awaited<ReturnType<ScheduleServiceOptions["createAgent"]>>["snapshot"],
                    liveSnapshot: snapshot as Awaited<ReturnType<ScheduleServiceOptions["createAgent"]>>["liveSnapshot"],
                    background: true,
                    initialPromptStarted: false,
                    initialPromptError: null,
                };
            },
            now: () => now,
        });
        const created = await service.create({
            prompt: "Review the diff.",
            cadence: { type: "every", everyMs: 60000 },
            target: {
                type: "new-agent",
                config: { provider: "claude", cwd: tempDir, assistantId: "assistant-1" },
            },
            maxRuns: 1,
        });
        await service.tick();
        expect(createdInputs[0]?.labels).toMatchObject({
            assistantId: "assistant-1",
            assistantName: "Reviewer",
        });
        expect(runPrompts[0]).toContain("You are a careful reviewer.");
        expect(runPrompts[0]).toContain("Review the diff.");
        const inspected = await service.inspect(created.id);
        expect(inspected.runs[0]?.status).toBe("succeeded");
    });
    test("scheduled new-agent assistant selection is persisted on the created agent", async () => {
        const manager = new AgentManager({
            logger: createTestLogger(),
            clients: createTestAgentClients(),
            registry: agentStorage,
        });
        const service = createScheduleService({
            paseoHome: tempDir,
            logger: createTestLogger(),
            agentManager: manager,
            agentStorage,
            providerSnapshotManager: NO_UNATTENDED_SCHEDULE_POLICY,
            assistantStore: {
                get: (id) => id === "assistant-1"
                    ? {
                        id,
                        name: "Reviewer",
                        description: "",
                        prompt: "You are a careful reviewer.",
                        memoryEnabled: false,
                        memory: "",
                        memorySummary: "",
                        memoryFiles: { summaryPath: "", detailFiles: [] },
                        createdAt: "2026-01-01T00:00:00.000Z",
                        updatedAt: "2026-01-01T00:00:00.000Z",
                    }
                    : null,
            },
            now: () => now,
        });
        const created = await service.create({
            prompt: "Review the diff.",
            cadence: { type: "every", everyMs: 60000 },
            target: {
                type: "new-agent",
                config: {
                    provider: "claude",
                    cwd: tempDir,
                    assistantId: "assistant-1",
                    archiveOnFinish: false,
                },
            },
            maxRuns: 1,
        });
        await service.tick();
        const inspected = await service.inspect(created.id);
        const agentId = inspected.runs[0]?.agentId;
        expect(agentId).toMatch(/^[0-9a-f-]{36}$/);
        const storedAgent = await agentStorage.get(agentId!);
        expect(storedAgent?.labels).toMatchObject({
            assistantId: "assistant-1",
            assistantName: "Reviewer",
        });
    });
    test("update changes bash config fields independently", async () => {
        const service = createScheduleService({
            paseoHome: tempDir,
            logger: createTestLogger(),
            agentManager: new AgentManager({ logger: createTestLogger() }),
            agentStorage,
            providerSnapshotManager: NO_UNATTENDED_SCHEDULE_POLICY,
            now: () => now,
            runner: async () => ({ agentId: null, output: "ok" }),
        });
        const created = await service.create({
            prompt: "npm test",
            cadence: { type: "every", everyMs: 60000 },
            target: { type: "bash", config: { cwd: tempDir, shell: "/bin/bash", timeoutMs: 1000 } },
        });
        const changed = await service.update({
            id: created.id,
            bashConfig: { cwd: join(tempDir, "subdir"), shell: null, timeoutMs: null },
        });
        expect(changed.target).toEqual({
            type: "bash",
            config: {
                cwd: join(tempDir, "subdir"),
            },
        });
    });
    test("update changes individual new-agent fields independently", async () => {
        const service = createScheduleService({
            paseoHome: tempDir,
            logger: createTestLogger(),
            agentManager: new AgentManager({ logger: createTestLogger() }),
            agentStorage,
            providerSnapshotManager: NO_UNATTENDED_SCHEDULE_POLICY,
            now: () => now,
            runner: async () => ({ agentId: null, output: "ok" }),
        });
        const created = await service.create({
            prompt: "p",
            cadence: { type: "every", everyMs: 60000 },
            target: {
                type: "new-agent",
                config: { provider: "claude", cwd: tempDir, model: "sonnet", modeId: "default" },
            },
        });
        const modeOnly = await service.update({
            id: created.id,
            newAgentConfig: { modeId: "bypassPermissions" },
        });
        expect(modeOnly.target).toMatchObject({
            type: "new-agent",
            config: {
                provider: "claude",
                cwd: tempDir,
                model: "sonnet",
                modeId: "bypassPermissions",
            },
        });
        const clearModel = await service.update({
            id: created.id,
            newAgentConfig: { model: null, assistantId: "assistant-1" },
        });
        if (clearModel.target.type !== "new-agent") {
            throw new Error("target type changed unexpectedly");
        }
        expect(clearModel.target.config.model).toBeUndefined();
        expect(clearModel.target.config.modeId).toBe("bypassPermissions");
        expect(clearModel.target.config.assistantId).toBe("assistant-1");
        const clearAssistant = await service.update({
            id: created.id,
            newAgentConfig: { assistantId: null },
        });
        if (clearAssistant.target.type !== "new-agent") {
            throw new Error("target type changed unexpectedly");
        }
        expect(clearAssistant.target.config.assistantId).toBeUndefined();
    });
    test("createOrReplace matches bash targets by config", async () => {
        const service = createScheduleService({
            paseoHome: tempDir,
            logger: createTestLogger(),
            agentManager: new AgentManager({ logger: createTestLogger() }),
            agentStorage,
            providerSnapshotManager: NO_UNATTENDED_SCHEDULE_POLICY,
            now: () => now,
            runner: async () => ({ agentId: null, output: "ok" }),
        });
        const first = await service.createOrReplace({
            name: "bash nightly",
            prompt: "npm test",
            cadence: { type: "every", everyMs: 60000 },
            target: { type: "bash", config: { cwd: tempDir } },
        });
        const second = await service.createOrReplace({
            name: "bash nightly",
            prompt: "npm run lint",
            cadence: { type: "every", everyMs: 60000 },
            target: { type: "bash", config: { cwd: tempDir } },
        });
        expect(second.id).toBe(first.id);
        expect(second.prompt).toBe("npm run lint");
        expect(await service.list()).toHaveLength(1);
    });
});
