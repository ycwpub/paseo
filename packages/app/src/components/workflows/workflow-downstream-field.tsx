import { useCallback, useMemo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { Field } from "@/components/ui/form-field";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";

type WorkflowDownstreamSelection =
  | { kind: "sequential" }
  | { kind: "end" }
  | { kind: "step"; stepId: string };

function selectionKey(selection: WorkflowDownstreamSelection): string {
  return selection.kind === "step" ? `step:${selection.stepId}` : selection.kind;
}

function selectionForStep(step: WorkflowStep): WorkflowDownstreamSelection {
  if (step.nextStepId === undefined) {
    return { kind: "sequential" };
  }
  if (step.nextStepId === null) {
    return { kind: "end" };
  }
  return { kind: "step", stepId: step.nextStepId };
}

export function WorkflowDownstreamField({
  step,
  siblingSteps,
  onChange,
}: {
  step: WorkflowStep;
  siblingSteps: WorkflowStep[];
  onChange: (step: WorkflowStep) => void;
}): ReactElement {
  const { t } = useTranslation();
  const value = useMemo(() => selectionForStep(step), [step]);
  const options = useMemo<SelectFieldOption<WorkflowDownstreamSelection>[]>(
    () => [
      {
        id: "sequential",
        value: { kind: "sequential" },
        label: t("workflows.nodes.downstream.sequential"),
        description: t("workflows.nodes.downstream.sequentialDescription"),
      },
      {
        id: "end",
        value: { kind: "end" },
        label: t("workflows.nodes.downstream.end"),
        description: t("workflows.nodes.downstream.endDescription"),
      },
      ...siblingSteps
        .filter((candidate) => candidate.id !== step.id)
        .map((candidate) => ({
          id: `step:${candidate.id}`,
          value: { kind: "step" as const, stepId: candidate.id },
          label: candidate.name || candidate.id,
          description: candidate.id,
        })),
    ],
    [siblingSteps, step.id, t],
  );
  const selectedOption = options.find(
    (option) => selectionKey(option.value) === selectionKey(value),
  );
  const selectedDisplay = useMemo<SelectFieldDisplay | null>(
    () =>
      selectedOption
        ? { label: selectedOption.label, description: selectedOption.description }
        : {
            label: t("workflows.nodes.downstream.missing", {
              id: step.nextStepId,
            }),
            description: String(step.nextStepId),
          },
    [selectedOption, step.nextStepId, t],
  );
  const updateDownstream = useCallback(
    (selection: WorkflowDownstreamSelection) => {
      if (selection.kind === "sequential") {
        onChange({ ...step, nextStepId: undefined });
        return;
      }
      onChange({
        ...step,
        nextStepId: selection.kind === "end" ? null : selection.stepId,
      });
    },
    [onChange, step],
  );

  return (
    <Field
      label={t("workflows.nodes.downstream.label")}
      hint={t("workflows.nodes.downstream.hint")}
    >
      <SelectField
        field={false}
        label=""
        value={value}
        selectedDisplay={selectedDisplay}
        options={options}
        getValueKey={selectionKey}
        onChange={updateDownstream}
        placeholder={t("workflows.nodes.downstream.placeholder")}
        emptyText={t("workflows.nodes.downstream.empty")}
        title={t("workflows.nodes.downstream.label")}
        searchable
        size="sm"
        testID={`workflow-step-${step.id}-downstream`}
      />
    </Field>
  );
}
