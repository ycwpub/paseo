import { useCallback, useMemo, useState, type ReactElement } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import type { PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { CircleHelp, X } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getWorkflowStepExamples } from "@/workflows/step-examples";

interface WorkflowStepHelpProps {
  step: WorkflowStep;
  typeLabel: string;
}

const STEP_HELP_COPY = {
  bash: {
    input: "workflows.nodes.help.bash.input",
    output: "workflows.nodes.help.bash.output",
  },
  python: {
    input: "workflows.nodes.help.python.input",
    output: "workflows.nodes.help.python.output",
  },
  agent: {
    input: "workflows.nodes.help.agent.input",
    output: "workflows.nodes.help.agent.output",
  },
  switch: {
    input: "workflows.nodes.help.switch.input",
    output: "workflows.nodes.help.switch.output",
  },
  for: {
    input: "workflows.nodes.help.for.input",
    output: "workflows.nodes.help.for.output",
  },
} as const satisfies Record<WorkflowStep["type"], { input: string; output: string }>;

export function WorkflowStepHelp({ step, typeLabel }: WorkflowStepHelpProps): ReactElement {
  const { t } = useTranslation();
  const { height: viewportHeight } = useWindowDimensions();
  const [isOpen, setIsOpen] = useState(false);
  const examples = getWorkflowStepExamples(step);
  const copy = STEP_HELP_COPY[step.type];
  const outputDescriptionKey =
    step.type === "agent" && (step.outputMode ?? "normal") === "custom"
      ? "workflows.nodes.help.agent.controlOutput"
      : copy.output;
  const closeHelp = useCallback(() => setIsOpen(false), []);
  const closeButtonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.closeButton,
      (hovered || pressed) && styles.closeButtonActive,
    ],
    [],
  );
  const popoverHeight = useMemo(() => Math.max(240, viewportHeight - 24), [viewportHeight]);
  const scrollHeight = useMemo(() => Math.max(176, popoverHeight - 52), [popoverHeight]);

  return (
    <Tooltip
      open={isOpen}
      onOpenChange={setIsOpen}
      delayDuration={0}
      enabledOnDesktop
      enabledOnMobile
      openOnHover={false}
      openOnPress
      dismissOnTriggerPressOnly
    >
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("workflows.nodes.help.show", { type: typeLabel })}
          hitSlop={8}
          style={styles.trigger}
          testID={`workflow-step-${step.id}-help`}
        >
          <CircleHelp size={16} color={styles.triggerIcon.color} />
        </Pressable>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="end"
        offset={8}
        maxWidth={680}
        interactive
        style={[styles.popover, { maxHeight: popoverHeight }]}
        testID={`workflow-step-${step.id}-help-content`}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("workflows.nodes.help.title", { type: typeLabel })}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.actions.close")}
              hitSlop={8}
              onPress={closeHelp}
              style={closeButtonStyle}
              testID={`workflow-step-${step.id}-help-close`}
            >
              <X size={16} color={styles.closeIcon.color} />
            </Pressable>
          </View>
          <ScrollView
            style={[styles.scroll, { maxHeight: scrollHeight }]}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.scrollContent}>
              <HelpSection
                title={t("workflows.nodes.help.inputTitle")}
                description={t(copy.input)}
                example={examples.input}
              />
              <HelpSection
                title={t("workflows.nodes.help.outputTitle")}
                description={t(outputDescriptionKey)}
                example={examples.output}
              />
              {examples.initialValue ? (
                <HelpSection
                  title={t("workflows.nodes.help.initialValueTitle")}
                  description={t("workflows.nodes.help.initialValueDescription")}
                  example={examples.initialValue}
                />
              ) : null}
              {examples.composition ? (
                <HelpSection
                  title={t("workflows.nodes.help.compositionTitle")}
                  description={t("workflows.nodes.help.compositionDescription")}
                  example={examples.composition}
                />
              ) : null}
            </View>
          </ScrollView>
        </View>
      </TooltipContent>
    </Tooltip>
  );
}

function HelpSection({
  title,
  description,
  example,
}: {
  title: string;
  description: string;
  example: string;
}): ReactElement {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Text style={styles.code} selectable>
        {example}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
  },
  triggerIcon: {
    color: theme.colors.foregroundMuted,
  },
  popover: {
    padding: theme.spacing[3],
    overflow: "hidden",
  },
  content: {
    width: 640,
    maxWidth: "100%",
    minHeight: 0,
    gap: theme.spacing[2],
  },
  header: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  closeButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  closeButtonActive: {
    backgroundColor: theme.colors.surface2,
  },
  closeIcon: {
    color: theme.colors.foregroundMuted,
  },
  scroll: {
    minHeight: 0,
  },
  scrollContent: {
    gap: theme.spacing[3],
    paddingRight: theme.spacing[1],
    paddingBottom: theme.spacing[1],
  },
  section: {
    gap: theme.spacing[2],
  },
  sectionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  code: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface2,
  },
}));
