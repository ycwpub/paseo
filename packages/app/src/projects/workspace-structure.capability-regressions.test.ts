import { describe, expect, test } from "vitest";
import type { ProjectDescriptor } from "@/stores/session-store";
import { buildWorkspaceStructureProjects } from "./workspace-structure";
function project(input: {
    id: string;
    key: string | null;
    root: string;
    name?: string;
    parentProjectId?: string;
}): ProjectDescriptor {
    return {
        projectId: input.id,
        parentProjectId: input.parentProjectId ?? null,
        projectKey: input.key,
        projectDisplayName: input.name ?? "acme/app",
        projectCustomName: null,
        projectRootPath: input.root,
        projectKind: "git",
    };
}
describe("buildWorkspaceStructureProjects", () => {
    test("maps a host-local parent Project id to the parent's display view key", () => {
        const result = buildWorkspaceStructureProjects({
            sessions: [
                {
                    serverId: "host-a",
                    projects: [
                        project({ id: "prj_parent", key: null, root: "/repos/parent" }),
                        project({
                            id: "prj_child",
                            key: null,
                            root: "/repos/child",
                            parentProjectId: "prj_parent",
                        }),
                    ],
                    workspaces: [],
                },
            ],
        });
        const parent = result.find((item) => item.hosts[0]?.projectId === "prj_parent");
        const child = result.find((item) => item.hosts[0]?.projectId === "prj_child");
        expect(child?.parentViewKey).toBe(parent?.viewKey);
    });
});
