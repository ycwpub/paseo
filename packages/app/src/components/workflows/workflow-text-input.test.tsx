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
      initialValue?: string;
      resetKey?: string | number;
      controlled?: boolean;
      testID?: string;
      onChangeText?: (value: string) => void;
      style?: unknown;
      textInputStyle?: unknown;
    }
  >(function MockFormTextInput(
    { value, initialValue, resetKey, controlled, testID, onChangeText, style, textInputStyle },
    ref,
  ) {
    return (
      <textarea
        key={resetKey}
        ref={ref}
        data-testid={testID}
        data-controlled={controlled ? "true" : "false"}
        data-reset-key={resetKey}
        data-style={JSON.stringify(style)}
        data-text-input-style={JSON.stringify(textInputStyle)}
        defaultValue={controlled ? undefined : (initialValue ?? "")}
        onChange={(event) => onChangeText?.(event.target.value)}
        value={controlled ? (value ?? "") : undefined}
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
    footerContainerStyle,
    onClose,
    testID,
  }: {
    visible: boolean;
    children?: React.ReactNode;
    footer?: React.ReactNode;
    footerContainerStyle?: unknown;
    onClose?: () => void;
    testID?: string;
  }) =>
    visible ? (
      <section data-testid={testID}>
        {children}
        <div
          data-testid={testID ? `${testID}-footer` : undefined}
          data-style={JSON.stringify(footerContainerStyle)}
        >
          {footer}
        </div>
        <button
          type="button"
          data-testid={testID ? `${testID}-close` : undefined}
          onClick={onClose}
        >
          Close
        </button>
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

  it("applies large-editor changes only after Done is selected", () => {
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

    expect(onChangeText).not.toHaveBeenCalled();
    expect(expandedInput).toHaveProperty("value", "Updated in large editor");
    expect(
      screen.getByTestId("workflow-field-expanded-editor-footer").getAttribute("data-style"),
    ).toContain('"justifyContent":"flex-end"');

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onChangeText).toHaveBeenCalledTimes(1);
    expect(onChangeText).toHaveBeenCalledWith("Updated in large editor");
    expect(screen.queryByTestId("workflow-field-expanded-editor")).toBeNull();
  });

  it("discards the large-editor draft when the sheet is closed", () => {
    const onChangeText = vi.fn();
    render(
      <WorkflowTextInput
        value="Original content"
        onChangeText={onChangeText}
        testID="workflow-field"
      />,
    );
    fireEvent.click(screen.getByTestId("workflow-field-expand"));
    fireEvent.change(screen.getByTestId("workflow-field-expanded-input"), {
      target: { value: "Discard this draft" },
    });

    fireEvent.click(screen.getByTestId("workflow-field-expanded-editor-close"));

    expect(onChangeText).not.toHaveBeenCalled();
    expect(screen.getByTestId("workflow-field")).toHaveProperty("value", "Original content");

    fireEvent.click(screen.getByTestId("workflow-field-expand"));
    expect(screen.getByTestId("workflow-field-expanded-input")).toHaveProperty(
      "value",
      "Original content",
    );
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

  it("preserves Chinese IME composition in the normal editor until a candidate is committed", () => {
    const onChangeText = vi.fn();
    const view = render(
      <WorkflowTextInput
        value="# "
        onChangeText={onChangeText}
        testID="workflow-system-prompt"
        multiline
      />,
    );
    const input = screen.getByTestId("workflow-system-prompt") as HTMLTextAreaElement;

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "# shu" } });

    expect(onChangeText).not.toHaveBeenCalled();
    expect(input).toHaveProperty("value", "# shu");

    view.rerender(
      <WorkflowTextInput
        value="# "
        onChangeText={onChangeText}
        testID="workflow-system-prompt"
        multiline
      />,
    );
    expect(input).toHaveProperty("value", "# shu");

    input.value = "# 输";
    fireEvent.compositionEnd(input);
    fireEvent.change(input, { target: { value: "# 输" } });

    expect(onChangeText).toHaveBeenCalledTimes(1);
    expect(onChangeText).toHaveBeenLastCalledWith("# 输");
    expect(input).toHaveProperty("value", "# 输");
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

    expect(onChangeText).not.toHaveBeenCalled();
    expect(expandedInput).toHaveProperty("value", "[\n    ]");
    expect(expandedInput.getAttribute("data-text-input-style")).toContain('"tabSize":4');
    expect(allowedBrowserDefault).toBe(false);
    expect(document.activeElement).toBe(expandedInput);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChangeText).toHaveBeenLastCalledWith("[\n    ]");
  });

  it("uses Shift+Tab to outdent inside the expanded editor instead of moving focus", () => {
    const onChangeText = vi.fn();
    render(
      <WorkflowTextInput
        value={'[\n    "item"\n]'}
        onChangeText={onChangeText}
        testID="workflow-field"
      />,
    );
    fireEvent.click(screen.getByTestId("workflow-field-expand"));
    const expandedInput = screen.getByTestId(
      "workflow-field-expanded-input",
    ) as HTMLTextAreaElement;
    expandedInput.focus();
    expandedInput.setSelectionRange(2, 12);

    const allowedBrowserDefault = fireEvent.keyDown(expandedInput, {
      key: "Tab",
      shiftKey: true,
    });

    expect(onChangeText).not.toHaveBeenCalled();
    expect(expandedInput).toHaveProperty("value", '[\n"item"\n]');
    expect(allowedBrowserDefault).toBe(false);
    expect(document.activeElement).toBe(expandedInput);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChangeText).toHaveBeenLastCalledWith('[\n"item"\n]');
  });

  it("preserves Chinese IME composition until the candidate is committed", () => {
    const onChangeText = vi.fn();
    render(<WorkflowTextInput value="" onChangeText={onChangeText} testID="workflow-field" />);
    fireEvent.click(screen.getByTestId("workflow-field-expand"));
    const expandedInput = screen.getByTestId(
      "workflow-field-expanded-input",
    ) as HTMLTextAreaElement;
    expect(expandedInput.getAttribute("data-controlled")).toBe("false");

    fireEvent.compositionStart(expandedInput);
    fireEvent.change(expandedInput, { target: { value: "women" } });

    expect(onChangeText).not.toHaveBeenCalled();
    expect(expandedInput).toHaveProperty("value", "women");

    expandedInput.value = "我们";
    fireEvent.compositionEnd(expandedInput);

    expect(onChangeText).not.toHaveBeenCalled();
    expect(expandedInput).toHaveProperty("value", "我们");

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onChangeText).toHaveBeenCalledTimes(1);
    expect(onChangeText).toHaveBeenLastCalledWith("我们");
  });

  it("does not apply Tab indentation while an IME composition is active", () => {
    const onChangeText = vi.fn();
    render(
      <WorkflowTextInput value={"[\n]"} onChangeText={onChangeText} testID="workflow-field" />,
    );
    fireEvent.click(screen.getByTestId("workflow-field-expand"));
    const expandedInput = screen.getByTestId(
      "workflow-field-expanded-input",
    ) as HTMLTextAreaElement;
    expandedInput.setSelectionRange(2, 2);
    fireEvent.compositionStart(expandedInput);

    const allowedBrowserDefault = fireEvent.keyDown(expandedInput, {
      key: "Tab",
      isComposing: true,
      keyCode: 229,
    });

    expect(allowedBrowserDefault).toBe(true);
    expect(onChangeText).not.toHaveBeenCalled();
    expect(expandedInput).toHaveProperty("value", "[\n]");
  });
});
