/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Test adapters bridge DOM events to React Native callbacks. */
import React, { forwardRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children, style }: { children?: React.ReactNode; style?: unknown }) => (
    <div data-style={JSON.stringify(style)}>{children}</div>
  ),
  useWindowDimensions: () => ({ height: 900, width: 1200 }),
}));

vi.mock("@/constants/platform", () => ({
  isWeb: true,
}));

vi.mock("@/components/ui/form-field", () => ({
  FormTextInput: forwardRef<
    HTMLTextAreaElement,
    {
      value?: string;
      controlled?: boolean;
      testID?: string;
      onChangeText?: (value: string) => void;
      style?: unknown;
      textInputStyle?: unknown;
    }
  >(function MockFormTextInput(
    { value, controlled, testID, onChangeText, style, textInputStyle },
    ref,
  ) {
    return (
      <textarea
        ref={ref}
        data-testid={testID}
        data-controlled={controlled ? "true" : "false"}
        data-style={JSON.stringify(style)}
        data-text-input-style={JSON.stringify(textInputStyle)}
        onChange={(event) => onChangeText?.(event.target.value)}
        value={value ?? ""}
      />
    );
  }),
}));

vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback): number =>
  window.setTimeout(callback, 0),
);

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
    style,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
    testID?: string;
    style?: unknown;
  }) => (
    <button
      type="button"
      aria-label={accessibilityLabel}
      data-style={JSON.stringify(style)}
      data-testid={testID}
      onClick={onPress}
    >
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

    const expandButton = screen.getByTestId("workflow-field-expand");
    expect(
      screen.getByTestId("workflow-field").parentElement?.getAttribute("data-style"),
    ).toContain('"flex":1');
    expect(expandButton.getAttribute("data-style")).toContain('"right":12');
    expect(expandButton.getAttribute("data-style")).toContain('"backgroundColor":"#f4f4f5"');
    expect(screen.getByTestId("workflow-field").getAttribute("data-text-input-style")).toContain(
      '"paddingRight":64',
    );
    fireEvent.click(expandButton);

    expect(screen.getByTestId("workflow-field-expanded-editor")).toBeTruthy();
    const expandedInput = screen.getByTestId("workflow-field-expanded-input");
    expect(expandedInput).toHaveProperty("value", "Long workflow content");
    expect(expandedInput.getAttribute("data-style")).toContain('"height":504');
    expect(expandedInput.getAttribute("data-style")).toContain('"minHeight":504');

    fireEvent.change(expandedInput, { target: { value: "Updated in large editor" } });

    expect(onChangeText).toHaveBeenCalledWith("Updated in large editor");
    expect(expandedInput).toHaveProperty("value", "Updated in large editor");
  });

  it("keeps short scalar fields compact when expansion is disabled", () => {
    render(
      <WorkflowTextInput
        value="86400"
        testID="workflow-timeout"
        keyboardType="numeric"
        expandable={false}
      />,
    );

    expect(screen.getByTestId("workflow-timeout")).toHaveProperty("value", "86400");
    expect(screen.queryByTestId("workflow-timeout-expand")).toBeNull();
  });

  it("uses Tab to indent inside the expanded editor instead of moving focus", () => {
    const onChangeText = vi.fn();
    render(
      <WorkflowTextInput value={"[\n]"} onChangeText={onChangeText} testID="workflow-field" />,
    );
    fireEvent.click(screen.getByTestId("workflow-field-expand"));
    const expandedInput = screen.getByTestId(
      "workflow-field-expanded-input",
    ) as HTMLTextAreaElement;
    expandedInput.focus();
    expandedInput.setSelectionRange(2, 2);

    const allowedBrowserDefault = fireEvent.keyDown(expandedInput, { key: "Tab" });

    expect(onChangeText).toHaveBeenLastCalledWith("[\n  ]");
    expect(allowedBrowserDefault).toBe(false);
    expect(document.activeElement).toBe(expandedInput);
  });
});
