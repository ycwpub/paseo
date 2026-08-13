/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- JSON field callbacks bind each editor to one contract property. */
import { useEffect, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type {
  WorkflowInputMapping,
  WorkflowJsonSchema,
} from "@getpaseo/protocol/workflow/data-contract";
import { Field } from "@/components/ui/form-field";
import { WorkflowExpandableTextInput } from "@/components/workflows/workflow-expandable-text-input";

interface WorkflowNodeContractFieldsProps {
  inputs: WorkflowInputMapping | undefined;
  inputSchema: WorkflowJsonSchema | undefined;
  outputSchema: WorkflowJsonSchema | undefined;
  onChange: (value: {
    inputs?: WorkflowInputMapping;
    inputSchema?: WorkflowJsonSchema;
    outputSchema?: WorkflowJsonSchema;
  }) => void;
}

export function WorkflowNodeContractFields({
  inputs,
  inputSchema,
  outputSchema,
  onChange,
}: WorkflowNodeContractFieldsProps): ReactElement {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <View>
        <Text style={styles.title}>{t("workflows.nodes.contract.title")}</Text>
        <Text style={styles.description}>{t("workflows.nodes.contract.description")}</Text>
      </View>
      <WorkflowJsonObjectField
        label={t("workflows.nodes.contract.inputs")}
        hint={t("workflows.nodes.contract.inputsHint")}
        value={inputs}
        placeholder={'{\n  "project": "{{workflow.inputs.project}}"\n}'}
        onChange={(next) => onChange({ inputs: next, inputSchema, outputSchema })}
      />
      <View style={styles.columns}>
        <View style={styles.column}>
          <WorkflowJsonObjectField
            label={t("workflows.nodes.contract.inputSchema")}
            hint={t("workflows.nodes.contract.schemaHint")}
            value={inputSchema}
            placeholder={'{\n  "type": "object"\n}'}
            onChange={(next) => onChange({ inputs, inputSchema: next, outputSchema })}
          />
        </View>
        <View style={styles.column}>
          <WorkflowJsonObjectField
            label={t("workflows.nodes.contract.outputSchema")}
            hint={t("workflows.nodes.contract.schemaHint")}
            value={outputSchema}
            placeholder={'{\n  "type": "object"\n}'}
            onChange={(next) => onChange({ inputs, inputSchema, outputSchema: next })}
          />
        </View>
      </View>
    </View>
  );
}

function WorkflowJsonObjectField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint: string;
  value: Record<string, unknown> | undefined;
  placeholder: string;
  onChange: (value: Record<string, unknown> | undefined) => void;
}): ReactElement {
  const { t } = useTranslation();
  const serialized = value ? JSON.stringify(value, null, 2) : "";
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(serialized), [serialized]);
  return (
    <Field label={label} hint={hint}>
      <WorkflowExpandableTextInput
        value={draft}
        onChangeText={(next) => {
          setDraft(next);
          if (!next.trim()) {
            setError(null);
            onChange(undefined);
            return;
          }
          try {
            const parsed = JSON.parse(next) as unknown;
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
              setError(t("workflows.nodes.contract.objectRequired"));
              return;
            }
            setError(null);
            onChange(parsed as Record<string, unknown>);
          } catch {
            setError(t("workflows.nodes.contract.invalidJson"));
          }
        }}
        editorTitle={label}
        placeholder={placeholder}
        monospace
        multiline
        textAlignVertical="top"
        style={styles.editor}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Field>
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
  columns: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  column: {
    flex: 1,
    minWidth: 280,
  },
  editor: {
    minHeight: 112,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
  },
}));
