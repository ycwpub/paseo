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
  test("adds one audience rule row and supports all five rule types", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <LarkSubstituteAudienceRuleListEditor
        label="用户/群白名单"
        hint="必须命中"
        rules={[]}
        appId="cli_test"
        users={[]}
        chats={[]}
        resolveUsers={vi.fn()}
        resolveChats={vi.fn()}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "添加规则" }));
    const rules = onChange.mock.calls[0]?.[0];
    expect(rules).toHaveLength(1);

    rerender(
      <LarkSubstituteAudienceRuleListEditor
        label="用户/群白名单"
        hint="必须命中"
        rules={rules}
        appId="cli_test"
        users={[]}
        chats={[]}
        resolveUsers={vi.fn()}
        resolveChats={vi.fn()}
        onChange={onChange}
      />,
    );
    const typeSelect = screen.getByRole("combobox", { name: "类型" });
    expect(screen.getByRole("option", { name: "用户" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "群" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "群 AI 分类" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "全部" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "群名称正则表达式" })).toBeTruthy();

    fireEvent.change(typeSelect, { target: { value: "group_ai_category" } });
    const changedRules = onChange.mock.calls.at(-1)?.[0];
    expect(changedRules[0]).toMatchObject({ type: "group_ai_category", description: "" });
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
});
