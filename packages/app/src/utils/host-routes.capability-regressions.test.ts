import { describe, expect, it } from "vitest";
import {
  buildAssistantSettingsRoute,
  buildAssistantMemorySettingsRoute,
  buildSkillSettingsRoute,
  buildTeamSettingsRoute,
  buildHostMemoryDetailRoute,
  buildHostMemoryRoute,
  buildHostMemorySettingsPageRoute,
  buildHostResourceSyncRoute,
  buildInstructionTemplateSettingsRoute,
  buildInstructionTemplatesSettingsRoute,
  buildMcpServerSettingsRoute,
  buildProjectMemoryDetailRoute,
  buildProjectMemoryRoute,
  buildProjectKnowledgeSettingsRoute,
  buildProjectLarkGroupsSettingsRoute,
  normalizeHostResourceSyncPage,
  normalizeHostSectionSlug,
  normalizeHostMemorySettingsPage,
} from "./host-feature-routes";
describe("projects settings routes", () => {
  it("buildProjectLarkGroupsSettingsRoute opens the Project 飞书群上下文二级页面", () => {
    expect(buildProjectLarkGroupsSettingsRoute("host a", "project/1")).toBe(
      "/settings/hosts/host%20a/projects/project%2F1/lark-groups",
    );
  });
  it("builds Assistant create and edit routes", () => {
    expect(buildAssistantSettingsRoute("host a")).toBe("/settings/hosts/host%20a/assistants/new");
    expect(buildAssistantSettingsRoute("host a", "assistant/1")).toBe(
      "/settings/hosts/host%20a/assistants/assistant%2F1",
    );
    expect(buildAssistantMemorySettingsRoute("host a", "assistant/1")).toBe(
      "/settings/hosts/host%20a/assistants/assistant%2F1/memory",
    );
  });
  it("builds Team create and edit routes", () => {
    expect(buildTeamSettingsRoute("host a")).toBe("/settings/hosts/host%20a/teams/new");
    expect(buildTeamSettingsRoute("host a", "team/1")).toBe(
      "/settings/hosts/host%20a/teams/team%2F1",
    );
  });
  it("builds global instruction template list, create, and edit routes", () => {
    expect(buildInstructionTemplatesSettingsRoute("host a")).toBe(
      "/settings/hosts/host%20a/instruction-templates",
    );
    expect(buildInstructionTemplateSettingsRoute("host a")).toBe(
      "/settings/hosts/host%20a/instruction-templates/new",
    );
    expect(buildInstructionTemplateSettingsRoute("host a", "template/1")).toBe(
      "/settings/hosts/host%20a/instruction-templates/template%2F1",
    );
  });
  it("builds MCP server create and edit routes", () => {
    expect(buildMcpServerSettingsRoute("host a")).toBe("/settings/hosts/host%20a/mcp-servers/new");
    expect(buildMcpServerSettingsRoute("host a", "mcp/1")).toBe(
      "/settings/hosts/host%20a/mcp-servers/mcp%2F1",
    );
  });
  it("builds Skill create and edit routes", () => {
    expect(buildSkillSettingsRoute("host a")).toBe("/settings/hosts/host%20a/skills/new");
    expect(buildSkillSettingsRoute("host a", "skill/1")).toBe(
      "/settings/hosts/host%20a/skills/skill%2F1",
    );
  });
  it("builds host memory list and detail routes", () => {
    expect(buildHostMemoryRoute("host a")).toBe("/settings/hosts/host%20a/memories");
    expect(buildHostMemoryDetailRoute("host a", "memory/1")).toBe(
      "/settings/hosts/host%20a/memories/memory%2F1",
    );
  });
  it("builds and validates host memory settings page routes", () => {
    expect(buildHostMemorySettingsPageRoute("host a", "policies")).toBe(
      "/settings/hosts/host%20a/memory/policies",
    );
    expect(normalizeHostMemorySettingsPage("summary")).toBe("summary");
    expect(normalizeHostMemorySettingsPage("unknown")).toBeNull();
  });
  it("builds and validates host resource sync routes", () => {
    expect(buildHostResourceSyncRoute("host a", "memory")).toBe(
      "/settings/hosts/host%20a/connections/sync/memory",
    );
    expect(normalizeHostResourceSyncPage("knowledge")).toBe("knowledge");
    expect(normalizeHostResourceSyncPage("unknown")).toBeNull();
  });
  it("builds project memory list and detail routes", () => {
    expect(buildProjectMemoryRoute("host a", "project/1")).toBe(
      "/settings/hosts/host%20a/projects/project%2F1/memories",
    );
    expect(buildProjectMemoryDetailRoute("host a", "project/1", "memory/1")).toBe(
      "/settings/hosts/host%20a/projects/project%2F1/memories/memory%2F1",
    );
  });
  it("builds the Project knowledge settings route", () => {
    expect(buildProjectKnowledgeSettingsRoute("host a", "project/1")).toBe(
      "/settings/hosts/host%20a/projects/project%2F1/knowledge",
    );
  });
});
describe("host settings section slugs", () => {
  it("keeps current host settings sections", () => {
    expect(normalizeHostSectionSlug("connections")).toBe("connections");
    expect(normalizeHostSectionSlug("relay")).toBe("relay");
    expect(normalizeHostSectionSlug("agents")).toBe("agents");
    expect(normalizeHostSectionSlug("metadata")).toBe("metadata");
    expect(normalizeHostSectionSlug("knowledge")).toBe("knowledge");
    expect(normalizeHostSectionSlug("plugins")).toBe("plugins");
    expect(normalizeHostSectionSlug("workspaces")).toBe("workspaces");
    expect(normalizeHostSectionSlug("projects")).toBe("projects");
    expect(normalizeHostSectionSlug("providers")).toBe("providers");
    expect(normalizeHostSectionSlug("usage")).toBe("usage");
    expect(normalizeHostSectionSlug("host")).toBe("host");
  });
});
