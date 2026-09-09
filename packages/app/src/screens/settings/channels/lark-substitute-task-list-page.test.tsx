/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  LarkChannelBotStatus,
  LarkSubstituteMode,
  LarkSubstituteTask,
  LarkSubstituteTaskScanRange,
} from "@getpaseo/protocol/messages";
import { afterEach, describe, expect, test, vi } from "vitest";
import { LarkSubstituteTaskListPage } from "./lark-substitute-task-list-page";

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
    borderRadius: { sm: 4, md: 6, lg: 8 },
    fontSize: { sm: 13, base: 15 },
    fontWeight: { normal: "400" },
    colors: {
      border: "#444",
      foreground: "#fff",
      foregroundMuted: "#aaa",
      foregroundExtraMuted: "#777",
      primary: "#0a0",
      primaryForeground: "#fff",
      statusDanger: "#f00",
      statusSuccess: "#0f0",
      surface1: "#111",
      surface2: "#222",
      palette: { red: { 300: "#f66" } },
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

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const taskState = vi.hoisted(() => ({
  current: {
    tasks: [] as LarkSubstituteTask[],
    isLoading: false,
    isMutating: false,
    isScanning: false,
    error: null as Error | null,
    scanError: null as Error | null,
    scanNow: vi.fn(async (_scanRange: LarkSubstituteTaskScanRange) => ({
      enabledModeCount: 1,
      groupScanCount: 1,
      privateScanCount: 1,
    })),
    pauseTasks: vi.fn(async (_taskIds: string[]) => [] as LarkSubstituteTask[]),
    retryTasks: vi.fn(async (_taskIds: string[]) => [] as LarkSubstituteTask[]),
    deleteTasks: vi.fn(async (_taskIds: string[]) => [] as LarkSubstituteTask[]),
  },
}));

const confirmState = vi.hoisted(() => ({
  confirm: vi.fn(async () => true),
}));

vi.mock("./use-lark-substitute-tasks", () => ({
  useLarkSubstituteTasks: () => taskState.current,
}));

vi.mock("./lark-user-oauth-error-action", () => ({
  isLarkUserOAuthRequiredError: (message: string) =>
    message.includes("OAuth") && message.includes("权限"),
  LarkUserOAuthErrorAction: ({ appId, errorMessage }: { appId: string; errorMessage: string }) =>
    errorMessage.includes("OAuth") ? (
      <a aria-label="立即授权飞书用户身份" href={`https://example.com/oauth/${appId}`}>
        立即授权
      </a>
    ) : null,
}));

vi.mock("@/utils/confirm-dialog", () => ({
  confirmDialog: confirmState.confirm,
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

function task(
  id: string,
  status: LarkSubstituteTask["status"],
  source: LarkSubstituteTask["source"],
): LarkSubstituteTask {
  return {
    id,
    modeId: "mode-1",
    modeName: "工作替身",
    botId: "bot-1",
    source,
    chatId: "oc_group",
    chatName: "研发群",
    messageId: `om_${id}`,
    senderOpenId: "ou_sender",
    senderName: "张三",
    content: `问题 ${id}`,
    status,
    scheduledAt: status === "pending" ? "2026-09-07T10:10:00.000Z" : null,
    startedAt: status === "running" ? "2026-09-07T10:01:00.000Z" : null,
    completedAt: null,
    agentId: null,
    error: null,
    failureStage: null,
    createdAt: "2026-09-07T10:00:00.000Z",
    updatedAt: "2026-09-07T10:00:00.000Z",
  };
}

const substituteMode = {
  id: "mode-1",
  name: "工作替身",
  enabled: true,
  botId: "bot-1",
  privateScan: {
    enabled: true,
    intervalMinutes: 30,
    lookbackMinutes: 60,
    excludeRecentMinutes: 10,
  },
  disclosure: { enabled: true, prompt: "【机器人代答】" },
  customPrompt: "",
  delaySeconds: 600,
  autoArchiveAgent: false,
  activeTimeRanges: [],
  allowlist: [],
  denylist: [],
  target: {
    kind: "workspace",
    cwd: null,
    workspaceId: null,
  },
  createdAt: "2026-09-07T10:00:00.000Z",
  updatedAt: "2026-09-07T10:00:00.000Z",
} satisfies LarkSubstituteMode;

const configuredBot = {
  id: "bot-1",
  name: "测试机器人",
  enabled: true,
  connectionStatus: "connected",
  error: null,
  appId: "cli_test",
  hasAppSecret: true,
  hasEncryptKey: false,
  hasVerificationToken: false,
  domain: "feishu",
  target: {
    kind: "workspace",
    cwd: null,
    workspaceId: null,
  },
  substitute: {
    enabled: true,
    openId: null,
    name: null,
  },
  bot: null,
  pendingPairings: [],
  authorizedUsers: [],
} satisfies LarkChannelBotStatus;

function renderTaskList() {
  return render(
    <LarkSubstituteTaskListPage serverId="server-1" mode={substituteMode} bots={[configuredBot]} />,
  );
}

afterEach(() => {
  cleanup();
  taskState.current.tasks = [];
  taskState.current.isLoading = false;
  taskState.current.isMutating = false;
  taskState.current.isScanning = false;
  taskState.current.error = null;
  taskState.current.scanError = null;
  taskState.current.scanNow.mockReset();
  taskState.current.scanNow.mockResolvedValue({
    enabledModeCount: 1,
    groupScanCount: 1,
    privateScanCount: 1,
  });
  taskState.current.pauseTasks.mockReset();
  taskState.current.pauseTasks.mockResolvedValue([]);
  taskState.current.retryTasks.mockReset();
  taskState.current.retryTasks.mockResolvedValue([]);
  taskState.current.deleteTasks.mockReset();
  taskState.current.deleteTasks.mockResolvedValue([]);
  confirmState.confirm.mockReset();
  confirmState.confirm.mockResolvedValue(true);
});

describe("LarkSubstituteTaskListPage", () => {
  test("立即执行一次群消息和私聊扫描", async () => {
    renderTaskList();

    fireEvent.change(screen.getByTestId("lark-substitute-scan-lookback"), {
      target: { value: "120" },
    });
    fireEvent.change(screen.getByTestId("lark-substitute-scan-exclude-recent"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "立刻执行一次扫描" }));

    await waitFor(() => {
      expect(taskState.current.scanNow).toHaveBeenCalledWith({
        lookbackMinutes: 120,
        excludeRecentMinutes: 1,
      });
      expect(screen.getByText("扫描完成：群消息扫描 1 个，私聊扫描 1 个。")).toBeTruthy();
    });
  });

  test("非法的手动扫描范围不会发起扫描", async () => {
    renderTaskList();

    fireEvent.change(screen.getByTestId("lark-substitute-scan-lookback"), {
      target: { value: "60" },
    });
    fireEvent.change(screen.getByTestId("lark-substitute-scan-exclude-recent"), {
      target: { value: "60" },
    });
    fireEvent.click(screen.getByRole("button", { name: "立刻执行一次扫描" }));

    await waitFor(() => {
      expect(taskState.current.scanNow).not.toHaveBeenCalled();
      expect(screen.getByText("排除最近必须是非负整数，并且小于扫描范围。")).toBeTruthy();
    });
  });

  test("批量暂停时只提交待执行任务", async () => {
    taskState.current.tasks = [
      task("pending", "pending", "group_listener"),
      task("running", "running", "group_scan"),
    ];
    renderTaskList();

    fireEvent.click(screen.getByLabelText("选择全部替身任务"));
    fireEvent.click(screen.getByRole("button", { name: "暂停任务" }));

    await waitFor(() => {
      expect(taskState.current.pauseTasks).toHaveBeenCalledWith(["pending"]);
    });
  });

  test("支持单条和批量重试失败任务", async () => {
    taskState.current.tasks = [
      task("failed-1", "failed", "group_scan"),
      task("failed-2", "failed", "private_scan"),
      task("completed", "completed", "group_listener"),
    ];
    renderTaskList();

    const retryButtons = screen.getAllByRole("button", { name: "重试任务" });
    fireEvent.click(retryButtons[1]!);
    await waitFor(() => {
      expect(taskState.current.retryTasks).toHaveBeenCalledWith(["failed-1"]);
    });

    taskState.current.retryTasks.mockClear();
    fireEvent.click(screen.getByLabelText("选择全部替身任务"));
    fireEvent.click(screen.getAllByRole("button", { name: "重试任务" })[0]!);
    await waitFor(() => {
      expect(taskState.current.retryTasks).toHaveBeenCalledWith(["failed-1", "failed-2"]);
    });
  });

  test("确认后批量删除选中的监听和扫描任务", async () => {
    taskState.current.tasks = [
      task("listener", "pending", "group_listener"),
      task("scanner", "completed", "group_scan"),
    ];
    renderTaskList();

    fireEvent.click(screen.getByLabelText("选择全部替身任务"));
    fireEvent.click(screen.getByRole("button", { name: "删除任务" }));

    await waitFor(() => {
      expect(confirmState.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: "删除 2 个替身任务？" }),
      );
      expect(taskState.current.deleteTasks).toHaveBeenCalledWith(["listener", "scanner"]);
    });
  });

  test("展示失败阶段、错误详情和处理建议", () => {
    taskState.current.tasks = [
      {
        ...task("failed", "failed", "private_scan"),
        failureStage: "private_scan",
        error: "飞书用户 OAuth 缺少 im:message:readonly 权限",
      },
    ];

    renderTaskList();

    expect(screen.getByText("失败阶段：私聊扫描")).toBeTruthy();
    expect(screen.getByText("错误详情：飞书用户 OAuth 缺少 im:message:readonly 权限")).toBeTruthy();
    expect(screen.getByText(/请检查飞书用户 OAuth 权限/)).toBeTruthy();
    expect(screen.getByText("权限链接：")).toBeTruthy();
    expect(screen.getByRole("link", { name: "立即授权飞书用户身份" }).getAttribute("href")).toBe(
      "https://example.com/oauth/cli_test",
    );
  });

  test("非用户 OAuth 错误不展示授权链接", () => {
    taskState.current.tasks = [
      {
        ...task("failed", "failed", "group_scan"),
        failureStage: "group_scan",
        error: "读取群消息失败",
      },
    ];

    renderTaskList();

    expect(screen.queryByText("权限链接：")).toBeNull();
    expect(screen.queryByRole("link", { name: "立即授权飞书用户身份" })).toBeNull();
  });

  test("飞书限流展示真实原因且不提示重新授权", () => {
    taskState.current.tasks = [
      {
        ...task("failed", "failed", "private_scan"),
        failureStage: "private_scan",
        error: "飞书接口请求过于频繁（code=99991400）",
      },
    ];

    renderTaskList();

    expect(screen.getByText("错误详情：飞书接口请求过于频繁（code=99991400）")).toBeTruthy();
    expect(screen.getByText(/系统已自动限速并重试/)).toBeTruthy();
    expect(screen.queryByText("权限链接：")).toBeNull();
  });
});
