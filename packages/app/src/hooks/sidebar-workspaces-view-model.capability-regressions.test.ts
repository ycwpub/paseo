import { describe, expect, it } from "vitest";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import type { WorkspaceStructureProject } from "@/projects/workspace-structure";
import { buildSidebarProjectsFromStructure, createSidebarWorkspaceEntry, sortSidebarProjectsByActivity } from "./sidebar-workspaces-view-model";
function project(input: {
    projectKey: string;
    projectName?: string;
    projectKind?: WorkspaceStructureProject["projectKind"];
    iconWorkingDir?: string;
    workspaceKeys: string[];
    hosts?: Array<Omit<WorkspaceStructureProject["hosts"][number], "projectId"> & {
        projectId?: string;
    }>;
}): WorkspaceStructureProject {
    return {
        viewKey: input.projectKey,
        projectKey: input.projectKey,
        projectName: input.projectName ?? input.projectKey,
        projectKind: input.projectKind ?? "git",
        iconWorkingDir: input.iconWorkingDir ?? input.projectKey,
        hosts: Array.from(input.hosts ?? [
            {
                serverId: "srv",
                iconWorkingDir: input.iconWorkingDir ?? input.projectKey,
                worktreeSupport: "supported" as const,
            },
        ], (host) => Object.assign({}, host, { projectId: host.projectId ?? input.projectKey })),
        workspaceKeys: input.workspaceKeys,
    };
}
function workspace(input: {
    id: string;
    name: string;
    projectId: string;
    projectDisplayName: string;
    status?: WorkspaceDescriptor["status"];
    statusEnteredAt?: Date | null;
}): WorkspaceDescriptor {
    return {
        id: input.id,
        projectId: input.projectId,
        projectDisplayName: input.projectDisplayName,
        projectRootPath: `/repo/${input.projectId}`,
        workspaceDirectory: `/repo/${input.projectId}/${input.id}`,
        projectKind: "git",
        workspaceKind: input.name === "main" ? "local_checkout" : "worktree",
        name: input.name,
        status: input.status ?? "done",
        statusEnteredAt: input.statusEnteredAt ?? null,
        archivingAt: null,
        diffStat: null,
        scripts: [],
    };
}
describe("sortSidebarProjectsByActivity", () => {
    it("sorts projects and their workspaces by latest activity", () => {
        const projects = buildSidebarProjectsFromStructure({
            projects: [
                project({
                    projectKey: "project-a",
                    workspaceKeys: ["a-older", "a-newer"],
                }),
                project({
                    projectKey: "project-b",
                    workspaceKeys: ["b-newest"],
                }),
            ],
        });
        const workspaceEntriesByKey = new Map([
            ["a-older", "2026-08-09T10:00:00.000Z"],
            ["a-newer", "2026-08-09T11:00:00.000Z"],
            ["b-newest", "2026-08-09T12:00:00.000Z"],
        ].map(([id, activityAt]) => [
            `srv:${id}`,
            createSidebarWorkspaceEntry({
                serverId: "srv",
                workspace: workspace({
                    id,
                    name: id,
                    projectId: id.startsWith("a-") ? "project-a" : "project-b",
                    projectDisplayName: id.startsWith("a-") ? "project-a" : "project-b",
                    statusEnteredAt: new Date(activityAt),
                }),
            }),
        ]));
        const sorted = sortSidebarProjectsByActivity({ projects, workspaceEntriesByKey });
        expect(sorted.map((entry) => entry.viewKey)).toEqual(["project-b", "project-a"]);
        expect(sorted[1]?.workspaces.map((entry) => entry.workspaceId)).toEqual(["a-newer", "a-older"]);
    });
    it("preserves manual order when activity timestamps are equal", () => {
        const projects = buildSidebarProjectsFromStructure({
            projects: [
                project({ projectKey: "project-b", workspaceKeys: ["b-second", "b-first"] }),
                project({ projectKey: "project-a", workspaceKeys: ["a-first"] }),
            ],
        });
        const activityAt = new Date("2026-08-09T12:00:00.000Z");
        const workspaceEntriesByKey = new Map([
            ["b-second", "project-b"],
            ["b-first", "project-b"],
            ["a-first", "project-a"],
        ].map(([id, projectId]) => [
            `srv:${id}`,
            createSidebarWorkspaceEntry({
                serverId: "srv",
                workspace: workspace({
                    id,
                    name: id,
                    projectId,
                    projectDisplayName: projectId,
                    statusEnteredAt: activityAt,
                }),
            }),
        ]));
        const sorted = sortSidebarProjectsByActivity({ projects, workspaceEntriesByKey });
        expect(sorted.map((entry) => entry.viewKey)).toEqual(["project-b", "project-a"]);
        expect(sorted[0]?.workspaces.map((entry) => entry.workspaceId)).toEqual([
            "b-second",
            "b-first",
        ]);
    });
});
