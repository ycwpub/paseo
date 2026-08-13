import { useMemo, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { findWorkflowStep } from "@/workflows/step-lookup";

export function WorkflowStepDetailsSheet({
  steps,
  stepId,
  onClose,
}: {
  steps: WorkflowStep[];
  stepId: string | null;
  onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const step = useMemo(() => findWorkflowStep(steps, stepId), [stepId, steps]);
  const header = useMemo<SheetHeader>(
    () => ({
      title: step?.name || step?.id || t("workflows.graph.nodeDetails"),
      subtitle: step
        ? `${t(`workflows.nodes.types.${step.type}`)} · ${step.id}`
        : t("workflows.graph.nodeDetails"),
    }),
    [step, t],
  );
  const configuration = useMemo(() => (step ? JSON.stringify(step, null, 2) : ""), [step]);

  return (
    <AdaptiveModalSheet
      visible={Boolean(stepId)}
      header={header}
      onClose={onClose}
      desktopMaxWidth={900}
      snapPoints={["85%", "95%"]}
      testID="workflow-step-details"
    >
      {step ? (
        <View style={styles.content}>
          <View style={styles.summary}>
            <WorkflowStepProperty label={t("workflows.graph.nodeName")} value={step.name || "—"} />
            <WorkflowStepProperty label={t("workflows.graph.nodeId")} value={step.id} mono />
            <WorkflowStepProperty
              label={t("workflows.graph.nodeType")}
              value={t(`workflows.nodes.types.${step.type}`)}
            />
          </View>
          <View style={styles.configuration}>
            <Text style={styles.sectionTitle}>{t("workflows.graph.configuration")}</Text>
            <Text style={styles.code} selectable>
              {configuration}
            </Text>
          </View>
        </View>
      ) : null}
    </AdaptiveModalSheet>
  );
}

function WorkflowStepProperty({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): ReactElement {
  return (
    <View style={styles.property}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, mono && styles.mono]} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[4],
  },
  summary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  property: {
    minWidth: 180,
    flex: 1,
    gap: theme.spacing[1],
    padding: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  value: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  mono: {
    fontFamily: theme.fontFamily.mono,
  },
  configuration: {
    gap: theme.spacing[2],
  },
  sectionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  code: {
    padding: theme.spacing[4],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
    lineHeight: 19,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
  },
}));
