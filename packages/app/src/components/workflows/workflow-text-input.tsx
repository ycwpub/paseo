import React, { type ReactElement } from "react";
import {
  WorkflowTextInputExpansion,
  type WorkflowTextInputExpansionProps,
} from "@/components/workflows/workflow-text-input-expansion";

export type WorkflowTextInputProps = WorkflowTextInputExpansionProps;

/**
 * Workflow drafts can be replaced asynchronously when a saved workflow is
 * selected. Keep these inputs controlled so the newly loaded draft is shown
 * immediately instead of retaining the previous native-owned input value.
 */
export function WorkflowTextInput(props: WorkflowTextInputProps): ReactElement {
  return <WorkflowTextInputExpansion {...props} />;
}
