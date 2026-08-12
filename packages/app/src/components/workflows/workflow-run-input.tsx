/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- Generated contract fields bind edits to their payload property. */
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import {
  applyWorkflowInputContract,
  type WorkflowInputContract,
  type WorkflowInputPreset,
  type WorkflowInputProperty,
} from "@getpaseo/protocol/workflow/input-contract";
import { Field } from "@/components/ui/form-field";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { WorkflowTextInput } from "./workflow-text-input";

export function WorkflowRunInput({
  contract,
  presets,
  inputJson,
  onChangeInputJson,
}: {
  contract: WorkflowInputContract | undefined;
  presets: WorkflowInputPreset[] | undefined;
  inputJson: string;
  onChangeInputJson: (value: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const payload = useMemo(() => parseInputObject(inputJson), [inputJson]);
  const validation = payload ? applyWorkflowInputContract(contract, payload) : null;
  const presetOptions = useMemo<SelectFieldOption<string>[]>(
    () =>
      (presets ?? []).map((preset) => ({
        id: preset.id,
        value: preset.id,
        label: preset.name,
        description: preset.description,
      })),
    [presets],
  );

  function updateField(name: string, value: unknown): void {
    const current = payload ?? {};
    onChangeInputJson(
      JSON.stringify(
        {
          ...current,
          [name]: value,
        },
        null,
        2,
      ),
    );
  }

  return (
    <View style={styles.container}>
      {presetOptions.length > 0 ? (
        <Field
          label={t("workflows.inputContract.preset")}
          hint={t("workflows.inputContract.presetHint")}
        >
          <SelectField
            field={false}
            label=""
            value=""
            selectedDisplay={null}
            options={presetOptions}
            onChange={(presetId) => {
              const preset = presets?.find((candidate) => candidate.id === presetId);
              if (preset) {
                onChangeInputJson(JSON.stringify({ control: "", ...preset.payload }, null, 2));
              }
            }}
            placeholder={t("workflows.inputContract.selectPreset")}
            emptyText={t("workflows.inputContract.noPresets")}
            title={t("workflows.inputContract.preset")}
            size="sm"
          />
        </Field>
      ) : null}
      {contract && payload ? (
        <View style={styles.fields}>
          {Object.entries(contract.properties).map(([name, property]) => (
            <WorkflowContractField
              key={name}
              name={name}
              property={property}
              required={contract.required?.includes(name) ?? false}
              value={payload[name]}
              onChange={(value) => updateField(name, value)}
            />
          ))}
        </View>
      ) : null}
      {validation && validation.issues.length > 0 ? (
        <View style={styles.issues}>
          {validation.issues.map((issue) => (
            <Text key={`${issue.path}:${issue.code}`} style={styles.issue}>
              {issue.message}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function WorkflowContractField({
  name,
  property,
  required,
  value,
  onChange,
}: {
  name: string;
  property: WorkflowInputProperty;
  required: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(formatFieldValue(value, property));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(formatFieldValue(value, property)), [property, value]);
  const label = `${property.title ?? name}${required ? " *" : ""}`;
  if (property.type === "boolean") {
    const options: SelectFieldOption<string>[] = [
      { id: "true", value: "true", label: t("workflows.inputContract.true") },
      { id: "false", value: "false", label: t("workflows.inputContract.false") },
    ];
    const selected = options.find((option) => option.value === String(value));
    return (
      <Field label={label} hint={property.description}>
        <SelectField
          field={false}
          label=""
          value={selected?.value ?? ""}
          selectedDisplay={selected ? { label: selected.label } : null}
          options={options}
          onChange={(next) => onChange(next === "true")}
          placeholder={t("workflows.inputContract.selectValue")}
          emptyText=""
          title={label}
          size="sm"
        />
      </Field>
    );
  }
  function commit(): void {
    try {
      onChange(parseFieldValue(text, property));
      setError(null);
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : String(commitError));
    }
  }
  return (
    <View>
      <Field label={label} hint={property.description}>
        <WorkflowTextInput
          value={text}
          onChangeText={setText}
          onBlur={commit}
          multiline={property.type === "object" || property.type === "array"}
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          size="sm"
        />
      </Field>
      {error ? <Text style={styles.issue}>{error}</Text> : null}
    </View>
  );
}

function parseInputObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function formatFieldValue(value: unknown, property: WorkflowInputProperty): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (property.type === "string") {
    return String(value);
  }
  return JSON.stringify(
    value,
    null,
    property.type === "object" || property.type === "array" ? 2 : 0,
  );
}

function parseFieldValue(value: string, property: WorkflowInputProperty): unknown {
  if (property.type === "string") {
    return value;
  }
  if (!value.trim()) {
    throw new Error("Value is required");
  }
  const parsed: unknown = JSON.parse(value);
  return parsed;
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: 12,
  },
  fields: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
  },
  issues: {
    gap: 4,
  },
  issue: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.destructive,
  },
}));
