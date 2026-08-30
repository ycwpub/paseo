import { afterEach, describe, expect, test, vi } from "vitest";
import { MockLoadTestAgentClient } from "./mock-load-test-agent.js";
describe("MockLoadTestAgentClient", () => {
    afterEach(() => {
        vi.useRealTimers();
    });
    test("returns a declared workflow node result for workflow smoke tests", async () => {
        vi.useFakeTimers();
        const client = new MockLoadTestAgentClient();
        const session = await client.createSession({
            provider: "mock",
            cwd: process.cwd(),
            model: "ten-second-stream",
        });
        const resultPromise = session.run('MOCK_WORKFLOW_RESULT: {"filePath":"/tmp/output.txt","control":"[\\"a\\",\\"b\\"]","error":""}');
        await vi.advanceTimersByTimeAsync(0);
        await expect(resultPromise).resolves.toMatchObject({
            finalText: JSON.stringify({
                filePath: "/tmp/output.txt",
                control: '["a","b"]',
                error: "",
            }),
            canceled: false,
        });
    });
});
