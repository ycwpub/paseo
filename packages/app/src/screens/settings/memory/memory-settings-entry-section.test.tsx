/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { MemorySettingsEntrySection } from "./memory-settings-entry-section";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const push = vi.hoisted(() => vi.fn());

vi.mock("expo-router", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
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

describe("MemorySettingsEntrySection", () => {
  test("opens every memory management feature on a second-level route", () => {
    render(<MemorySettingsEntrySection serverId="host-1" memoryCount={12} syncSupported={true} />);

    expect(screen.getByText("记忆内容")).toBeTruthy();
    expect(screen.getByText("记忆规范")).toBeTruthy();
    expect(screen.getByText("总记忆文件")).toBeTruthy();
    expect(screen.getByText("多主机记忆同步")).toBeTruthy();
    expect(screen.getByText("导入与导出")).toBeTruthy();

    const buttons = screen.getAllByRole("button", { name: "打开" });
    for (const button of buttons) fireEvent.click(button);

    expect(push.mock.calls.map(([route]) => route)).toEqual([
      "/settings/hosts/host-1/memories",
      "/settings/hosts/host-1/memory/policies",
      "/settings/hosts/host-1/memory/summary",
      "/settings/hosts/host-1/memory/sync",
      "/settings/hosts/host-1/memory/transfer",
    ]);
  });

  test("hides multi-host sync when the daemon does not support it", () => {
    render(<MemorySettingsEntrySection serverId="host-1" memoryCount={0} syncSupported={false} />);

    expect(screen.queryByText("多主机记忆同步")).toBeNull();
    expect(screen.getAllByRole("button", { name: "打开" })).toHaveLength(4);
  });
});
