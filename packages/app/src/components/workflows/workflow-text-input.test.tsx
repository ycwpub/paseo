/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/form-field", () => ({
  FormTextInput: ({
    value,
    controlled,
    testID,
  }: {
    value?: string;
    controlled?: boolean;
    testID?: string;
  }) => (
    <input
      data-testid={testID}
      data-controlled={controlled ? "true" : "false"}
      readOnly
      value={value ?? ""}
    />
  ),
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
});
