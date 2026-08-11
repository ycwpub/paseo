import React, { type ComponentProps, type ReactElement } from "react";
import { FormTextInput } from "@/components/ui/form-field";

type WorkflowTextInputProps = ComponentProps<typeof FormTextInput>;

/**
 * Workflow drafts can be replaced asynchronously when a saved workflow is
 * selected. Keep these inputs controlled so the newly loaded draft is shown
 * immediately instead of retaining the previous native-owned input value.
 */
export function WorkflowTextInput(props: WorkflowTextInputProps): ReactElement {
  return <FormTextInput {...props} controlled />;
}
