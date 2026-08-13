/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Preset selection copies one payload into the run input. */
import { useMemo, type ReactElement } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { WorkflowInputPreset } from "@getpaseo/protocol/workflow/input-contract";
import { Field } from "@/components/ui/form-field";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";

export function WorkflowRunInput({
  presets,
  onChangeInputJson,
}: {
  presets: WorkflowInputPreset[] | undefined;
  inputJson: string;
  onChangeInputJson: (value: string) => void;
}): ReactElement {
  const { t } = useTranslation();
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

  if (presetOptions.length === 0) {
    return <View />;
  }

  return (
    <View style={styles.container}>
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
              onChangeInputJson(JSON.stringify(preset.payload, null, 2));
            }
          }}
          placeholder={t("workflows.inputContract.selectPreset")}
          emptyText={t("workflows.inputContract.noPresets")}
          title={t("workflows.inputContract.preset")}
          size="sm"
        />
      </Field>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[3],
  },
}));
