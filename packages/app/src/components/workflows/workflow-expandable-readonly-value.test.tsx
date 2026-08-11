/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Test adapters bridge button events. */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({
    children,
    numberOfLines,
    testID,
  }: {
    children?: React.ReactNode;
    numberOfLines?: number;
    testID?: string;
  }) => (
    <pre data-testid={testID} data-lines={numberOfLines}>
      {children}
    </pre>
  ),
}));

vi.mock("@/components/adaptive-modal-sheet", () => ({
  AdaptiveModalSheet: ({
    visible,
    children,
    testID,
  }: {
    visible: boolean;
    children?: React.ReactNode;
    testID?: string;
  }) => (visible ? <section data-testid={testID}>{children}</section> : null),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    testID,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    testID?: string;
  }) => (
    <button type="button" data-testid={testID} onClick={onPress}>
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
    t: (key: string) => key,
  }),
}));

import { WorkflowExpandableReadonlyValue } from "./workflow-expandable-readonly-value";

describe("WorkflowExpandableReadonlyValue", () => {
  afterEach(cleanup);

  it("shows a short preview and opens the complete value", () => {
    const value = "line 1\nline 2\nline 3\nline 4\nline 5\nline 6";
    render(
      <WorkflowExpandableReadonlyValue label="Input" value={value} testID="workflow-run-input" />,
    );

    expect(screen.getByTestId("workflow-run-input").getAttribute("data-lines")).toBe("4");
    expect(screen.queryByTestId("workflow-run-input-full")).toBeNull();

    fireEvent.click(screen.getByTestId("workflow-run-input-expand"));

    const fullView = screen.getByTestId("workflow-run-input-full");
    expect(fullView.textContent).toContain("line 6");
  });
});
