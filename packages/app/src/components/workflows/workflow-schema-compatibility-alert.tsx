import React, { useMemo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { WorkflowScript } from "@getpaseo/protocol/workflow/types";
import { Alert } from "@/components/ui/alert";
import {
  findWorkflowSchemaCompatibilityWarnings,
  type WorkflowSchemaCompatibilityWarning,
} from "@/workflows/schema-compatibility";

export function WorkflowSchemaCompatibilityAlert({
  script,
}: {
  script: WorkflowScript;
}): ReactElement | null {
  const { t } = useTranslation();
  const warnings = useMemo(() => findWorkflowSchemaCompatibilityWarnings(script), [script]);
  if (warnings.length === 0) {
    return null;
  }
  const description = warnings.map((warning) => formatWarning(warning, t)).join("\n");
  return (
    <Alert
      variant="warning"
      title={t("workflows.nodes.schemaCompatibility.title")}
      description={description}
      testID="workflow-schema-compatibility-warning"
    />
  );
}

function formatWarning(
  warning: WorkflowSchemaCompatibilityWarning,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const target = warning.targetStepId ?? t("workflows.nodes.schemaCompatibility.workflowOutput");
  const common = {
    source: warning.sourceStepId,
    target,
    path: warning.issue.path,
  };
  if (warning.issue.kind === "required_not_guaranteed") {
    return t("workflows.nodes.schemaCompatibility.requiredNotGuaranteed", common);
  }
  if (warning.issue.kind === "field_not_accepted") {
    return t("workflows.nodes.schemaCompatibility.fieldNotAccepted", common);
  }
  return t("workflows.nodes.schemaCompatibility.typeMismatch", {
    ...common,
    outputTypes: warning.issue.outputTypes,
    inputTypes: warning.issue.inputTypes,
  });
}
