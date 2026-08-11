import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it } from "vitest";
import type { BoundCreateAgentCommand } from "../agent/create-agent/create.js";
import { WorkflowService } from "./service.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("Workflow Agent output repair", () => {
  it("returns the validator error to the Agent before retrying", async () => {
    const home = await mkdtemp(join(tmpdir(), "paseo-workflow-agent-repair-"));
    tempDirectories.push(home);
    const scriptPath = join(home, "workflow.json");
    await writeFile(
      scriptPath,
      JSON.stringify({
        apiVersion: "paseo.sh/workflow/v1",
        kind: "Workflow",
        version: 1,
        name: "Repair structured output",
        steps: [
          {
            id: "review",
            type: "agent",
            outputMode: "custom",
            initialPrompt: "Return the review result.",
            outputSchema: {
              type: "object",
              required: ["answer"],
              properties: { answer: { type: "string" } },
            },
            retry: {
              maxAttempts: 2,
              initialDelayMs: 0,
              maxDelayMs: 1,
              jitter: false,
            },
            config: { provider: "codex", cwd: home },
          },
        ],
      }),
    );
    const prompts: string[] = [];
    let invocation = 0;
    const service = new WorkflowService({
      paseoHome: home,
      logger: pino({ enabled: false }),
      agentManager: {
        runAgent: async (_agentId, prompt) => {
          prompts.push(typeof prompt === "string" ? prompt : prompt.text);
          invocation += 1;
          return {
            sessionId: `session-${invocation}`,
            finalText:
              invocation === 1 ? '{"data":{"wrong":true}}' : '{"data":{"answer":"corrected"}}',
            timeline: [],
            canceled: false,
          };
        },
        waitForAgentEvent: async () => ({
          status: "idle",
          permission: null,
          lastMessage: null,
        }),
        cancelAgentRun: async () => ({ status: "settled" }),
      },
      createAgent: (async () => ({
        snapshot: {
          id:
            invocation === 0
              ? "11111111-1111-4111-8111-111111111111"
              : "22222222-2222-4222-8222-222222222222",
        },
        initialPromptError: null,
      })) as BoundCreateAgentCommand,
      createDirectoryWorkspace: async ({ cwd }) =>
        ({ workspaceId: `workspace-${invocation}`, cwd }) as never,
      createPaseoWorktreeWorkspace: async () => {
        throw new Error("Worktree creation is not expected in this test");
      },
      archiveWorkspace: async () => undefined,
    });
    await service.start();

    const run = await service.runScriptAndWait({ scriptPath, inputPayload: "{}" });

    expect(run.status, run.error ?? undefined).toBe("succeeded");
    expect(JSON.parse(run.outputPayload ?? "{}")).toEqual({ answer: "corrected" });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("previous final answer was rejected");
    expect(prompts[1]).toContain("required property");
    expect(run.nodeRuns.map((nodeRun) => nodeRun.status)).toEqual(["failed", "succeeded"]);
    expect(run.nodeRuns[0]?.errorCode).toBe("WORKFLOW_OUTPUT_VALIDATION_FAILED");
  });
});
