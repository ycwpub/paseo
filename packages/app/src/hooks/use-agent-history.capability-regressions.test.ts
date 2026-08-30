import { beforeAll, describe, expect, it } from "vitest";
import type { DaemonClient, FetchAgentHistoryEntry, FetchAgentHistoryOptions } from "@getpaseo/client/internal/daemon-client";
import type { AgentHistoryClient, AgentHistoryHost } from "./use-agent-history";
(globalThis as unknown as {
    __DEV__: boolean;
}).__DEV__ = false;
type UseAgentHistoryModule = typeof import("./use-agent-history");
let fetchAgentHistoryBatch: UseAgentHistoryModule["fetchAgentHistoryBatch"];
let fetchAgentHistoryPage: UseAgentHistoryModule["fetchAgentHistoryPage"];
let _collectAgentHistoryHostErrors: UseAgentHistoryModule["collectAgentHistoryHostErrors"];
beforeAll(async () => {
    const module = await import("./use-agent-history");
    fetchAgentHistoryBatch = module.fetchAgentHistoryBatch;
    fetchAgentHistoryPage = module.fetchAgentHistoryPage;
    _collectAgentHistoryHostErrors = module.collectAgentHistoryHostErrors;
});
type FetchAgentHistory = DaemonClient["fetchAgentHistory"];
type FetchAgentHistoryResult = Awaited<ReturnType<FetchAgentHistory>>;
interface FakeAgentHistoryClient extends AgentHistoryClient {
    calls: FetchAgentHistoryOptions[];
}
function createClient(pages: FetchAgentHistoryResult[]): FakeAgentHistoryClient {
    const calls: FetchAgentHistoryOptions[] = [];
    let index = 0;
    return {
        calls,
        fetchAgentHistory: async (options) => {
            calls.push(options ?? {});
            const page = pages[index] ?? pages[pages.length - 1];
            index += 1;
            if (!page) {
                throw new Error("No more history pages configured");
            }
            return page;
        },
    };
}
function historyPayload(input: {
    entries: FetchAgentHistoryEntry[];
    hasMore?: boolean;
    nextCursor?: string | null;
    searchTruncated?: boolean;
}): FetchAgentHistoryResult {
    return {
        requestId: "req_history",
        entries: input.entries,
        pageInfo: {
            nextCursor: input.nextCursor ?? null,
            prevCursor: null,
            hasMore: input.hasMore ?? false,
        },
        ...(input.searchTruncated === undefined ? {} : { searchTruncated: input.searchTruncated }),
    };
}
function historyEntry(input: {
    id: string;
    cwd: string;
    updatedAt: string;
    title?: string | null;
    archivedAt?: string | null;
    searchScore?: number;
}): FetchAgentHistoryEntry {
    return {
        agent: {
            id: input.id,
            provider: "codex",
            status: "closed",
            createdAt: input.updatedAt,
            updatedAt: input.updatedAt,
            lastUserMessageAt: null,
            lastError: undefined,
            runtimeInfo: {
                provider: "codex",
                sessionId: null,
            },
            capabilities: {
                supportsStreaming: true,
                supportsSessionPersistence: true,
                supportsDynamicModes: true,
                supportsMcpServers: true,
                supportsReasoningStream: true,
                supportsToolInvocations: true,
            },
            currentModeId: null,
            availableModes: [],
            pendingPermissions: [],
            persistence: null,
            title: input.title ?? null,
            cwd: input.cwd,
            model: null,
            thinkingOptionId: null,
            requiresAttention: false,
            attentionReason: null,
            attentionTimestamp: null,
            archivedAt: input.archivedAt ?? null,
            labels: {},
        },
        project: {
            projectKey: input.cwd,
            projectName: "workspace",
            checkout: {
                cwd: input.cwd,
                isGit: false,
                currentBranch: null,
                remoteUrl: null,
                worktreeRoot: null,
                isPaseoOwnedWorktree: false,
                mainRepoRoot: null,
            },
        },
        ...(input.searchScore === undefined ? {} : { searchScore: input.searchScore }),
    };
}
describe("fetchAgentHistoryPage", () => {
    it("passes project filters to the daemon", async () => {
        const client = createClient([
            historyPayload({
                entries: [
                    historyEntry({
                        id: "project-history",
                        cwd: "/repo/project",
                        updatedAt: "2026-04-01T10:00:00.000Z",
                    }),
                ],
            }),
        ]);
        await fetchAgentHistoryPage({
            client,
            serverId: "server-1",
            cursor: null,
            projectKeys: ["project-1"],
        });
        expect(client.calls.at(-1)).toEqual({
            filter: { projectKeys: ["project-1"] },
            sort: [{ key: "updated_at", direction: "desc" }],
            page: { limit: 200 },
        } satisfies FetchAgentHistoryOptions);
    });
    it("uses each host's local project id when filtering a grouped project", async () => {
        const serverAClient = createClient([historyPayload({ entries: [] })]);
        const serverBClient = createClient([historyPayload({ entries: [] })]);
        await fetchAgentHistoryBatch({
            hosts: [
                {
                    serverId: "server-a",
                    serverLabel: "MacBook",
                    client: serverAClient,
                    projectKeys: ["project-a"],
                },
                {
                    serverId: "server-b",
                    serverLabel: "Linux box",
                    client: serverBClient,
                    projectKeys: ["project-b"],
                },
            ] satisfies AgentHistoryHost[],
            cursorByServerId: null,
        });
        expect(serverAClient.calls[0]?.filter).toEqual({ projectKeys: ["project-a"] });
        expect(serverBClient.calls[0]?.filter).toEqual({ projectKeys: ["project-b"] });
    });
});
