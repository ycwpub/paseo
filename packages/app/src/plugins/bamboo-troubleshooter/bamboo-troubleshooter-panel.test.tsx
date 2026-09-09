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
  enqueueAlertTroubleshooterRecord: vi.fn(),
  assistants: [{ id: "assistant-1", name: "结算助手", description: "处理结算问题" }],
  teams: [{ id: "team-1", name: "结算团队" }],
  project: {
    projectId: "project-1",
    projectName: "结算项目",
    sourceDirectory: "/tmp/settlement",
    defaultAgent: { provider: "aiden-codex", model: "gpt-5.5" },
    data: {} as Record<string, unknown>,
    fixedFormValues: {},
    hiddenFieldIds: [],
  },
}));

function validConfig() {
  return {
    version: 4,
    enabled: true,
    listenEnabled: true,
    troubleshootingEnabled: true,
    autoArchiveAgents: false,
    botId: "bot-1",
    chats: [
      { chatId: "oc_first", name: "结算报警一群", groupId: "group-1" },
      { chatId: "oc_second", name: "结算报警二群", groupId: "group-2" },
    ],
    target: { kind: "assistant", assistantId: "assistant-1" },
    troubleshootingSopDoc: "https://example.com/wiki/sop",
    attributionRecordRoot: "https://example.com/wiki/records",
    promptTemplate: "处理 {{record_id}}：{{message_text}}",
    queuePollIntervalMinutes: 5,
    schedule: {
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 120,
      excludeRecentMinutes: 0,
    },
  };
}

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
  ClipboardList: () => null,
  Play: () => null,
  Plus: () => null,
  Save: () => null,
  Trash2: () => null,
}));

vi.mock("@/plugins/alert-troubleshooter/alert-troubleshooter-task-list-page", () => ({
  AlertTroubleshooterTaskListPage: () => <div>任务执行记录页面</div>,
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
  SegmentedControl: ({
    options,
    value,
    onValueChange,
  }: {
    options: Array<{ value: string; label: string; disabled?: boolean }>;
    value: string;
    onValueChange: (value: string) => void;
  }) => (
    <div>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={option.disabled}
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
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
  useAssistants: () => ({ assistants: testState.assistants }),
}));

vi.mock("@/hooks/use-teams", () => ({
  useTeams: () => ({ teams: testState.teams }),
}));

vi.mock("@/plugins/project/plugin-project-default-agent-field", () => ({
  PluginProjectDefaultAgentField: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: { provider: string; model: string };
    onChange: (value: { provider: string; model: string }) => void;
  }) => (
    <label>
      <span>{label}</span>
      <select
        aria-label={label}
        value={`${value.provider}/${value.model}`}
        onChange={(event) => {
          const [provider, ...modelParts] = event.target.value.split("/");
          onChange({ provider: provider ?? "", model: modelParts.join("/") });
        }}
      >
        <option value="aiden-codex/gpt-5.5">aiden-codex / gpt-5.5</option>
        <option value="claude/claude-opus-4-6">claude / claude-opus-4-6</option>
      </select>
    </label>
  ),
}));

vi.mock("@/plugins/project/plugin-project-boundary", () => ({
  PluginProjectBoundary: ({
    children,
    renderDetailActions,
  }: {
    children: (project: typeof testState.project) => React.ReactNode;
    renderDetailActions?: (project: typeof testState.project) => React.ReactNode;
  }) => (
    <>
      {renderDetailActions?.(testState.project)}
      {children(testState.project)}
    </>
  ),
}));

vi.mock("@/runtime/host-features", () => ({
  useHostFeature: () => true,
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => ({
    configurePluginApp: testState.configurePluginApp,
    enqueueAlertTroubleshooterRecord: testState.enqueueAlertTroubleshooterRecord,
  }),
}));

vi.mock("@/screens/settings/channels/lark-directory-fields", () => ({
  LarkChatDirectoryField: () => null,
}));

vi.mock("@/screens/settings/channels/lark-bot-permission-error-action", () => ({
  LarkBotPermissionErrorAction: () => <div>更新机器人权限</div>,
}));

vi.mock("@/screens/settings/channels/use-lark-channel", () => ({
  useLarkChannel: () => ({
    status: {
      activeBotId: "bot-1",
      bots: [
        {
          id: "bot-1",
          appId: "cli_test",
          name: "结算机器人",
          connectionStatus: "connected",
        },
      ],
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
    testState.enqueueAlertTroubleshooterRecord.mockReset();
    testState.enqueueAlertTroubleshooterRecord.mockResolvedValue({
      queued: true,
      uniqueId: "result_id:123",
      resultId: "123",
      error: null,
    });
    testState.project.data = { bambooTroubleshooter: validConfig() };
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

    expect(screen.getByText("结算报警一群（oc_first）")).toBeTruthy();
    expect(screen.getByText("结算报警二群（oc_second）")).toBeTruthy();
    expect(screen.getByText("绑定机器人：结算机器人（cli_test） · 长连接：已连接")).toBeTruthy();
    expect(screen.getByText("更新机器人权限")).toBeTruthy();
    expect((screen.getByLabelText("排查 Provider 和模型（必填）") as HTMLSelectElement).value).toBe(
      "aiden-codex/gpt-5.5",
    );
    expect(screen.queryByRole("button", { name: "默认模型" })).toBeNull();
    expect(
      screen.getByText(
        "按配置的间隔、回看范围和排除最近时间扫描群消息，补偿飞书未实时投递的报警。",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/2 小时/u)).toBeNull();
    const promptVariables = screen.getByText(/可用变量：/).textContent ?? "";
    expect(promptVariables).toContain("{{project_id}}");
    expect(promptVariables).toContain("{{troubleshooting_sop_doc}}");
    expect(promptVariables).toContain("{{attribution_record_root}}");
    expect(promptVariables).not.toMatch(/\{\{[a-z0-9_]*[A-Z][a-zA-Z0-9_]*\}\}/u);
    const assistantButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent === "助手");
    expect(assistantButton?.getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("排除最近消息（分钟）") as HTMLInputElement).value).toBe("0");

    fireEvent.click(screen.getAllByRole("button", { name: "删除" })[0]!);
    expect(screen.queryByText("结算报警一群（oc_first）")).toBeNull();

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
              target: { kind: "assistant", assistantId: "assistant-1" },
              troubleshootingSopDoc: "https://example.com/wiki/sop",
              attributionRecordRoot: "https://example.com/wiki/records",
              listenEnabled: true,
              troubleshootingEnabled: true,
              promptTemplate: "处理 {{record_id}}：{{message_text}}",
              queuePollIntervalMinutes: 5,
            }),
          },
        }),
      ),
    );
    expect(screen.getByText("配置已保存，后台监听将在下一次同步时生效。")).toBeTruthy();
  });

  it("saves the selected model and exactly one of assistant or team", async () => {
    render(
      <BambooTroubleshooterPanel
        active
        serverId="host-1"
        plugin={plugin}
        appDefinition={appDefinition}
      />,
    );

    fireEvent.change(screen.getByLabelText("排查 Provider 和模型（必填）"), {
      target: { value: "claude/claude-opus-4-6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "团队" }));
    fireEvent.click(screen.getByRole("button", { name: "保存自动排查配置" }));

    await waitFor(() =>
      expect(testState.configurePluginApp).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultAgent: { provider: "claude", model: "claude-opus-4-6" },
          data: {
            [BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY]: expect.objectContaining({
              target: { kind: "team", teamId: "team-1" },
            }),
          },
        }),
      ),
    );
  });

  it("stores a Bamboo-only custom bot secret outside Plugin App data", async () => {
    render(
      <BambooTroubleshooterPanel
        active
        serverId="host-1"
        plugin={plugin}
        appDefinition={appDefinition}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "自定义机器人" }));
    fireEvent.change(screen.getByLabelText("自定义机器人 App ID"), {
      target: { value: "cli_custom" },
    });
    fireEvent.change(screen.getByLabelText("自定义机器人 App Secret"), {
      target: { value: "secret-value" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存自动排查配置" }));

    await waitFor(() =>
      expect(testState.configurePluginApp).toHaveBeenCalledWith(
        expect.objectContaining({
          credentials: { bambooBotAppSecret: "secret-value" },
          data: {
            [BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY]: expect.objectContaining({
              bot: {
                kind: "custom",
                credentialId: "project-1",
                appId: "cli_custom",
                hasAppSecret: true,
              },
            }),
          },
        }),
      ),
    );
  });

  it("persists listening, scanning, and troubleshooting switches independently", async () => {
    render(
      <BambooTroubleshooterPanel
        active
        serverId="host-1"
        plugin={plugin}
        appDefinition={appDefinition}
      />,
    );

    fireEvent.click(screen.getByLabelText("启用群消息监听"));
    fireEvent.click(screen.getByLabelText("启用定时扫描"));
    fireEvent.click(screen.getByLabelText("启用异步排查"));
    fireEvent.click(screen.getByRole("button", { name: "保存自动排查配置" }));

    await waitFor(() =>
      expect(testState.configurePluginApp).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            [BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY]: expect.objectContaining({
              listenEnabled: false,
              troubleshootingEnabled: false,
              schedule: expect.objectContaining({ enabled: false }),
            }),
          },
        }),
      ),
    );
  });

  it("persists the option to archive all agents after a task attempt finishes", async () => {
    render(
      <BambooTroubleshooterPanel
        active
        serverId="host-1"
        plugin={plugin}
        appDefinition={appDefinition}
      />,
    );

    fireEvent.click(screen.getByLabelText("Agent 执行完成后自动归档"));
    fireEvent.click(screen.getByRole("button", { name: "保存自动排查配置" }));

    await waitFor(() =>
      expect(testState.configurePluginApp).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            [BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY]: expect.objectContaining({
              autoArchiveAgents: true,
            }),
          },
        }),
      ),
    );
  });

  it("shows Chinese required-field errors instead of raw Zod JSON", async () => {
    testState.project.data = {};
    render(
      <BambooTroubleshooterPanel
        active
        serverId="host-1"
        plugin={plugin}
        appDefinition={appDefinition}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "保存自动排查配置" }));

    expect(await screen.findByText(/请至少添加一个监听飞书群/)).toBeTruthy();
    expect(screen.getByText(/请输入排查 SOP 飞书文档链接/)).toBeTruthy();
    expect(screen.getByText(/请输入归因记录根目录/)).toBeTruthy();
    expect(screen.queryByText(/invalid_format|"origin"|Too small/)).toBeNull();
    expect(testState.configurePluginApp).not.toHaveBeenCalled();
  });

  it("creates or reuses a Base record and queues a specified Bamboo result_id", async () => {
    render(
      <BambooTroubleshooterPanel
        active
        serverId="host-1"
        plugin={plugin}
        appDefinition={appDefinition}
      />,
    );

    fireEvent.change(screen.getByLabelText("指定 Bamboo 对账 result_id"), {
      target: { value: "123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "按 result_id 调试" }));

    await waitFor(() =>
      expect(testState.enqueueAlertTroubleshooterRecord).toHaveBeenCalledWith({
        pluginId: "bamboo-reconciliation-troubleshooter",
        appId: "bamboo-troubleshooter-console",
        projectId: "project-1",
        resultId: "123",
      }),
    );
    expect(screen.getByText("Bamboo result_id 123 已加入处理队列。")).toBeTruthy();
  });

  it("explains how to correct invalid document links", async () => {
    render(
      <BambooTroubleshooterPanel
        active
        serverId="host-1"
        plugin={plugin}
        appDefinition={appDefinition}
      />,
    );

    fireEvent.change(screen.getByLabelText("排查 SOP 飞书文档链接"), {
      target: { value: "invalid-sop" },
    });
    fireEvent.change(screen.getByLabelText("归因记录根目录"), {
      target: { value: "invalid-record" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存自动排查配置" }));

    expect(
      await screen.findByText(
        /排查 SOP 飞书文档链接格式无效，请输入完整的 http:\/\/ 或 https:\/\/ 链接/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/归因记录链接格式无效，请输入完整的 http:\/\/ 或 https:\/\/ 链接/),
    ).toBeTruthy();
    expect(testState.configurePluginApp).not.toHaveBeenCalled();
  });
});
