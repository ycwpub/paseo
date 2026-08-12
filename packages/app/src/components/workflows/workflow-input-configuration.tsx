/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- The JSON editors commit the current local draft on blur. */
import { useEffect, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type {
  WorkflowInputContract,
  WorkflowInputPreset,
} from "@getpaseo/protocol/workflow/input-contract";
import { Field } from "@/components/ui/form-field";
import { WorkflowTextInput } from "./workflow-text-input";

const CONTRACT_PLACEHOLDER = `{
  "properties": {
    "scan_dir_url": { "type": "string" },
    "group_ids": { "type": "array", "default": [] },
    "mode": {
      "type": "string",
      "enum": ["scan_only", "prepare_only", "full"],
      "default": "scan_only"
    },
    "max_work_items": { "type": "integer", "default": 0 }
  },
  "required": ["scan_dir_url", "group_ids"],
  "additionalProperties": true
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
  contract,
  presets,
  onChangeContract,
  onChangePresets,
}: {
  contract: WorkflowInputContract | undefined;
  presets: WorkflowInputPreset[] | undefined;
  onChangeContract: (contract: WorkflowInputContract | undefined) => void;
  onChangePresets: (presets: WorkflowInputPreset[] | undefined) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [contractText, setContractText] = useState(formatJson(contract));
  const [presetsText, setPresetsText] = useState(formatJson(presets));
  const [contractError, setContractError] = useState<string | null>(null);
  const [presetsError, setPresetsError] = useState<string | null>(null);

  useEffect(() => setContractText(formatJson(contract)), [contract]);
  useEffect(() => setPresetsText(formatJson(presets)), [presets]);

  function commitContract(): void {
    const parsed = parseOptionalObject(contractText);
    if (!parsed.ok) {
      setContractError(parsed.error ?? "Invalid input contract");
      return;
    }
    setContractError(null);
    onChangeContract(parsed.value as WorkflowInputContract | undefined);
  }

  function commitPresets(): void {
    const parsed = parseOptionalArray(presetsText);
    if (!parsed.ok) {
      setPresetsError(parsed.error ?? "Invalid input presets");
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
          value={contractText}
          onChangeText={setContractText}
          onBlur={commitContract}
          placeholder={CONTRACT_PLACEHOLDER}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.jsonInput}
        />
      </Field>
      {contractError ? <Text style={styles.error}>{contractError}</Text> : null}
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

function parseOptionalObject(value: string): JsonParseResult {
  if (!value.trim()) {
    return { ok: true, value: undefined };
  }
  return parseJsonShape(
    value,
    (parsed) => {
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    },
    "Input contract must be a JSON object",
  );
}

function parseOptionalArray(value: string): JsonParseResult {
  if (!value.trim()) {
    return { ok: true, value: undefined };
  }
  return parseJsonShape(value, Array.isArray, "Input presets must be a JSON array");
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
    minHeight: 150,
    fontFamily: "monospace",
  },
  error: {
    marginTop: -8,
    fontSize: 12,
    color: theme.colors.destructive,
  },
}));
