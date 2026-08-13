/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- The JSON editors commit the current local draft on blur. */
import { useEffect, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { WorkflowInputPreset } from "@getpaseo/protocol/workflow/input-contract";
import type {
  WorkflowJsonSchema,
  WorkflowVariableDefinitions,
} from "@getpaseo/protocol/workflow/data-contract";
import { Field } from "@/components/ui/form-field";
import { WorkflowTextInput } from "./workflow-text-input";

const VARIABLES_PLACEHOLDER = `{
  "traceId": { "type": "string", "default": "" },
  "counter": { "type": "int64", "default": "0" }
}`;

const OUTPUT_SCHEMA_PLACEHOLDER = `{
  "type": "object",
  "properties": {
    "answer": { "type": "string" }
  },
  "required": ["answer"]
}`;

const PRESETS_PLACEHOLDER = `[
  {
    "id": "scan-only",
    "name": "仅扫描",
    "payload": {
      "scan_dir_url": "https://example.test/wiki",
      "group_ids": [],
      "mode": "scan_only",
      "max_work_items": 0
    }
  }
]`;

export function WorkflowInputConfiguration({
  variables,
  outputSchema,
  presets,
  onChangeVariables,
  onChangeOutputSchema,
  onChangePresets,
}: {
  variables: WorkflowVariableDefinitions | undefined;
  outputSchema: WorkflowJsonSchema | undefined;
  presets: WorkflowInputPreset[] | undefined;
  onChangeVariables: (variables: WorkflowVariableDefinitions | undefined) => void;
  onChangeOutputSchema: (schema: WorkflowJsonSchema | undefined) => void;
  onChangePresets: (presets: WorkflowInputPreset[] | undefined) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [variablesText, setVariablesText] = useState(formatJson(variables));
  const [outputSchemaText, setOutputSchemaText] = useState(formatJson(outputSchema));
  const [presetsText, setPresetsText] = useState(formatJson(presets));
  const [variablesError, setVariablesError] = useState<string | null>(null);
  const [outputSchemaError, setOutputSchemaError] = useState<string | null>(null);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  useEffect(() => setVariablesText(formatJson(variables)), [variables]);
  useEffect(() => setOutputSchemaText(formatJson(outputSchema)), [outputSchema]);
  useEffect(() => setPresetsText(formatJson(presets)), [presets]);

  function commitVariables(): void {
    const parsed = parseOptionalObject(
      variablesText,
      t("workflows.inputContract.invalidVariables"),
    );
    if (!parsed.ok) {
      setVariablesError(parsed.error ?? t("workflows.inputContract.invalidVariables"));
      return;
    }
    setVariablesError(null);
    onChangeVariables(parsed.value as WorkflowVariableDefinitions | undefined);
  }

  function commitOutputSchema(): void {
    const parsed = parseOptionalObject(
      outputSchemaText,
      t("workflows.inputContract.invalidOutputSchema"),
    );
    if (!parsed.ok) {
      setOutputSchemaError(parsed.error ?? t("workflows.inputContract.invalidOutputSchema"));
      return;
    }
    setOutputSchemaError(null);
    onChangeOutputSchema(parsed.value as WorkflowJsonSchema | undefined);
  }

  function commitPresets(): void {
    const parsed = parseOptionalArray(presetsText, t("workflows.inputContract.invalidPresets"));
    if (!parsed.ok) {
      setPresetsError(parsed.error ?? t("workflows.inputContract.invalidPresets"));
      return;
    }
    setPresetsError(null);
    onChangePresets(parsed.value as WorkflowInputPreset[] | undefined);
  }

  return (
    <View style={styles.card}>
      <View>
        <Text style={styles.title}>{t("workflows.inputContract.title")}</Text>
        <Text style={styles.description}>{t("workflows.inputContract.description")}</Text>
      </View>
      <Field
        label={t("workflows.inputContract.contract")}
        hint={t("workflows.inputContract.contractHint")}
      >
        <WorkflowTextInput
          value={variablesText}
          onChangeText={setVariablesText}
          onBlur={commitVariables}
          placeholder={VARIABLES_PLACEHOLDER}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.jsonInput}
        />
      </Field>
      {variablesError ? <Text style={styles.error}>{variablesError}</Text> : null}
      <Field
        label={t("workflows.inputContract.outputSchema")}
        hint={t("workflows.inputContract.outputSchemaHint")}
      >
        <WorkflowTextInput
          value={outputSchemaText}
          onChangeText={setOutputSchemaText}
          onBlur={commitOutputSchema}
          placeholder={OUTPUT_SCHEMA_PLACEHOLDER}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.jsonInput}
        />
      </Field>
      {outputSchemaError ? <Text style={styles.error}>{outputSchemaError}</Text> : null}
      <Field
        label={t("workflows.inputContract.presets")}
        hint={t("workflows.inputContract.presetsHint")}
      >
        <WorkflowTextInput
          value={presetsText}
          onChangeText={setPresetsText}
          onBlur={commitPresets}
          placeholder={PRESETS_PLACEHOLDER}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.jsonInput}
        />
      </Field>
      {presetsError ? <Text style={styles.error}>{presetsError}</Text> : null}
    </View>
  );
}

interface JsonParseResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

function parseOptionalObject(value: string, shapeError: string): JsonParseResult {
  if (!value.trim()) {
    return { ok: true, value: undefined };
  }
  return parseJsonShape(
    value,
    (parsed) => {
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    },
    shapeError,
  );
}

function parseOptionalArray(value: string, shapeError: string): JsonParseResult {
  if (!value.trim()) {
    return { ok: true, value: undefined };
  }
  return parseJsonShape(value, Array.isArray, shapeError);
}

function parseJsonShape(
  value: string,
  accepts: (parsed: unknown) => boolean,
  shapeError: string,
): JsonParseResult {
  try {
    const parsed: unknown = JSON.parse(value);
    return accepts(parsed) ? { ok: true, value: parsed } : { ok: false, error: shapeError };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function formatJson(value: unknown): string {
  return value === undefined ? "" : JSON.stringify(value, null, 2);
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.spacing[4],
    padding: theme.spacing[4],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  description: {
    marginTop: theme.spacing[1],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.4),
  },
  jsonInput: {
    minHeight: 150,
    fontFamily: "monospace",
  },
  error: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.destructive,
  },
}));
