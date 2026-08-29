import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("feature_paseo server integration parity", () => {
  test("advertises the branch protocol capabilities", () => {
    const websocketServer = source("./websocket-server.ts");

    for (const capability of [
      "projectCreateDirectoryless",
      "projectHierarchy",
      "projectConfigById",
      "workflowPython",
      "workflowNodeRun",
      "workflowNodeInputMode",
      "workflowInputConfiguration",
      "workflowCommandResultFd3",
      "workflowProtocolVersion",
      "workflowProtocolRevision",
      "larkChannel",
      "larkReminders",
      "larkDirectory",
      "larkUserOAuth",
      "assistants",
      "memory",
      "memoryPolicies",
      "memoryScopePolicies",
      "memoryUsers",
      "memorySync",
      "localResourceSync",
      "cloudKnowledgeCache",
      "reasoningTranslation",
      "teams",
      "mcpServers",
      "skills",
      "plugins",
      "pluginManagement",
      "pluginProjectScopedApps",
      "pluginProjectDefaultAgent",
      "pluginProjectManagement",
      "pluginProjectCopy",
      "pluginAppHtmlPreview",
      "pluginAppJobList",
      "pluginAppJobMutation",
      "pluginAppJobDrafts",
      "pluginHttpServiceSubmit",
      "pluginHttpServiceManagement",
      "pluginHttpServiceLocalTesting",
    ]) {
      expect(websocketServer).toContain(`${capability}:`);
    }
  });

  test("boots workflow, memory, plugin, and Lark services", () => {
    const bootstrap = source("./bootstrap.ts");

    expect(bootstrap).toContain("new WorkflowService");
    expect(bootstrap).toContain("new PaseoMemoryService");
    expect(bootstrap).toContain("new UnifiedPluginService");
    expect(bootstrap).toContain("new LarkChannelService");
  });

  test("routes workflow, memory, plugin, Lark, and reasoning requests", () => {
    const session = source("./session.ts");

    expect(session).toContain("this.workflowSession.handleListRequest");
    expect(session).toContain("this.workflowSession.handleRunRequest");
    expect(session).toContain("this.memorySession?.handleRequest");
    expect(session).toContain("this.pluginSession?.handleRequest");
    expect(session).toContain("this.larkChannelSession?.handleRequest");
    expect(session).toContain("this.reasoningTranslationSession.handleRequest");
  });

  test("executes HTTP routes through workflow or custom-node handlers", () => {
    const manager = source("./plugin/plugin-http-service-manager.ts");
    const customWorkflow = source("./plugin/plugin-http-custom-workflow.ts");

    expect(manager).toContain('handler.mode === "workflow"');
    expect(manager).toContain("materializePluginHttpCustomWorkflow");
    expect(customWorkflow).toContain("buildPluginHttpCustomWorkflow");
    expect(customWorkflow).toContain("WorkflowScriptSchema.parse");
  });
});
