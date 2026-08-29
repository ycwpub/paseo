/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { HostResourceSyncEntrySection } from "./host-resource-sync-entry-section";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const push = vi.hoisted(() => vi.fn());

vi.mock("expo-router", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("react-native", () => ({
  View: ({ children, testID }: { children?: ReactNode; testID?: string }) => (
    <div data-testid={testID}>{children}</div>
  ),
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("@/screens/settings/settings-section", () => ({
  SettingsSection: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("HostResourceSyncEntrySection", () => {
  test("opens each shared resource in its own second-level page", () => {
    render(<HostResourceSyncEntrySection serverId="host-1" />);

    expect(screen.getByText("多主机共享")).toBeTruthy();
    for (const title of ["同步记忆", "同步知识", "同步 MCP", "同步技能", "同步插件", "同步助手"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }

    for (const button of screen.getAllByRole("button", { name: "打开" })) {
      fireEvent.click(button);
    }

    expect(push.mock.calls.map(([route]) => route)).toEqual([
      "/settings/hosts/host-1/connections/sync/memory",
      "/settings/hosts/host-1/connections/sync/knowledge",
      "/settings/hosts/host-1/connections/sync/mcp",
      "/settings/hosts/host-1/connections/sync/skills",
      "/settings/hosts/host-1/connections/sync/plugins",
      "/settings/hosts/host-1/connections/sync/assistants",
    ]);
  });
});
