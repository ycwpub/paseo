/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- Environment controls bind edits to the current workflow draft. */
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { WorkflowEnvironment } from "@getpaseo/protocol/workflow/environment";
import { Field } from "@/components/ui/form-field";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { WorkflowTextInput } from "./workflow-text-input";

export function WorkflowEnvironmentConfiguration({
  environment,
  onChange,
}: {
  environment: WorkflowEnvironment | undefined;
  onChange: (environment: WorkflowEnvironment | undefined) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [variablesText, setVariablesText] = useState(formatVariables(environment?.variables));
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () => setVariablesText(formatVariables(environment?.variables)),
    [environment?.variables],
  );
  const options = useMemo<SelectFieldOption<string>[]>(
    () => [
      {
        id: "daemon",
        value: "daemon",
        label: t("workflows.environment.daemon"),
        description: t("workflows.environment.daemonHint"),
      },
      {
        id: "login-shell",
        value: "login-shell",
        label: t("workflows.environment.loginShell"),
        description: t("workflows.environment.loginShellHint"),
      },
    ],
    [t],
  );
  const inherit = environment?.inherit ?? "daemon";
  const selected = options.find((option) => option.value === inherit);

  function commitVariables(): void {
    if (!variablesText.trim()) {
      setError(null);
      const next =
        environment?.inherit && environment.inherit !== "daemon"
          ? { inherit: environment.inherit }
          : undefined;
      onChange(next);
      return;
    }
    try {
      const parsed: unknown = JSON.parse(variablesText);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Environment variables must be a JSON object");
      }
      const variables = parsed as Record<string, unknown>;
      if (Object.values(variables).some((value) => typeof value !== "string")) {
        throw new Error("Environment variable values must be strings");
      }
      setError(null);
      onChange({
        inherit,
        variables: variables as Record<string, string>,
      });
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : String(commitError));
    }
  }

  return (
    <View style={styles.card}>
      <View>
        <Text style={styles.title}>{t("workflows.environment.title")}</Text>
        <Text style={styles.description}>{t("workflows.environment.description")}</Text>
      </View>
      <Field label={t("workflows.environment.inherit")}>
        <SelectField
          field={false}
          label=""
          value={inherit}
          selectedDisplay={
            selected ? { label: selected.label, description: selected.description } : null
          }
          options={options}
          onChange={(next) =>
            onChange({
              ...environment,
              inherit: next === "login-shell" ? "login-shell" : "daemon",
            })
          }
          placeholder={t("workflows.environment.daemon")}
          emptyText=""
          title={t("workflows.environment.inherit")}
          size="sm"
        />
      </Field>
      <Field
        label={t("workflows.environment.variables")}
        hint={t("workflows.environment.variablesHint")}
      >
        <WorkflowTextInput
          value={variablesText}
          onChangeText={setVariablesText}
          onBlur={commitVariables}
          placeholder={
            '{\n  "PATH": "/usr/local/bin:/usr/bin",\n  "FIXED_WIKI_URL": "https://example.test/wiki"\n}'
          }
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.jsonInput}
        />
      </Field>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function formatVariables(variables: Record<string, string> | undefined): string {
  return variables ? JSON.stringify(variables, null, 2) : "";
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    backgroundColor: theme.colors.surface0,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.foreground,
  },
  description: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.mutedForeground,
  },
  jsonInput: {
    minHeight: 110,
    fontFamily: "monospace",
  },
  error: {
    marginTop: -8,
    fontSize: 12,
    color: theme.colors.destructive,
  },
}));
