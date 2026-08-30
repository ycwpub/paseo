import { describe, expect, test } from "vitest";
import { isGeneratedProjectId } from "./project/project-id.js";
import { generateProjectId } from "./workspace-registry-model.js";
describe("opaque registry ids", () => {
    test("generates opaque project ids", () => {
        expect(generateProjectId()).toMatch(/^prj_[0-9a-f]{16}$/);
        expect(isGeneratedProjectId("prj_0123456789abcdef")).toBe(true);
        expect(isGeneratedProjectId("remote:github.com/acme/repo")).toBe(false);
    });
});
