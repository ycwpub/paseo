/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Test adapters bridge native callbacks. */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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
  }) => (visible ? <div data-testid={testID}>{children}</div> : null),
}));

vi.mock("@/components/workflows/workflow-step-editor", () => ({
  WorkflowStepEditorFields: ({
    step,
    siblingSteps,
    rootSteps,
    onChange,
  }: {
    step: WorkflowStep;
    siblingSteps: WorkflowStep[];
    rootSteps: WorkflowStep[];
    onChange: (step: WorkflowStep) => void;
  }) => (
    <button
      type="button"
      data-testid="complete-step-editor"
      data-step-id={step.id}
      data-sibling-ids={siblingSteps.map((candidate) => candidate.id).join(",")}
      data-root-count={rootSteps.length}
      onClick={() => onChange({ ...step, name: "Updated node" })}
    >
      Complete editor
    </button>
  ),
}));

import { WorkflowStepDetailsSheet } from "./workflow-step-details-sheet";

describe("WorkflowStepDetailsSheet", () => {
  afterEach(cleanup);

  it("opens the complete editor for a graph node and forwards edits", () => {
    const steps: WorkflowStep[] = [
      {
        id: "loop",
        type: "for",
        mode: "array",
        items: "{{data.items}}",
        steps: [
          { id: "first", type: "bash", initialCommand: "echo first" },
          { id: "selected", type: "bash", initialCommand: "echo selected" },
        ],
      },
    ];
    const onChange = vi.fn();

    render(
      <WorkflowStepDetailsSheet
        steps={steps}
        stepId="selected"
        onChange={onChange}
        onClose={vi.fn()}
      />,
    );

    const editor = screen.getByTestId("complete-step-editor");
    expect(editor.getAttribute("data-step-id")).toBe("selected");
    expect(editor.getAttribute("data-sibling-ids")).toBe("first,selected");
    expect(editor.getAttribute("data-root-count")).toBe("1");

    fireEvent.click(editor);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: "selected", name: "Updated node" }),
    );
  });
});
