/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  LarkSubstituteAudienceRuleListEditor,
  LarkSubstituteQuestionRuleListEditor,
} from "./lark-substitute-rule-list-editor";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 2: 8, 3: 12 },
    borderRadius: { lg: 8 },
    colors: { foreground: "#fff", surface1: "#111", border: "#444" },
    fontSize: { sm: 12 },
    fontWeight: { medium: "500" },
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
}));

vi.mock("@/styles/settings", () => ({
  settingsStyles: { rowError: {}, rowHint: {}, rowTitle: {} },
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
    placeholder,
    onChangeText,
  }: {
    value?: string;
    placeholder?: string;
    onChangeText: (value: string) => void;
  }) => {
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        onChangeText(event.currentTarget.value);
      },
      [onChangeText],
    );
    return <input value={value ?? ""} placeholder={placeholder} onChange={handleChange} />;
  },
}));

vi.mock("@/components/ui/select-field", () => ({
  SelectField: ({
    label,
    value,
    options,
    onChange,
  }: {
    label: string;
    value?: string | null;
    options: Array<{ value: string; label: string }>;
    onChange: (value: string) => void;
  }) => {
    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLSelectElement>) => {
        onChange(event.currentTarget.value);
      },
      [onChange],
    );
    return (
      <label>
        <span>{label}</span>
        <select aria-label={label} value={value ?? ""} onChange={handleChange}>
          <option value="" />
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  },
}));

vi.mock("./lark-directory-fields", () => ({
  LarkChatDirectoryField: () => <div>群搜索</div>,
}));

afterEach(cleanup);

describe("Lark substitute rule list editors", () => {
  test("adds one audience list with conversation, user, and bot types", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <LarkSubstituteAudienceRuleListEditor
        label="用户/群白名单"
        hint="必须命中"
        ruleGroups={[]}
        appId="cli_test"
        users={[]}
        chats={[]}
        resolveUsers={vi.fn()}
        resolveChats={vi.fn()}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "添加名单" }));
    const ruleGroups = onChange.mock.calls[0]?.[0];
    expect(ruleGroups).toHaveLength(1);

    rerender(
      <LarkSubstituteAudienceRuleListEditor
        label="用户/群白名单"
        hint="必须命中"
        ruleGroups={ruleGroups}
        appId="cli_test"
        users={[]}
        chats={[]}
        resolveUsers={vi.fn()}
        resolveChats={vi.fn()}
        onChange={onChange}
      />,
    );
    const conversationType = screen.getByRole("combobox", { name: "会话范围类型" });
    expect(screen.getByRole("option", { name: "群" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "群 AI 分类" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "群名称正则表达式" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "私聊" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "机器人" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "全部群" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "全部（群+用户+机器人）" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "全部用户" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "用户名称" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "用户邮箱" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "机器人 app_id" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "全部机器人" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "全部（机器人+用户）" })).toBeTruthy();

    fireEvent.change(conversationType, { target: { value: "group_ai_category" } });
    const changedGroups = onChange.mock.calls.at(-1)?.[0];
    expect(changedGroups[0].conversationRules[0]).toMatchObject({
      type: "group_ai_category",
      description: "",
    });
  });

  test("adds independent question rows instead of a shared text area", () => {
    const onChange = vi.fn();
    render(
      <LarkSubstituteQuestionRuleListEditor
        label="问题白名单"
        hint="由 Agent 语义匹配"
        rules={[]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "添加规则" }));
    expect(onChange.mock.calls[0]?.[0]).toHaveLength(1);
  });

  test("selects a user whitelist entry from the current bot contact directory", () => {
    const onChange = vi.fn();
    render(
      <LarkSubstituteAudienceRuleListEditor
        label="用户/群白名单"
        hint="必须命中"
        ruleGroups={[
          {
            id: "list-1",
            conversationRules: [{ id: "private", type: "private" }],
            userRules: [
              {
                id: "user-1",
                type: "user_name",
                name: "",
                openId: null,
                email: null,
              },
            ],
          },
        ]}
        appId="cli_test"
        users={[
          {
            appId: "cli_test",
            openId: "ou_alice",
            displayName: "张三",
            email: "alice@example.com",
            updatedAt: "2026-09-07T00:00:00.000Z",
          },
          {
            appId: "cli_other",
            openId: "ou_other",
            displayName: "其他机器人联系人",
            email: "other@example.com",
            updatedAt: "2026-09-07T00:00:00.000Z",
          },
        ]}
        chats={[]}
        resolveUsers={vi.fn()}
        resolveChats={vi.fn()}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole("option", { name: "张三（alice@example.com，ou_alice）" }),
    ).toBeTruthy();
    expect(screen.queryByRole("option", { name: /其他机器人联系人/u })).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "从通讯录选择用户" }), {
      target: { value: "ou_alice" },
    });

    expect(onChange).toHaveBeenCalledWith([
      {
        id: "list-1",
        conversationRules: [{ id: "private", type: "private" }],
        userRules: [
          {
            id: "user-1",
            type: "user_name",
            openId: "ou_alice",
            name: "张三",
            email: "alice@example.com",
          },
        ],
      },
    ]);
  });
});
