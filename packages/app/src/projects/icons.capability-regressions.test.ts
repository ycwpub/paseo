import { describe, expect, it } from "vitest";
import { resolveProjectIconLookup } from "./icons";
describe("project icon lookup", () => {
    it("uses the project ID for a directoryless project", () => {
        expect(resolveProjectIconLookup({ projectId: "prj_directoryless", iconWorkingDir: "" }, true)).toEqual({
            kind: "project",
            projectId: "prj_directoryless",
        });
    });
});
