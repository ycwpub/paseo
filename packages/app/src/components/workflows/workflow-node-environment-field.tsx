/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- The JSON editor validates and commits the current node environment. */
import { useEffect, useState, type ReactElement } from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Field } from "@/components/ui/form-field";
import { WorkflowExpandableTextInput } from "./workflow-expandable-text-input";

export function WorkflowNodeEnvironmentField({
  value,
  onChange,
}: {
  value: Record<string, string> | undefined;
  onChange: (value: Record<string, string> | undefined) => void;
}): ReactElement {
  const { t } = useTranslation();
  const serialized = value ? JSON.stringify(value, null, 2) : "";
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(serialized), [serialized]);
  return (
    <Field
      label={t("workflows.nodes.common.environment")}
      hint={t("workflows.nodes.common.environmentHint")}
    >
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
            const parsed: unknown = JSON.parse(next);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
              setError(t("workflows.nodes.contract.objectRequired"));
              return;
            }
            const environment = parsed as Record<string, unknown>;
            if (Object.values(environment).some((entry) => typeof entry !== "string")) {
              setError(t("workflows.nodes.common.environmentStringValues"));
              return;
            }
            setError(null);
            onChange(environment as Record<string, string>);
          } catch {
            setError(t("workflows.nodes.contract.invalidJson"));
          }
        }}
        editorTitle={t("workflows.nodes.common.environment")}
        placeholder={'{\n  "PATH": "/usr/local/bin:/usr/bin",\n  "MODE": "review"\n}'}
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
  editor: {
    minHeight: 112,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
  },
}));
