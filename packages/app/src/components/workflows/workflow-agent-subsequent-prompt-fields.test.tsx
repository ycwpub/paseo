/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Test adapters expose native callbacks as HTML controls. */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  WorkflowAgentStep,
  WorkflowAgentSubsequentPromptMode,
} from "@getpaseo/protocol/workflow/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/ui/form-field", () => ({
  Field: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/select-field", () => ({
  SelectField: ({
    testID,
    onChange,
  }: {
    testID?: string;
    onChange: (value: WorkflowAgentSubsequentPromptMode) => void;
  }) => (
    <button type="button" data-testid={testID} onClick={() => onChange("custom")}>
      Select custom
    </button>
  ),
}));

vi.mock("@/components/workflows/workflow-expandable-text-input", () => ({
  WorkflowExpandableTextInput: ({
    value,
    onChangeText,
    testID,
  }: {
    value: string;
    onChangeText: (value: string) => void;
    testID?: string;
  }) => (
    <textarea
      data-testid={testID}
      value={value}
      onChange={(event) => onChangeText(event.currentTarget.value)}
    />
  ),
}));

import { WorkflowAgentSubsequentPromptFields } from "./workflow-agent-subsequent-prompt-fields";

function createStep(overrides: Partial<WorkflowAgentStep> = {}): WorkflowAgentStep {
  return {
    id: "review",
    type: "agent",
    lifecycle: "workflow",
    initialPrompt: "Review {{data.item}}",
    config: { provider: "codex" },
    ...overrides,
  };
}

describe("WorkflowAgentSubsequentPromptFields", () => {
  afterEach(cleanup);

  it("is hidden for single-execution Agent nodes", () => {
    render(
      <WorkflowAgentSubsequentPromptFields
        step={createStep({ lifecycle: "single" })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("workflow-agent-review-subsequent-prompt-mode")).toBeNull();
  });

  it("initializes a custom prompt from the initial prompt", () => {
    const onChange = vi.fn();
    render(<WorkflowAgentSubsequentPromptFields step={createStep()} onChange={onChange} />);

    fireEvent.click(screen.getByTestId("workflow-agent-review-subsequent-prompt-mode"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        subsequentPromptMode: "custom",
        subsequentPrompt: "Review {{data.item}}",
      }),
    );
  });

  it("edits the custom prompt independently", () => {
    const onChange = vi.fn();
    render(
      <WorkflowAgentSubsequentPromptFields
        step={createStep({
          subsequentPromptMode: "custom",
          subsequentPrompt: "Continue {{data.item}}",
        })}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("workflow-agent-review-subsequent-prompt"), {
      target: { value: "Next {{data.item}}" },
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ subsequentPrompt: "Next {{data.item}}" }),
    );
  });
});
