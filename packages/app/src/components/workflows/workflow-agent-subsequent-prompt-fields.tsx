import React, { useCallback, useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  type WorkflowAgentStep,
  type WorkflowAgentSubsequentPromptMode,
} from "@getpaseo/protocol/workflow/types";
import { StyleSheet } from "react-native-unistyles";
import { Field } from "@/components/ui/form-field";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { WorkflowExpandableTextInput } from "@/components/workflows/workflow-expandable-text-input";

export function WorkflowAgentSubsequentPromptFields({
  step,
  onChange,
}: {
  step: WorkflowAgentStep;
  onChange: (step: WorkflowAgentStep) => void;
}) {
  const { t } = useTranslation();
  const mode = step.subsequentPromptMode ?? "reuse_initial";
  const options = useMemo<SelectFieldOption<WorkflowAgentSubsequentPromptMode>[]>(
    () => [
      {
        id: "reuse_initial",
        value: "reuse_initial",
        label: t("workflows.nodes.agent.subsequentPromptModes.reuseInitial"),
        description: t("workflows.nodes.agent.subsequentPromptModes.reuseInitialDescription"),
      },
      {
        id: "custom",
        value: "custom",
        label: t("workflows.nodes.agent.subsequentPromptModes.custom"),
        description: t("workflows.nodes.agent.subsequentPromptModes.customDescription"),
      },
    ],
    [t],
  );
  const selectedDisplay = useMemo<SelectFieldDisplay | null>(() => {
    const selectedOption = options.find((option) => option.value === mode);
    return selectedOption
      ? {
          label: selectedOption.label,
          description: selectedOption.description,
        }
      : null;
  }, [mode, options]);
  const handleModeChange = useCallback(
    (subsequentPromptMode: WorkflowAgentSubsequentPromptMode) => {
      onChange({
        ...step,
        subsequentPromptMode,
        subsequentPrompt:
          subsequentPromptMode === "custom"
            ? (step.subsequentPrompt ?? step.initialPrompt)
            : step.subsequentPrompt,
      });
    },
    [onChange, step],
  );
  const handlePromptChange = useCallback(
    (subsequentPrompt: string) => {
      onChange({ ...step, subsequentPrompt });
    },
    [onChange, step],
  );

  if ((step.lifecycle ?? "single") === "single") {
    return null;
  }

  return (
    <View style={styles.container}>
      <Field
        label={t("workflows.nodes.agent.subsequentPromptMode")}
        hint={t("workflows.nodes.agent.subsequentPromptModeHint")}
      >
        <SelectField
          field={false}
          label=""
          value={mode}
          selectedDisplay={selectedDisplay}
          options={options}
          onChange={handleModeChange}
          placeholder={t("workflows.nodes.agent.selectSubsequentPromptMode")}
          emptyText=""
          title={t("workflows.nodes.agent.subsequentPromptMode")}
          size="sm"
          testID={`workflow-agent-${step.id}-subsequent-prompt-mode`}
        />
      </Field>
      {mode === "custom" ? (
        <Field
          label={t("workflows.nodes.agent.subsequentPrompt")}
          hint={t("workflows.nodes.agent.subsequentPromptHint")}
        >
          <WorkflowExpandableTextInput
            value={step.subsequentPrompt ?? ""}
            onChangeText={handlePromptChange}
            editorTitle={t("workflows.nodes.agent.subsequentPrompt")}
            multiline
            textAlignVertical="top"
            style={styles.promptInput}
            testID={`workflow-agent-${step.id}-subsequent-prompt`}
          />
        </Field>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[4],
  },
  promptInput: {
    minHeight: 128,
  },
}));
