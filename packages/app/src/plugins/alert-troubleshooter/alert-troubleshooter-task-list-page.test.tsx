/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertTroubleshooterTaskListPage } from "./alert-troubleshooter-task-list-page";

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

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 },
    borderRadius: { md: 6, lg: 8 },
    borderWidth: { 1: 1 },
    fontSize: { sm: 13, base: 15 },
    fontWeight: { semibold: "600" },
    colors: {
      border: "#444",
      destructive: "#f00",
      foreground: "#fff",
      foregroundMuted: "#aaa",
      success: "#0f0",
      surface1: "#111",
      surface2: "#222",
    },
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function"
        ? (factory as (value: typeof theme) => Record<string, unknown>)(theme)
        : factory,
  },
}));

vi.mock("lucide-react-native", () => ({
  Pause: () => null,
  Play: () => null,
  RefreshCw: () => null,
  RotateCcw: () => null,
  Trash2: () => null,
}));

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const client = vi.hoisted(() => ({
  listAlertTroubleshooterTasks: vi.fn(async () => ({ tasks: [], error: null })),
  scanAlertTroubleshooterNow: vi.fn(async () => ({
    tasks: [],
    matchedCount: 2,
    failureCount: 0,
    auditFile: "/tmp/manual-scan.json",
    error: null,
  })),
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => client,
}));

vi.mock("@/components/headers/back-header", () => ({
  BackHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
  }: {
    children: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/form-field", () => ({
  Field: ({ label, children }: { label: string; children: ReactNode }) => (
    <label>
      <span>{label}</span>
      {children}
    </label>
  ),
  FormTextInput: ({
    value,
    onChangeText,
    testID,
  }: {
    value?: string;
    onChangeText: (value: string) => void;
    testID?: string;
  }) => {
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        onChangeText(event.currentTarget.value);
      },
      [onChangeText],
    );
    return <input data-testid={testID} value={value ?? ""} onChange={handleChange} />;
  },
}));

vi.mock("@/screens/settings/channels/lark-user-oauth-error-action", () => ({
  isLarkUserOAuthRequiredError: () => false,
  LarkUserOAuthErrorAction: () => null,
}));

vi.mock("@/screens/settings/channels/lark-bot-permission-error-action", () => ({
  isLarkBotPermissionRequiredError: () => false,
  LarkBotPermissionErrorAction: () => null,
}));

vi.mock("@/utils/confirm-dialog", () => ({
  confirmDialog: vi.fn(async () => true),
}));

vi.mock("./alert-troubleshooter-task-actions", () => ({
  deleteAllAlertTroubleshooterTasks: vi.fn(async () => []),
  retryAlertTroubleshooterTask: vi.fn(async () => []),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const handleBack = () => {};

function renderPage() {
  return render(
    <AlertTroubleshooterTaskListPage
      active
      serverId="server-1"
      pluginId="bamboo-reconciliation-troubleshooter"
      appId="bamboo-troubleshooter-console"
      larkAppId="cli_test"
      larkBotId="bot-1"
      projectId="prj_1"
      projectName="Bamboo 对账自动排查"
      manualScanLookbackMinutes={120}
      manualScanExcludeRecentMinutes={0}
      manualScanSupported
      onBack={handleBack}
    />,
  );
}

describe("AlertTroubleshooterTaskListPage manual scan", () => {
  it("executes a one-off scan with the entered time range", async () => {
    renderPage();

    fireEvent.change(screen.getByTestId("alert-troubleshooter-scan-lookback"), {
      target: { value: "180" },
    });
    fireEvent.change(screen.getByTestId("alert-troubleshooter-scan-exclude-recent"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "立刻执行一次扫描" }));

    await waitFor(() =>
      expect(client.scanAlertTroubleshooterNow).toHaveBeenCalledWith({
        pluginId: "bamboo-reconciliation-troubleshooter",
        appId: "bamboo-troubleshooter-console",
        projectId: "prj_1",
        lookbackMinutes: 180,
        excludeRecentMinutes: 1,
      }),
    );
    expect(screen.getByText(/扫描完成：匹配 2 条，失败 0 条/)).toBeTruthy();
    expect(screen.getByText(/manual-scan\.json/)).toBeTruthy();
  });

  it("rejects an invalid one-off range without sending the RPC", async () => {
    renderPage();

    fireEvent.change(screen.getByTestId("alert-troubleshooter-scan-lookback"), {
      target: { value: "60" },
    });
    fireEvent.change(screen.getByTestId("alert-troubleshooter-scan-exclude-recent"), {
      target: { value: "60" },
    });
    fireEvent.click(screen.getByRole("button", { name: "立刻执行一次扫描" }));

    expect(await screen.findByText("排除最近必须是非负整数，并且小于扫描范围。")).toBeTruthy();
    expect(client.scanAlertTroubleshooterNow).not.toHaveBeenCalled();
  });
});
