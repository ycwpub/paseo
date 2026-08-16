import React, { useMemo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type { Assistant, PaseoInstructionTemplate, Team } from "@getpaseo/protocol/messages";
import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { WorkflowStepEditorFields } from "@/components/workflows/workflow-step-editor";
import { findWorkflowStepEditContext } from "@/workflows/workflow-step-tree";

export function WorkflowStepDetailsSheet({
  steps,
  stepId,
  providerEntries = [],
  providersLoading = false,
  assistants = [],
  assistantsLoading = false,
  teams = [],
  teamsLoading = false,
  promptTemplates = [],
  promptTemplatesLoading = false,
  allowPython = true,
  onChange,
  onClose,
}: {
  steps: WorkflowStep[];
  stepId: string | null;
  providerEntries?: ProviderSnapshotEntry[];
  providersLoading?: boolean;
  assistants?: Assistant[];
  assistantsLoading?: boolean;
  teams?: Team[];
  teamsLoading?: boolean;
  promptTemplates?: PaseoInstructionTemplate[];
  promptTemplatesLoading?: boolean;
  allowPython?: boolean;
  onChange: (step: WorkflowStep) => void;
  onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const context = useMemo(() => findWorkflowStepEditContext(steps, stepId), [stepId, steps]);
  const header = useMemo<SheetHeader>(
    () => ({
      title: context?.step.name || context?.step.id || t("workflows.graph.nodeDetails"),
      subtitle: context
        ? `${t(`workflows.nodes.types.${context.step.type}`)} · ${context.step.id}`
        : t("workflows.graph.nodeDetails"),
    }),
    [context, t],
  );

  return (
    <AdaptiveModalSheet
      visible={Boolean(context)}
      header={header}
      onClose={onClose}
      desktopMaxWidth={1200}
      snapPoints={["95%"]}
      testID="workflow-step-details"
    >
      {context ? (
        <WorkflowStepEditorFields
          step={context.step}
          depth={context.depth}
          rootSteps={steps}
          siblingSteps={context.siblingSteps}
          providerEntries={providerEntries}
          providersLoading={providersLoading}
          assistants={assistants}
          assistantsLoading={assistantsLoading}
          teams={teams}
          teamsLoading={teamsLoading}
          promptTemplates={promptTemplates}
          promptTemplatesLoading={promptTemplatesLoading}
          allowPython={allowPython}
          onChange={onChange}
        />
      ) : null}
    </AdaptiveModalSheet>
  );
}
