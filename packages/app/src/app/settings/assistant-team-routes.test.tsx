/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import AssistantSettingsRoute from "./hosts/[serverId]/assistants/[assistantId]";
import InstructionTemplateSettingsRoute from "./hosts/[serverId]/instruction-templates/[templateId]";
import InstructionTemplatesSettingsRoute from "./hosts/[serverId]/instruction-templates";
import McpServerSettingsRoute from "./hosts/[serverId]/mcp-servers/[mcpServerId]";
import SkillSettingsRoute from "./hosts/[serverId]/skills/[skillId]";
import TeamSettingsRoute from "./hosts/[serverId]/teams/[teamId]";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

let routeParams: Record<string, string> = {};

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => routeParams,
}));

vi.mock("@/components/host-route-bootstrap-boundary", () => ({
  HostRouteBootstrapBoundary: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/screens/settings-screen", () => ({
  default: ({ view }: { view: unknown }) => (
    <div data-testid="settings-screen">{JSON.stringify(view)}</div>
  ),
}));

afterEach(() => {
  cleanup();
  routeParams = {};
});

describe("Assistant and Team settings routes", () => {
  test("opens Assistant creation and editing as second-level pages", () => {
    routeParams = { serverId: "host-1", assistantId: "new" };
    const create = render(<AssistantSettingsRoute />);
    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "assistant", serverId: "host-1" }),
    );
    create.unmount();

    routeParams = { serverId: "host-1", assistantId: "assistant-1" };
    render(<AssistantSettingsRoute />);
    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "assistant", serverId: "host-1", assistantId: "assistant-1" }),
    );
  });

  test("opens Team creation and editing as second-level pages", () => {
    routeParams = { serverId: "host-1", teamId: "new" };
    const create = render(<TeamSettingsRoute />);
    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "team", serverId: "host-1" }),
    );
    create.unmount();

    routeParams = { serverId: "host-1", teamId: "team-1" };
    render(<TeamSettingsRoute />);
    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "team", serverId: "host-1", teamId: "team-1" }),
    );
  });

  test("opens the global instruction template list and template detail pages", () => {
    routeParams = { serverId: "host-1" };
    const list = render(<InstructionTemplatesSettingsRoute />);
    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "instruction-templates", serverId: "host-1" }),
    );
    list.unmount();

    routeParams = { serverId: "host-1", templateId: "new" };
    const create = render(<InstructionTemplateSettingsRoute />);
    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "instruction-template", serverId: "host-1" }),
    );
    create.unmount();

    routeParams = { serverId: "host-1", templateId: "template-1" };
    render(<InstructionTemplateSettingsRoute />);
    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({
        kind: "instruction-template",
        serverId: "host-1",
        templateId: "template-1",
      }),
    );
  });

  test("opens MCP creation and editing as second-level pages", () => {
    routeParams = { serverId: "host-1", mcpServerId: "new" };
    const create = render(<McpServerSettingsRoute />);
    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "mcp-server", serverId: "host-1" }),
    );
    create.unmount();

    routeParams = { serverId: "host-1", mcpServerId: "mcp-1" };
    render(<McpServerSettingsRoute />);
    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "mcp-server", serverId: "host-1", mcpServerId: "mcp-1" }),
    );
  });

  test("opens Skill creation and editing as second-level pages", () => {
    routeParams = { serverId: "host-1", skillId: "new" };
    const create = render(<SkillSettingsRoute />);
    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "skill", serverId: "host-1" }),
    );
    create.unmount();

    routeParams = { serverId: "host-1", skillId: "skill-1" };
    render(<SkillSettingsRoute />);
    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "skill", serverId: "host-1", skillId: "skill-1" }),
    );
  });
});
