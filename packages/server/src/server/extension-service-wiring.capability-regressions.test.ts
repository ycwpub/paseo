import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
describe("extension server integration regressions", () => {
  test("advertises the extension protocol capabilities", () => {
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
      "skillManagement",
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
    expect(bootstrap).toContain("createOrchestrationSkills(daemonConfigStore)");
    expect(bootstrap).toContain("createWorkspaceLabelService({");
    expect(bootstrap).toContain("await workspaceLabelService.initialize()");
  });
  test("keeps main startup ordering and shared session services", () => {
    const bootstrap = source("./bootstrap.ts");
    const websocketServer = source("./websocket-server.ts");
    expect(bootstrap).toContain("startPaused: true");
    expect(bootstrap).toMatch(
      /await pluginService\.start\(\);\s+wsServer\.beginAcceptingConnections\(\);/,
    );
    expect(websocketServer).toContain(
      'private connectionLifecycle: "starting" | "accepting" | "stopping"',
    );
    expect(websocketServer).toContain("this.pluginSocketIds.has(ws)");
    expect(websocketServer).toContain("directorySync: this.directorySync");
    expect(websocketServer).toContain("orchestrationSkills: this.orchestrationSkills");
    expect(websocketServer).toContain(
      "workspaceLabelService: this.workspaceLabelService ?? undefined",
    );
    expect(websocketServer).toContain("directorySync: true");
    expect(websocketServer).toContain("{ workspaceLabels: true }");
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
