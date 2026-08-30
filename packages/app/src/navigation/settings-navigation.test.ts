import { beforeEach, describe, expect, test, vi } from "vitest";
import { returnFromSettings } from "./settings-navigation";

const mocks = vi.hoisted(() => ({
  dismissTo: vi.fn(),
  replace: vi.fn(),
  navigateToLastWorkspace: vi.fn(() => false),
}));

vi.mock("expo-router", () => ({
  router: {
    dismissTo: mocks.dismissTo,
    push: vi.fn(),
    replace: mocks.replace,
  },
}));

vi.mock("@/stores/navigation-active-workspace-store", () => ({
  navigateToLastWorkspace: mocks.navigateToLastWorkspace,
}));

describe("returnFromSettings", () => {
  beforeEach(() => {
    mocks.dismissTo.mockReset();
    mocks.replace.mockReset();
    mocks.navigateToLastWorkspace.mockReset();
    mocks.navigateToLastWorkspace.mockReturnValue(false);
  });

  test("returns a host memory detail to the memory content list", () => {
    returnFromSettings({
      kind: "memory",
      serverId: "host-1",
      memoryId: "memory-1",
    });

    expect(mocks.dismissTo).toHaveBeenCalledWith("/settings/hosts/host-1/memories");
  });

  test("returns Assistant memory to its Assistant editor", () => {
    returnFromSettings({
      kind: "assistant-memory",
      serverId: "host-1",
      assistantId: "assistant-1",
    });

    expect(mocks.dismissTo).toHaveBeenCalledWith("/settings/hosts/host-1/assistants/assistant-1");
  });

  test("returns a Project memory detail to its Project memory content list", () => {
    returnFromSettings({
      kind: "memory",
      serverId: "host-1",
      projectId: "project-1",
      memoryId: "memory-1",
    });

    expect(mocks.dismissTo).toHaveBeenCalledWith(
      "/settings/hosts/host-1/projects/project-1/memories",
    );
  });

  test("returns the host memory content list to the first-level memory page", () => {
    returnFromSettings({
      kind: "memory",
      serverId: "host-1",
    });

    expect(mocks.dismissTo).toHaveBeenCalledWith("/settings/hosts/host-1/memory");
  });

  test("returns an instruction template detail to the template list", () => {
    returnFromSettings({
      kind: "instruction-template",
      serverId: "host-1",
      templateId: "template-1",
    });

    expect(mocks.dismissTo).toHaveBeenCalledWith("/settings/hosts/host-1/instruction-templates");
  });

  test("returns the instruction template list to the Agent page", () => {
    returnFromSettings({
      kind: "instruction-templates",
      serverId: "host-1",
    });

    expect(mocks.dismissTo).toHaveBeenCalledWith("/settings/hosts/host-1/agents");
  });

  test("returns the Project 飞书群上下文 page to Project settings", () => {
    returnFromSettings({
      kind: "project-lark-groups",
      serverId: "host-1",
      projectId: "project-1",
    });

    expect(mocks.dismissTo).toHaveBeenCalledWith("/settings/hosts/host-1/projects/project-1");
  });

  test("returns the Project 知识 page to Project settings", () => {
    returnFromSettings({
      kind: "project-knowledge",
      serverId: "host-1",
      projectId: "project-1",
    });

    expect(mocks.dismissTo).toHaveBeenCalledWith("/settings/hosts/host-1/projects/project-1");
  });

  test("returns MCP and Skill editors to their first-level pages", () => {
    returnFromSettings({
      kind: "mcp-server",
      serverId: "host-1",
      mcpServerId: "mcp-1",
    });
    expect(mocks.dismissTo).toHaveBeenLastCalledWith("/settings/hosts/host-1/mcp");

    returnFromSettings({
      kind: "skill",
      serverId: "host-1",
      skillId: "skill-1",
    });
    expect(mocks.dismissTo).toHaveBeenLastCalledWith("/settings/hosts/host-1/skills");
  });
});
