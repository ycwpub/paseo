import { useCallback, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { WorkflowLoopVariableDefinitions } from "@getpaseo/protocol/workflow/data-contract";
import { WorkflowJsonObjectField } from "@/components/workflows/workflow-node-contract-fields";

interface WorkflowLoopVariableFieldsProps {
  value: WorkflowLoopVariableDefinitions | undefined;
  modificationAllowed?: boolean;
  onChange: (value: WorkflowLoopVariableDefinitions | undefined) => void;
}

export function WorkflowLoopVariableFields({
  value,
  modificationAllowed = true,
  onChange,
}: WorkflowLoopVariableFieldsProps): ReactElement {
  const { t } = useTranslation();
  const changeVariables = useCallback(
    (next: Record<string, unknown> | undefined) =>
      onChange(next as WorkflowLoopVariableDefinitions | undefined),
    [onChange],
  );
  return (
    <View style={styles.section}>
      <View>
        <Text style={styles.title}>{t("workflows.nodes.for.loopVariables")}</Text>
        <Text style={styles.description}>
          {t(
            modificationAllowed
              ? "workflows.nodes.for.loopVariablesHint"
              : "workflows.nodes.for.parallelLoopVariablesHint",
          )}
        </Text>
      </View>
      <WorkflowJsonObjectField
        label={t("workflows.nodes.for.loopVariableDefinitions")}
        hint={t("workflows.nodes.for.loopVariableDefinitionsHint")}
        value={value}
        placeholder={'{\n  "i": { "type": "int64", "default": "0" }\n}'}
        onChange={changeVariables}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
