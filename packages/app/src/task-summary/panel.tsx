import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  FileCode2,
  Link2,
  ListChecks,
  Sparkles,
} from "lucide-react-native";
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import type { StreamItem } from "@/types/stream";
import { openExternalUrl } from "@/utils/open-external-url";
import { buildTaskSummary, type TaskSummaryOutput, type TaskSummaryReference } from "./model";

const EMPTY_ITEMS: StreamItem[] = [];

const ThemedBookOpen = withUnistyles(BookOpen);
const ThemedCheck = withUnistyles(Check);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedCircle = withUnistyles(Circle);
const ThemedFileCode = withUnistyles(FileCode2);
const ThemedLink = withUnistyles(Link2);
const ThemedListChecks = withUnistyles(ListChecks);
const ThemedSparkles = withUnistyles(Sparkles);

const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const extraMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundExtraMuted });
const accentMapping = (theme: Theme) => ({ color: theme.colors.accent });
const accentForegroundMapping = (theme: Theme) => ({ color: theme.colors.accentForeground });

interface AgentTaskSummaryProps {
  serverId: string;
  agentId: string;
  cwd: string;
  onOpenFile?: (path: string) => void;
}

interface TaskSummaryToggleButtonProps {
  onPress: () => void;
}

interface SummarySectionProps {
  title: string;
  count: number;
  emptyText: string;
  children: ReactNode;
}

const sectionPressStyle = ({ pressed }: PressableStateCallbackType) => [
  styles.sectionHeader,
  pressed ? styles.pressed : null,
];
const itemPressStyle = ({ pressed }: PressableStateCallbackType) => [
  styles.itemRow,
  pressed ? styles.pressed : null,
];
function SummarySection({ title, count, emptyText, children }: SummarySectionProps) {
  const [expanded, setExpanded] = useState(true);
  const toggle = useCallback(() => setExpanded((current) => !current), []);
  const accessibilityState = useMemo(() => ({ expanded }), [expanded]);

  let content: ReactNode = null;
  if (expanded) {
    content =
      count > 0 ? (
        <View style={styles.sectionContent}>{children}</View>
      ) : (
        <Text style={styles.emptyText}>{emptyText}</Text>
      );
  }

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        onPress={toggle}
        style={sectionPressStyle}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{count}</Text>
        {expanded ? (
          <ThemedChevronDown size={15} uniProps={mutedMapping} />
        ) : (
          <ThemedChevronRight size={15} uniProps={mutedMapping} />
        )}
      </Pressable>
      {content}
    </View>
  );
}

function ReferenceIcon({ kind }: { kind: TaskSummaryReference["kind"] }) {
  if (kind === "skill") {
    return <ThemedSparkles size={15} uniProps={accentMapping} />;
  }
  if (kind === "link") {
    return <ThemedLink size={15} uniProps={accentMapping} />;
  }
  return <ThemedBookOpen size={15} uniProps={accentMapping} />;
}

const TaskSummaryOutputRow = memo(function TaskSummaryOutputRow({
  output,
  onOpenFile,
}: {
  output: TaskSummaryOutput;
  onOpenFile?: (path: string) => void;
}) {
  const { t } = useTranslation();
  const openFile = useCallback(() => onOpenFile?.(output.path), [onOpenFile, output.path]);

  return (
    <Pressable
      accessibilityRole={onOpenFile ? "button" : undefined}
      accessibilityLabel={t("agentPanel.taskSummary.openFile", { fileName: output.label })}
      disabled={!onOpenFile}
      onPress={openFile}
      style={itemPressStyle}
    >
      <ThemedFileCode size={15} uniProps={mutedMapping} />
      <Text style={styles.itemText}>{output.label}</Text>
    </Pressable>
  );
});

const TaskSummaryReferenceRow = memo(function TaskSummaryReferenceRow({
  reference,
  onOpenFile,
}: {
  reference: TaskSummaryReference;
  onOpenFile?: (path: string) => void;
}) {
  const interactive = Boolean(reference.target);
  const openReference = useCallback(() => {
    if (!reference.target) {
      return;
    }
    if (reference.kind === "link") {
      void openExternalUrl(reference.target);
      return;
    }
    onOpenFile?.(reference.target);
  }, [onOpenFile, reference.kind, reference.target]);

  return (
    <Pressable
      accessibilityRole={interactive ? "button" : undefined}
      disabled={!interactive}
      onPress={openReference}
      style={itemPressStyle}
    >
      <ReferenceIcon kind={reference.kind} />
      <Text style={styles.itemText}>{reference.label}</Text>
    </Pressable>
  );
});

const AgentTaskSummaryBody = memo(function AgentTaskSummaryBody({
  serverId,
  agentId,
  cwd,
  onOpenFile,
}: AgentTaskSummaryProps) {
  const { t } = useTranslation();
  const tail =
    useSessionStore((state) => state.sessions[serverId]?.agentStreamTail.get(agentId)) ??
    EMPTY_ITEMS;
  const head =
    useSessionStore((state) => state.sessions[serverId]?.agentStreamHead.get(agentId)) ??
    EMPTY_ITEMS;
  const summary = useMemo(() => buildTaskSummary([...tail, ...head], { cwd }), [cwd, head, tail]);

  return (
    <View style={styles.body}>
      <SummarySection
        title={t("agentPanel.taskSummary.todos")}
        count={summary.todos.length}
        emptyText={t("agentPanel.taskSummary.emptyTodos")}
      >
        {summary.todos.map((todo) => (
          <View key={todo.id} style={styles.itemRow}>
            {todo.completed ? (
              <View style={styles.completedTodoIcon}>
                <ThemedCheck size={11} strokeWidth={2.5} uniProps={accentForegroundMapping} />
              </View>
            ) : (
              <ThemedCircle size={16} strokeWidth={1.5} uniProps={extraMutedMapping} />
            )}
            <Text style={[styles.itemText, todo.completed ? styles.completedTodoText : null]}>
              {todo.text}
            </Text>
          </View>
        ))}
      </SummarySection>

      <View style={styles.divider} />

      <SummarySection
        title={t("agentPanel.taskSummary.outputs")}
        count={summary.outputs.length}
        emptyText={t("agentPanel.taskSummary.emptyOutputs")}
      >
        {summary.outputs.map((output) => (
          <TaskSummaryOutputRow key={output.id} output={output} onOpenFile={onOpenFile} />
        ))}
      </SummarySection>

      <View style={styles.divider} />

      <SummarySection
        title={t("agentPanel.taskSummary.references")}
        count={summary.references.length}
        emptyText={t("agentPanel.taskSummary.emptyReferences")}
      >
        {summary.references.map((reference) => (
          <TaskSummaryReferenceRow
            key={reference.id}
            reference={reference}
            onOpenFile={onOpenFile}
          />
        ))}
      </SummarySection>
    </View>
  );
});

export const TaskSummaryPane = memo(function TaskSummaryPane(summaryProps: AgentTaskSummaryProps) {
  return (
    <View style={styles.pane} testID="task-summary-pane">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <AgentTaskSummaryBody {...summaryProps} />
      </ScrollView>
    </View>
  );
});

export const TaskSummaryToggleButton = memo(function TaskSummaryToggleButton({
  onPress,
}: TaskSummaryToggleButtonProps) {
  const { t } = useTranslation();
  const buttonStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.toggleButton,
      pressed ? styles.pressed : null,
    ],
    [],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("agentPanel.taskSummary.open")}
      onPress={onPress}
      style={buttonStyle}
      testID="task-summary-toggle"
    >
      <ThemedListChecks size={16} uniProps={foregroundMapping} />
      <Text style={styles.toggleButtonText}>{t("agentPanel.taskSummary.title")}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create((theme) => ({
  pane: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingBottom: theme.spacing[6],
  },
  body: {
    minWidth: 0,
  },
  section: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  sectionHeader: {
    minHeight: 32,
    marginHorizontal: -theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  sectionTitle: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  sectionCount: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
  },
  sectionContent: {
    paddingTop: theme.spacing[2],
    gap: theme.spacing[1],
  },
  divider: {
    height: 1,
    marginHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.border,
  },
  itemRow: {
    minWidth: 0,
    minHeight: 32,
    marginHorizontal: -theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  itemText: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  completedTodoText: {
    color: theme.colors.foregroundExtraMuted,
    textDecorationLine: "line-through",
  },
  completedTodoIcon: {
    width: 16,
    height: 16,
    marginTop: 2,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
  },
  emptyText: {
    paddingTop: theme.spacing[2],
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
  },
  pressed: {
    backgroundColor: theme.colors.surface2,
  },
  toggleButton: {
    position: "absolute",
    top: theme.spacing[3],
    right: theme.spacing[3],
    zIndex: 20,
    minHeight: 34,
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  toggleButtonText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
}));
