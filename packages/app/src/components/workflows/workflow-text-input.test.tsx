/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Test adapters bridge DOM events to React Native callbacks. */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useWindowDimensions: () => ({ height: 900, width: 1200 }),
}));

vi.mock("@/constants/platform", () => ({
  isWeb: true,
}));

vi.mock("@/components/ui/form-field", () => ({
  FormTextInput: ({
    value,
    controlled,
    testID,
    onChangeText,
  }: {
    value?: string;
    controlled?: boolean;
    testID?: string;
    onChangeText?: (value: string) => void;
  }) => (
    <input
      data-testid={testID}
      data-controlled={controlled ? "true" : "false"}
      onChange={(event) => onChangeText?.(event.target.value)}
      value={value ?? ""}
    />
  ),
}));

vi.mock("@/components/adaptive-modal-sheet", () => ({
  AdaptiveModalSheet: ({
    visible,
    children,
    footer,
    testID,
  }: {
    visible: boolean;
    children?: React.ReactNode;
    footer?: React.ReactNode;
    testID?: string;
  }) =>
    visible ? (
      <section data-testid={testID}>
        {children}
        {footer}
      </section>
    ) : null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    accessibilityLabel,
    testID,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
    testID?: string;
  }) => (
    <button type="button" aria-label={accessibilityLabel} data-testid={testID} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children?: React.ReactNode }) => children,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { field?: string }) => {
      if (key === "workflows.nodes.expandedEditor.defaultTitle") return "Input content";
      if (key === "workflows.nodes.expandedEditor.open") return `Expand ${values?.field ?? ""}`;
      if (key === "workflows.nodes.expandedEditor.subtitle") return "Edit in a larger text area";
      if (key === "workflows.nodes.expandedEditor.done") return "Done";
      return key;
    },
  }),
}));

import { WorkflowTextInput } from "./workflow-text-input";

describe("WorkflowTextInput", () => {
  afterEach(cleanup);

  it("keeps asynchronously loaded workflow values controlled", () => {
    const view = render(<WorkflowTextInput value="" testID="workflow-field" />);

    view.rerender(<WorkflowTextInput value="flow1" testID="workflow-field" />);

    const input = screen.getByTestId("workflow-field");
    expect(input).toHaveProperty("value", "flow1");
    expect(input.getAttribute("data-controlled")).toBe("true");
  });

  it("lets every workflow input open and edit in a larger text area", () => {
    const onChangeText = vi.fn();
    render(
      <WorkflowTextInput
        value="Long workflow content"
        onChangeText={onChangeText}
        testID="workflow-field"
      />,
    );

    fireEvent.click(screen.getByTestId("workflow-field-expand"));

    expect(screen.getByTestId("workflow-field-expanded-editor")).toBeTruthy();
    const expandedInput = screen.getByTestId("workflow-field-expanded-input");
    expect(expandedInput).toHaveProperty("value", "Long workflow content");

    fireEvent.change(expandedInput, { target: { value: "Updated in large editor" } });

    expect(onChangeText).toHaveBeenCalledWith("Updated in large editor");
  });
});
