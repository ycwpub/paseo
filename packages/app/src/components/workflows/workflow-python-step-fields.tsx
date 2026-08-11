/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Python field handlers patch the current workflow node value. */
import type { ReactElement } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { WorkflowPythonStep } from "@getpaseo/protocol/workflow/types";
import { Field } from "@/components/ui/form-field";
import { WorkflowExpandableTextInput } from "@/components/workflows/workflow-expandable-text-input";
import { WorkflowNodeEnvironmentField } from "@/components/workflows/workflow-node-environment-field";
import { WorkflowTextInput } from "@/components/workflows/workflow-text-input";

export function WorkflowPythonStepFields({
  step,
  onChange,
}: {
  step: WorkflowPythonStep;
  onChange: (step: WorkflowPythonStep) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t("workflows.nodes.python.code")} hint={t("workflows.nodes.python.codeHint")}>
        <WorkflowExpandableTextInput
          value={step.code ?? ""}
          onChangeText={(code) =>
            onChange({
              ...step,
              code: optionalText(code),
              ...(code.trim() ? { module: undefined, function: undefined } : {}),
            })
          }
          editorTitle={t("workflows.nodes.python.code")}
          monospace
          multiline
          textAlignVertical="top"
          style={styles.codeInput}
          autoCapitalize="none"
          autoCorrect={false}
          testID={`workflow-python-${step.id}-code`}
        />
      </Field>
      <View style={styles.twoColumn}>
        <View style={styles.columnField}>
          <Field
            label={t("workflows.nodes.python.module")}
            hint={t("workflows.nodes.python.moduleHint")}
          >
            <WorkflowTextInput
              value={step.module ?? ""}
              onChangeText={(module) =>
                onChange({
                  ...step,
                  code: module.trim() ? undefined : step.code,
                  module: optionalText(module),
                })
              }
              placeholder="scripts.prepare"
              size="sm"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field
            label={t("workflows.nodes.python.function")}
            hint={t("workflows.nodes.python.functionHint")}
          >
            <WorkflowTextInput
              value={step.function ?? ""}
              onChangeText={(functionName) =>
                onChange({
                  ...step,
                  code: functionName.trim() ? undefined : step.code,
                  function: optionalText(functionName),
                })
              }
              placeholder="run_node"
              size="sm"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
        </View>
      </View>
      <View style={styles.threeColumn}>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.common.workingDirectory")}>
            <WorkflowTextInput
              value={step.cwd ?? ""}
              onChangeText={(cwd) => onChange({ ...step, cwd: optionalText(cwd) })}
              placeholder={t("workflows.nodes.common.inputFileDirectory")}
              size="sm"
              autoCapitalize="none"
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field
            label={t("workflows.nodes.python.interpreter")}
            hint={t("workflows.nodes.python.interpreterHint")}
          >
            <WorkflowTextInput
              value={step.pythonPath ?? ""}
              onChangeText={(pythonPath) =>
                onChange({ ...step, pythonPath: optionalText(pythonPath) })
              }
              placeholder="python3"
              size="sm"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
        </View>
        <View style={styles.columnField}>
          <Field label={t("workflows.nodes.common.timeout")}>
            <WorkflowTextInput
              value={formatMillisecondsAsSeconds(step.timeoutMs)}
              onChangeText={(value) =>
                onChange({
                  ...step,
                  timeoutMs: optionalPositiveSecondsAsMilliseconds(value),
                })
              }
              placeholder="1800"
              keyboardType="decimal-pad"
              size="sm"
            />
          </Field>
        </View>
      </View>
      <WorkflowNodeEnvironmentField
        value={step.env}
        onChange={(env) => onChange({ ...step, env })}
      />
    </>
  );
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalPositiveSecondsAsMilliseconds(value: string): number | undefined {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) : undefined;
}

function formatMillisecondsAsSeconds(value: number | undefined): string {
  return value === undefined ? "" : String(value / 1000);
}

const styles = StyleSheet.create((theme) => ({
  codeInput: {
    minHeight: 180,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.5),
  },
  threeColumn: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  twoColumn: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  columnField: {
    flex: 1,
    minWidth: 180,
  },
}));
