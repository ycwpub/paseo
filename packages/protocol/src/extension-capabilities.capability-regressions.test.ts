import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type {
  FileEntryCreateResponse,
  FileEntryDeleteResponse,
  FileEntryDuplicateResponse,
  FileEntryRenameResponse,
  FileSubscribeResponse,
  FileUnsubscribeResponse,
  FileUpdate,
  FileWriteResponse,
} from "./messages.js";
function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}
type PublicFileResponseTypes = [
  FileSubscribeResponse,
  FileUnsubscribeResponse,
  FileWriteResponse,
  FileEntryCreateResponse,
  FileEntryRenameResponse,
  FileEntryDuplicateResponse,
  FileEntryDeleteResponse,
  FileUpdate,
];
describe("extension protocol capability regressions", () => {
  test("keeps public file response and update types exported", () => {
    const publicTypesRemainImportable = true satisfies PublicFileResponseTypes extends readonly [
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
      unknown,
    ]
      ? true
      : false;
    expect(publicTypesRemainImportable).toBe(true);
  });
  test("keeps extension capabilities in the server status contract", () => {
    const messages = source("./messages.ts");
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
      "larkSubstituteModes",
      "larkDirectory",
      "larkDirectoryOpenIdLookup",
      "larkDirectoryPrivateUserScan",
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
      expect(messages).toContain(`${capability}: z.`);
    }
  });
  test("exports HTTP handlers and supports workflow and custom-node modes", () => {
    const exportsSource = source("./extension-resource-exports.ts");
    const httpManagement = source("./plugin/http-management.ts");
    expect(exportsSource).toContain("PluginHttpHandlerSchema");
    expect(exportsSource).toContain("type PluginHttpHandler");
    expect(httpManagement).toContain('mode: z.literal("workflow")');
    expect(httpManagement).toContain('mode: z.literal("custom_node")');
    expect(httpManagement).toContain("step: WorkflowStepSchema");
  });
});
