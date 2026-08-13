import { type ReactElement } from "react";
import {
  WorkflowTextInput,
  type WorkflowTextInputProps,
} from "@/components/workflows/workflow-text-input";

type WorkflowExpandableTextInputProps = Omit<WorkflowTextInputProps, "value" | "onChangeText"> & {
  value: string;
  onChangeText: (value: string) => void;
  editorTitle: string;
  monospace?: boolean;
};

export function WorkflowExpandableTextInput({
  value,
  onChangeText,
  editorTitle,
  monospace = false,
  ...inputProps
}: WorkflowExpandableTextInputProps): ReactElement {
  return (
    <WorkflowTextInput
      {...inputProps}
      value={value}
      onChangeText={onChangeText}
      editorTitle={editorTitle}
      monospace={monospace}
    />
  );
}
