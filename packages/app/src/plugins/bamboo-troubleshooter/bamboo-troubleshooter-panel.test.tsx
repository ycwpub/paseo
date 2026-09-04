/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Test stubs translate DOM events into React Native callback shapes. */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY,
  type PluginAppDefinition,
  type PluginSummary,
} from "@getpaseo/protocol/messages";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const testState = vi.hoisted(() => ({
  configurePluginApp: vi.fn(),
  project: {
    projectId: "project-1",
    projectName: "结算项目",
    sourceDirectory: "/tmp/settlement",
    defaultAgent: { provider: "aiden-codex", model: "gpt-5.5" },
    data: {
      bambooTroubleshooter: {
        version: 1,
        enabled: true,
        botId: "bot-1",
        chats: [
          { chatId: "oc_first", name: "结算报警一群", groupId: "group-1" },
          { chatId: "oc_second", name: "结算报警二群", groupId: "group-2" },
        ],
        target: { kind: "default" },
        troubleshootingSopDoc: "https://example.com/wiki/sop",
        attributionRecordRoot: "https://example.com/wiki/records",
        schedule: {
          enabled: true,
          intervalMinutes: 30,
          lookbackMinutes: 120,
          excludeRecentMinutes: 30,
        },
      },
    },
    fixedFormValues: {},
    hiddenFieldIds: [],
  },
}));

vi.mock("react-native", () => ({
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => ({}),
  },
}));

vi.mock("lucide-react-native", () => ({
  Plus: () => null,
  Save: () => null,
  Trash2: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    disabled,
    onPress,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    onPress?: () => void;
  }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/form-field", () => ({
  Field: ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label>
      <span>{label}</span>
      {children}
    </label>
  ),
  FormTextInput: ({
    value,
    onChangeText,
  }: {
    value: string;
    onChangeText: (value: string) => void;
  }) => <input value={value} onChange={(event) => onChangeText(event.target.value)} />,
}));

vi.mock("@/components/ui/segmented-control", () => ({
  SegmentedControl: () => null,
}));

vi.mock("@/components/ui/select-field", () => ({
  SelectField: ({ label, value }: { label: string; value: string | null }) => (
    <label>
      <span>{label}</span>
      <input readOnly value={value ?? ""} />
    </label>
  ),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    value,
    accessibilityLabel,
    onValueChange,
  }: {
    value: boolean;
    accessibilityLabel?: string;
    onValueChange: (value: boolean) => void;
  }) => (
    <input
      type="checkbox"
      aria-label={accessibilityLabel}
      checked={value}
      onChange={(event) => onValueChange(event.target.checked)}
    />
  ),
}));

vi.mock("@/hooks/use-assistants", () => ({
  useAssistants: () => ({ assistants: [] }),
}));

vi.mock("@/hooks/use-teams", () => ({
  useTeams: () => ({ teams: [] }),
}));

vi.mock("@/plugins/project/plugin-project-boundary", () => ({
  PluginProjectBoundary: ({
    children,
  }: {
    children: (project: typeof testState.project) => React.ReactNode;
  }) => <>{children(testState.project)}</>,
}));

vi.mock("@/runtime/host-features", () => ({
  useHostFeature: () => true,
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => ({
    configurePluginApp: testState.configurePluginApp,
  }),
}));

vi.mock("@/screens/settings/channels/lark-directory-fields", () => ({
  LarkChatDirectoryField: () => null,
}));

vi.mock("@/screens/settings/channels/use-lark-channel", () => ({
  useLarkChannel: () => ({
    status: {
      activeBotId: "bot-1",
      bots: [{ id: "bot-1", appId: "cli_test", name: "结算机器人" }],
      directory: { chats: [] },
    },
    resolveDirectoryChats: vi.fn(),
  }),
}));

import { BambooTroubleshooterPanel } from "./bamboo-troubleshooter-panel";

const plugin = {
  pluginId: "bamboo-reconciliation-troubleshooter",
  name: "bamboo-reconciliation-troubleshooter",
} as PluginSummary;

const appDefinition = {
  id: "bamboo-troubleshooter-console",
  name: "Bamboo 对账自动排查",
} as PluginAppDefinition;

describe("BambooTroubleshooterPanel", () => {
  beforeEach(() => {
    testState.configurePluginApp.mockReset();
    testState.configurePluginApp.mockResolvedValue({ app: { id: "configured" }, error: null });
  });

  afterEach(cleanup);

  it("shows multiple monitored chats and persists the remaining chats after deletion", async () => {
    render(
      <BambooTroubleshooterPanel
        active
        serverId="host-1"
        plugin={plugin}
        appDefinition={appDefinition}
      />,
    );

    expect(screen.getByText("结算报警一群 · group-1 · oc_first")).toBeTruthy();
    expect(screen.getByText("结算报警二群 · group-2 · oc_second")).toBeTruthy();
    expect(screen.getByText("排查模型：aiden-codex · gpt-5.5")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]!);
    expect(screen.queryByText("结算报警一群 · group-1 · oc_first")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "保存自动排查配置" }));

    await waitFor(() =>
      expect(testState.configurePluginApp).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginId: "bamboo-reconciliation-troubleshooter",
          appId: "bamboo-troubleshooter-console",
          projectId: "project-1",
          defaultAgent: { provider: "aiden-codex", model: "gpt-5.5" },
          data: {
            [BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY]: expect.objectContaining({
              chats: [{ chatId: "oc_second", name: "结算报警二群", groupId: "group-2" }],
              troubleshootingSopDoc: "https://example.com/wiki/sop",
              attributionRecordRoot: "https://example.com/wiki/records",
            }),
          },
        }),
      ),
    );
    expect(screen.getByText("配置已保存，后台监听将在下一次同步时生效。")).toBeTruthy();
  });
});
