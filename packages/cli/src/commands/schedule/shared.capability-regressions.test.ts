import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { parseScheduleCreateInput, parseScheduleUpdateInput } from "../schedule-management/shared.js";
const baseOptions = {
    prompt: "do the thing",
    every: "5m",
    provider: "claude",
};
const baseCron = {
    prompt: "do the thing",
    cron: "0 9 * * *",
    provider: "claude",
};
describe("parseScheduleCreateInput cwd/host validation", () => {
    beforeEach(() => {
        vi.spyOn(process, "cwd").mockReturnValue("/local/project");
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });
    test("new-agent schedules can specify an assistant", () => {
        const input = parseScheduleCreateInput({ ...baseOptions, assistant: "assistant-1" });
        expect(input.target).toEqual({
            type: "new-agent",
            config: { provider: "claude", cwd: "/local/project", assistantId: "assistant-1" },
        });
    });
    test("--type bash creates a bash target from the prompt", () => {
        const input = parseScheduleCreateInput({
            prompt: "npm test",
            cron: "0 9 * * *",
            type: "bash",
            cwd: "/repo",
            shell: "/bin/bash",
            timeout: "2m",
        });
        expect(input).toMatchObject({
            prompt: "npm test",
            target: {
                type: "bash",
                config: {
                    cwd: "/repo",
                    shell: "/bin/bash",
                    timeoutMs: 120000,
                },
            },
        });
    });
    test("--type bash rejects agent provider flags", () => {
        expect(() => parseScheduleCreateInput({
            ...baseCron,
            type: "bash",
            cwd: "/repo",
        })).toThrow(expect.objectContaining({ code: "INVALID_SCHEDULE_TYPE" }));
    });
});
describe("parseScheduleUpdateInput", () => {
    test("parses assistant updates and clears", () => {
        expect(parseScheduleUpdateInput({ id: "abc", assistant: "assistant-1" })).toEqual({
            id: "abc",
            newAgentConfig: { assistantId: "assistant-1" },
        });
        expect(parseScheduleUpdateInput({ id: "abc", assistant: false })).toEqual({
            id: "abc",
            newAgentConfig: { assistantId: null },
        });
    });
    test("parses bash config updates when --type bash is specified", () => {
        expect(parseScheduleUpdateInput({
            id: "abc",
            type: "bash",
            cwd: "/tmp/proj",
            shell: "/bin/bash",
            timeout: "30s",
        })).toEqual({
            id: "abc",
            bashConfig: {
                cwd: "/tmp/proj",
                shell: "/bin/bash",
                timeoutMs: 30000,
            },
        });
    });
    test("infers bash update type from bash-only flags", () => {
        expect(parseScheduleUpdateInput({ id: "abc", shell: "" })).toEqual({
            id: "abc",
            bashConfig: { shell: null },
        });
        expect(parseScheduleUpdateInput({ id: "abc", clearTimeout: true })).toEqual({
            id: "abc",
            bashConfig: { timeoutMs: null },
        });
    });
});
