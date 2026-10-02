/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginAppState } from "@getpaseo/protocol/messages";
import type { HostedPluginProject } from "./plugin-project-host-model";
import { PluginProjectList } from "./plugin-project-list";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("react-native", () => ({
  Pressable: ({
    children,
    onPress,
    testID,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    testID?: string;
  }) => (
    <button type="button" data-testid={testID} onClick={onPress}>
      {children}
    </button>
  ),
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));

vi.mock("lucide-react-native", () => ({
  Plus: () => null,
  RefreshCw: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
}));

function state(updatedAt: string): PluginAppState {
  return {
    pluginId: "demo",
    appId: "console",
    projectId: "project-1",
    defaultAgent: { provider: "codex", model: "gpt-5.6" },
    knowledge: "",
    data: {},
    document: null,
    conversation: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

function project(serverId: string, hostLabel: string): HostedPluginProject {
  return {
    key: `${serverId}\u0000project-1`,
    serverId,
    hostLabel,
    state: state("2026-10-02T00:00:00.000Z"),
    projectId: "project-1",
    projectName: "支付对账",
    sourceDirectory: "/repo/payment",
    option: null,
  };
}

const noop = () => undefined;

describe("PluginProjectList", () => {
  afterEach(cleanup);

  it("shows the owning host and selects a cross-host project by its unique key", () => {
    const onSelect = vi.fn();
    render(
      <PluginProjectList
        projects={[project("host-a", "开发机"), project("host-b", "测试机")]}
        selectedProjectKey={null}
        loading={false}
        error={null}
        onSelect={onSelect}
        onCreate={noop}
        onRefresh={noop}
        compact={false}
      />,
    );

    expect(screen.getByText("开发机")).toBeTruthy();
    expect(screen.getByText("测试机")).toBeTruthy();

    fireEvent.click(screen.getByTestId("plugin-project-host-b-project-1"));
    expect(onSelect).toHaveBeenCalledWith("host-b\u0000project-1");
  });
});
