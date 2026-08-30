/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- Test adapters bridge native callbacks to HTML controls. */
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpServiceHandlerFields } from "./http-service-handler-fields";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Pressable: ({
    accessibilityLabel,
    children,
    onPress,
  }: {
    accessibilityLabel: string;
    children?: ReactNode;
    onPress: () => void;
  }) => (
    <button type="button" aria-label={accessibilityLabel} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => ({}),
  },
}));

vi.mock("@/components/adaptive-modal-sheet", () => ({
  AdaptiveModalSheet: ({
    visible,
    children,
    testID,
  }: {
    visible: boolean;
    children?: ReactNode;
    testID?: string;
  }) => (visible ? <div data-testid={testID}>{children}</div> : null),
}));

vi.mock("@/components/ui/select-field", () => ({
  SelectField: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock("@/components/workflows/workflow-step-editor", () => ({
  WorkflowStepEditorFields: () => <div>节点编辑界面</div>,
}));

vi.mock("./http-service-workflow-fields", () => ({
  HttpServiceWorkflowFields: () => null,
}));

describe("HttpServiceHandlerFields", () => {
  afterEach(cleanup);

  it("opens the node editor by clicking the node summary card without a separate edit button", () => {
    render(
      <HttpServiceHandlerFields
        handler={{
          mode: "custom_node",
          step: {
            id: "python-code",
            name: "Python code",
            type: "python",
            code: "print('ok')",
          },
        }}
        workflows={[]}
        workflowsLoading={false}
        workflowsError={null}
        inspectWorkflowTargets={vi.fn(async () => [])}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("编辑处理节点")).toBeNull();
    expect(screen.queryByText("节点编辑界面")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "编辑处理节点 Python code" }));

    expect(screen.getByTestId("http-handler-python-code-details")).toBeTruthy();
    expect(screen.getByText("节点编辑界面")).toBeTruthy();
  });
});
