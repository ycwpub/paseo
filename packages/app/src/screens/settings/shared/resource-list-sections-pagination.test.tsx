/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { McpSection } from "@/screens/settings/mcp/mcp-section";
import { SkillsSection } from "@/screens/settings/skills/skills-section";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      addEventListener: () => {},
      addListener: () => {},
      dispatchEvent: () => false,
      matches: false,
      media: "",
      onchange: null,
      removeEventListener: () => {},
      removeListener: () => {},
    }),
  });
});

const resourceState = vi.hoisted(() => ({
  skills: Array.from({ length: 21 }, (_, index) => ({
    id: `skill-${index + 1}`,
    name: `Skill ${index + 1}`,
    source: "user" as const,
    enabled: true,
    content: `# Skill ${index + 1}`,
    createdAt: 1,
    updatedAt: 1,
  })),
  mcpServers: Array.from({ length: 21 }, (_, index) => ({
    id: `mcp-${index + 1}`,
    name: `MCP ${index + 1}`,
    enabled: true,
    transport: { type: "stdio" as const, command: `mcp-${index + 1}` },
    createdAt: 1,
    updatedAt: 1,
    originalJson: "{}",
  })),
}));

vi.mock("@/runtime/host-features", () => ({
  useHostFeature: () => true,
}));

vi.mock("@/hooks/use-skills", () => ({
  useSkills: () => ({
    skills: resourceState.skills,
    isLoading: false,
    isConnected: true,
    error: null,
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    deleteSkill: vi.fn(),
    refreshSkills: vi.fn(),
    isMutating: false,
    mutationError: null,
  }),
}));

vi.mock("@/hooks/use-mcp-servers", () => ({
  useMcpServers: () => ({
    servers: resourceState.mcpServers,
    isLoading: false,
    isConnected: true,
    error: null,
    createServer: vi.fn(),
    updateServer: vi.fn(),
    deleteServer: vi.fn(),
    refreshServers: vi.fn(),
    testServer: vi.fn(),
    isMutating: false,
    mutationError: null,
  }),
}));

vi.mock("@/components/ui/switch", async () => {
  const react = await import("react");
  return {
    Switch: ({
      value,
      onValueChange,
      accessibilityLabel,
    }: {
      value: boolean;
      onValueChange: (value: boolean) => void;
      accessibilityLabel?: string;
    }) =>
      react.createElement("input", {
        type: "checkbox",
        checked: value,
        "aria-label": accessibilityLabel,
        onChange: (event: { target: { checked: boolean } }) => onValueChange(event.target.checked),
      }),
  };
});

vi.mock("@/screens/settings/shared/settings-list-pagination-controls", async () => {
  const react = await import("react");
  return {
    SettingsListPaginationControls: ({
      pagination,
      onPageChange,
      onPageSizeChange,
    }: {
      pagination: { page: number; pageSize: number };
      onPageChange: (page: number) => void;
      onPageSizeChange: (pageSize: number) => void;
    }) =>
      react.createElement(
        "div",
        null,
        react.createElement(
          "button",
          {
            type: "button",
            "aria-label": "下一页",
            onClick: () => onPageChange(pagination.page + 1),
          },
          "下一页",
        ),
        react.createElement(
          "button",
          {
            type: "button",
            "aria-label": "每页 20 条",
            onClick: () => onPageSizeChange(20),
          },
          "每页 20 条",
        ),
      ),
  };
});

afterEach(cleanup);

describe("Skill and MCP list pagination", () => {
  test("Skills default to ten items and allow changing the page size", () => {
    render(<SkillsSection serverId="server-1" onCreate={vi.fn()} onEdit={vi.fn()} />);

    expect(screen.getByText("Skill 10")).toBeTruthy();
    expect(screen.queryByText("Skill 11")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("Skill 11")).toBeTruthy();
    expect(screen.queryByText("Skill 1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "每页 20 条" }));
    expect(screen.getByText("Skill 20")).toBeTruthy();
    expect(screen.queryByText("Skill 21")).toBeNull();
  });

  test("MCP defaults to ten items and allows changing the page size", () => {
    render(<McpSection serverId="server-1" onCreate={vi.fn()} onEdit={vi.fn()} />);

    expect(screen.getByText("MCP 10")).toBeTruthy();
    expect(screen.queryByText("MCP 11")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(screen.getByText("MCP 11")).toBeTruthy();
    expect(screen.queryByText("MCP 1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "每页 20 条" }));
    expect(screen.getByText("MCP 20")).toBeTruthy();
    expect(screen.queryByText("MCP 21")).toBeNull();
  });
});
