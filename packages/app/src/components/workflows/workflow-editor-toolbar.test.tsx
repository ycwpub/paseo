/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Test adapters bridge native callbacks. */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
    <div data-testid={testID}>{children}</div>
  ),
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (
      factory: (theme: {
        spacing: Record<number, number>;
        borderWidth: Record<number, number>;
        colors: Record<string, string>;
        borderRadius: Record<string, number>;
        fontSize: Record<string, number>;
        fontWeight: Record<string, string>;
        fontFamily: Record<string, string>;
      }) => unknown,
    ) =>
      factory({
        spacing: { 1: 4, 2: 8, 3: 12, 4: 16 },
        borderWidth: { 1: 1 },
        colors: { border: "#ddd", surface0: "#fff", foreground: "#111", foregroundMuted: "#666" },
        borderRadius: { lg: 8 },
        fontSize: { xs: 12, lg: 18 },
        fontWeight: { normal: "400", medium: "500" },
        fontFamily: { mono: "monospace", ui: "sans-serif" },
      }),
  },
}));

vi.mock("@/components/workflows/workflow-wrapping-title-input", () => ({
  WorkflowWrappingTitleInput: ({
    value,
    onChangeText,
    expandable,
  }: {
    value: string;
    onChangeText: (value: string) => void;
    expandable?: boolean;
  }) => (
    <input
      data-testid="workflow-name"
      data-expandable={expandable ? "true" : "false"}
      value={value}
      onChange={(event) => onChangeText(event.target.value)}
    />
  ),
}));

vi.mock("@/components/ui/status-badge", () => ({
  StatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    testID,
    disabled,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    testID?: string;
    disabled?: boolean;
  }) => (
    <button type="button" data-testid={testID} disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
}));

import { WorkflowEditorToolbar } from "./workflow-editor-toolbar";

describe("WorkflowEditorToolbar", () => {
  afterEach(cleanup);

  it("keeps save controls visible and exposes unsaved state", () => {
    const onChangeName = vi.fn();
    const onDelete = vi.fn();
    const onSave = vi.fn();
    render(
      <WorkflowEditorToolbar
        name="Long workflow"
        path="/tmp/long-workflow.json"
        dirty
        saving={false}
        nameLabel="Name"
        untitledPlaceholder="Untitled"
        generatedPathLabel="Generated after save"
        unsavedLabel="Unsaved"
        deleteLabel="Delete"
        saveLabel="Save"
        onChangeName={onChangeName}
        onDelete={onDelete}
        onSave={onSave}
      />,
    );

    expect(screen.getByText("Unsaved")).toBeTruthy();
    expect(screen.getByText("/tmp/long-workflow.json")).toBeTruthy();
    expect(screen.getByTestId("workflow-name").getAttribute("data-expandable")).toBe("false");
    expect(screen.getByTestId("workflow-title-row").textContent).not.toContain("Unsaved");
    expect(screen.getByTestId("workflow-save-group").textContent).toContain("Unsaved");

    fireEvent.change(screen.getByTestId("workflow-name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByText("Delete"));
    fireEvent.click(screen.getByTestId("workflow-save"));

    expect(onChangeName).toHaveBeenCalledWith("Renamed");
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
  });
});
