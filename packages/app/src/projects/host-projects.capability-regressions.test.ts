import { describe, expect, test } from "vitest";
import { getHostProjectSourceDirectory, hostProjectFromRoute } from "./host-project-model";
describe("host project lookups", () => {
    test("keeps a directoryless routed project selectable without inventing a source directory", () => {
        const routeProject = hostProjectFromRoute({
            serverId: "host-a",
            projectId: "prj_directoryless",
            displayName: "Planning",
        });
        expect(routeProject).not.toBeNull();
        expect(getHostProjectSourceDirectory(routeProject!, "host-a")).toBeNull();
        expect(routeProject).toMatchObject({
            projectName: "Planning",
            hosts: [{ projectId: "prj_directoryless", iconWorkingDir: "" }],
        });
    });
});
