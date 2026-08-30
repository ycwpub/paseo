import { describe, expect, it } from "vitest";
import { parseServerInfoStatusPayload, SessionInboundMessageSchema, SessionOutboundMessageSchema } from "./messages.js";
describe("project command-center protocol", () => {
    it("parses directoryless project creation without a filesystem path", () => {
        expect(SessionInboundMessageSchema.parse({
            type: "project.create_directoryless.request",
            name: "Planning",
            requestId: "req-directoryless",
        })).toEqual({
            type: "project.create_directoryless.request",
            name: "Planning",
            requestId: "req-directoryless",
        });
        expect(SessionOutboundMessageSchema.parse({
            type: "project.create_directoryless.response",
            payload: {
                requestId: "req-directoryless",
                project: {
                    projectId: "prj_directoryless",
                    projectDisplayName: "Planning",
                    projectCustomName: null,
                    projectRootPath: "",
                    projectDirectoryless: true,
                    projectKind: "non_git",
                },
                error: null,
            },
        }).payload.project).toMatchObject({
            projectRootPath: "",
            projectDirectoryless: true,
        });
    });
    it("keeps project command feature flags optional for older server_info payloads", () => {
        const parsed = parseServerInfoStatusPayload({
            status: "server_info",
            serverId: "server-old",
            features: {},
        });
        expect(parsed.features?.workspaceGithubRepositorySearch).toBeUndefined();
        expect(parsed.features?.projectGithubClone).toBeUndefined();
        expect(parsed.features?.projectCreateDirectory).toBeUndefined();
        expect(parsed.features?.projectCreateDirectoryless).toBeUndefined();
    });
});
