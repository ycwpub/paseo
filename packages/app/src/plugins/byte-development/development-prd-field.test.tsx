/**
 * @vitest-environment jsdom
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DevelopmentPrdField } from "./development-prd-field";
import type { DevelopmentPrdSourceValue } from "./development-prd-source-model";

const hostRuntime = vi.hoisted(() => ({
  client: null as Record<string, unknown> | null,
  supported: false,
}));
const runDevelopmentMeegoAction = vi.hoisted(() => vi.fn());

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      typeof factory === "function"
        ? factory({
            spacing: [0, 4, 8, 12, 16],
            borderWidth: [0, 1],
            borderRadius: { lg: 8 },
            fontSize: { sm: 14 },
            fontWeight: { medium: "500" },
            colors: {
              border: "#ddd",
              surface2: "#f5f5f5",
              foreground: "#111",
              statusDanger: "#c00",
            },
          })
        : factory,
  },
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => hostRuntime.client,
}));

vi.mock("@/runtime/host-features", () => ({
  useHostFeature: () => hostRuntime.supported,
}));

vi.mock("./development-meego-client", () => ({
  runDevelopmentMeegoAction,
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
  }) => React.createElement("button", { type: "button", disabled, onClick: onPress }, children),
}));

vi.mock("@/components/ui/select-field", () => ({
  SelectField: ({ label }: { label?: string }) => React.createElement("div", null, label),
}));

vi.mock("@/components/ui/form-field", () => ({
  Field: ({ label, children }: { label: string; children: React.ReactNode }) =>
    React.createElement("label", null, label, children),
  FormTextInput: ({
    initialValue,
    placeholder,
    resetKey,
  }: {
    initialValue?: string;
    placeholder?: string;
    resetKey?: string | number;
  }) =>
    React.createElement("textarea", {
      defaultValue: initialValue,
      placeholder,
      "data-reset-key": resetKey,
    }),
}));

vi.mock("./development-meego-login-sheet", () => ({
  DevelopmentMeegoLoginSheet: () => null,
}));

vi.mock("./development-meego-permission-card", () => ({
  DevelopmentMeegoPermissionCard: () => null,
}));

const PLUGIN = {
  id: "byte-development",
  pluginId: "byte-development",
} as never;

beforeAll(() => {
  vi.stubGlobal("React", React);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  hostRuntime.client = null;
  hostRuntime.supported = false;
  runDevelopmentMeegoAction.mockReset();
});

function renderField(value: DevelopmentPrdSourceValue, inputResetKey: string): string {
  return renderToStaticMarkup(
    <DevelopmentPrdField
      active={false}
      serverId="server-1"
      plugin={PLUGIN}
      inputResetKey={inputResetKey}
      value={value}
      onChange={vi.fn()}
    />,
  );
}

describe("DevelopmentPrdField", () => {
  it("seeds the manual editor with the saved PRD", () => {
    const markup = renderField(
      {
        type: "manual",
        prd: "已经保存的 PRD 内容",
        meegoUrl: "",
        meegoProjectKey: "",
        meegoWorkItemId: "",
        meegoTitle: "",
      },
      "flow-1",
    );

    expect(markup).toContain("已经保存的 PRD 内容");
    expect(markup).toContain('data-reset-key="flow-1:manual-prd"');
  });

  it("seeds the Meego URL and PRD editors with saved values", () => {
    const markup = renderField(
      {
        type: "meego",
        prd: "Meego 中已经保存的 PRD",
        meegoUrl: "https://meego.larkoffice.com/demo/story/detail/123",
        meegoProjectKey: "demo",
        meegoWorkItemId: "123",
        meegoTitle: "登录优化",
      },
      "flow-2",
    );

    expect(markup).toContain("https://meego.larkoffice.com/demo/story/detail/123");
    expect(markup).toContain("Meego 中已经保存的 PRD");
    expect(markup).toContain('data-reset-key="flow-2:meego-url:0"');
    expect(markup).toContain('data-reset-key="flow-2:meego-prd:0"');
  });

  it("refreshes the PRD editor after a Meego resolve completes", async () => {
    hostRuntime.client = {
      getPluginAppJob: vi.fn(),
      submitPluginHttpService: vi.fn(),
    };
    hostRuntime.supported = true;
    runDevelopmentMeegoAction.mockResolvedValue({
      action: "resolve",
      prd: "# 自动获取的 PRD\n\n需求正文",
      title: "自动获取的需求",
      url: "https://meego.larkoffice.com/demo/story/detail/123",
      projectKey: "demo",
      workItemId: "123",
    });

    function Harness() {
      const [value, setValue] = React.useState<DevelopmentPrdSourceValue>({
        type: "meego",
        prd: "",
        meegoUrl: "https://meego.larkoffice.com/demo/story/detail/123",
        meegoProjectKey: "demo",
        meegoWorkItemId: "123",
        meegoTitle: "自动获取的需求",
      });
      return (
        <DevelopmentPrdField
          active={false}
          serverId="server-1"
          plugin={PLUGIN}
          inputResetKey="flow-3"
          value={value}
          onChange={setValue}
        />
      );
    }

    render(<Harness />);
    const prdEditor = screen.getByPlaceholderText("选择或输入 Meego 后自动填充");
    expect((prdEditor as HTMLTextAreaElement).value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "获取 PRD" }));

    await waitFor(() => {
      const updatedEditor = screen.getByPlaceholderText("选择或输入 Meego 后自动填充");
      expect((updatedEditor as HTMLTextAreaElement).value).toBe("# 自动获取的 PRD\n\n需求正文");
      expect(updatedEditor.getAttribute("data-reset-key")).toBe("flow-3:meego-prd:1");
    });
  });
});
