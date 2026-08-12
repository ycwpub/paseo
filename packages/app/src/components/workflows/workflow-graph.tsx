/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- Graph nodes bind selection and accessibility state to their stable workflow step ID. */
import { useMemo, type ReactElement } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  Bot,
  ChevronDown,
  FileCode2,
  GitBranch,
  Repeat2,
  TerminalSquare,
  Workflow,
} from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { WorkflowNodeRun, WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  buildWorkflowGraphModel,
  type WorkflowGraphBranch,
  type WorkflowGraphNode,
  type WorkflowGraphStatus,
} from "@/workflows/graph-model";

export function WorkflowGraph({
  steps,
  nodeRuns = [],
  selectedStepId = null,
  onSelectStep,
  mode,
}: {
  steps: WorkflowStep[];
  nodeRuns?: WorkflowNodeRun[];
  selectedStepId?: string | null;
  onSelectStep?: (stepId: string) => void;
  mode: "design" | "run";
}): ReactElement {
  const { t } = useTranslation();
  const model = useMemo(() => buildWorkflowGraphModel(steps, nodeRuns), [nodeRuns, steps]);
  const orderByStepId = useMemo(() => createOrderIndex(model.nodes), [model.nodes]);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{t("workflows.graph.title")}</Text>
          <Text style={styles.hint}>
            {t(mode === "run" ? "workflows.graph.runHint" : "workflows.graph.designHint")}
          </Text>
        </View>
        <Text style={styles.count}>
          {t("workflows.graph.nodeCount", { count: orderByStepId.size })}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={styles.scrollContent}
      >
        <WorkflowGraphSequence
          nodes={model.nodes}
          orderByStepId={orderByStepId}
          selectedStepId={selectedStepId}
          onSelectStep={onSelectStep}
          mode={mode}
        />
      </ScrollView>
      {mode === "run" ? (
        <Text style={styles.footerHint}>{t("workflows.graph.selectNodeHint")}</Text>
      ) : null}
    </View>
  );
}

function WorkflowGraphSequence({
  nodes,
  orderByStepId,
  selectedStepId,
  onSelectStep,
  mode,
}: {
  nodes: WorkflowGraphNode[];
  orderByStepId: Map<string, number>;
  selectedStepId: string | null;
  onSelectStep: ((stepId: string) => void) | undefined;
  mode: "design" | "run";
}) {
  return (
    <View style={styles.sequence}>
      {nodes.map((node, index) => (
        <View key={node.stepId} style={styles.sequenceItem}>
          {index > 0 ? <SequenceConnector /> : null}
          <WorkflowGraphNodeCard
            node={node}
            order={orderByStepId.get(node.stepId) ?? 0}
            selected={selectedStepId === node.stepId}
            onPress={onSelectStep ? () => onSelectStep(node.stepId) : undefined}
            mode={mode}
          />
          {node.branches.length > 0 ? (
            <WorkflowGraphBranches
              branches={node.branches}
              orderByStepId={orderByStepId}
              selectedStepId={selectedStepId}
              onSelectStep={onSelectStep}
              mode={mode}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

function WorkflowGraphNodeCard({
  node,
  order,
  selected,
  onPress,
  mode,
}: {
  node: WorkflowGraphNode;
  order: number;
  selected: boolean;
  onPress: (() => void) | undefined;
  mode: "design" | "run";
}) {
  const { t } = useTranslation();
  const icon = renderStepIcon(node);
  const cardContent = (
    <>
      <View style={styles.nodeHeader}>
        <View style={styles.nodeIdentity}>
          <View style={styles.order}>
            <Text style={styles.orderText}>{String(order).padStart(2, "0")}</Text>
          </View>
          {icon}
          <View style={styles.nodeText}>
            <Text style={styles.nodeName} numberOfLines={1}>
              {node.stepName || node.stepId}
            </Text>
            <Text style={styles.nodeId} numberOfLines={1}>
              {node.stepId} · {t(`workflows.nodes.types.${node.stepType}`)}
            </Text>
          </View>
        </View>
        {mode === "run" ? (
          <StatusBadge
            label={t(`workflows.graph.status.${node.status}`)}
            variant={statusVariant(node.status)}
          />
        ) : null}
      </View>
      <Text style={styles.dependencyText} numberOfLines={1}>
        {node.dependencies.length > 0
          ? `${t("workflows.graph.dependencies")} · ${node.dependencies.join(", ")}`
          : t("workflows.graph.startNode")}
      </Text>
      {mode === "run" ? <WorkflowGraphRunPreview node={node} /> : null}
    </>
  );
  if (!onPress) {
    return <View style={[styles.node, selected && styles.nodeSelected]}>{cardContent}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.node,
        selected && styles.nodeSelected,
        hovered && styles.nodeHovered,
        pressed && styles.nodePressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {cardContent}
    </Pressable>
  );
}

function WorkflowGraphRunPreview({ node }: { node: WorkflowGraphNode }) {
  const { t } = useTranslation();
  const latest = node.latestRun;
  return (
    <View style={styles.runPreview}>
      <Text style={styles.runCount}>
        {t("workflows.graph.executionCount", { count: node.runs.length })}
      </Text>
      <GraphPayloadPreview label={t("workflows.run.input")} value={latest?.inputPayload ?? null} />
      <GraphPayloadPreview
        label={t("workflows.run.outputPayload")}
        value={latest?.outputPayload ?? null}
      />
      {latest?.error ? (
        <Text style={styles.errorPreview} numberOfLines={2}>
          {latest.error}
        </Text>
      ) : null}
    </View>
  );
}

function GraphPayloadPreview({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.payloadRow}>
      <Text style={styles.payloadLabel}>{label}</Text>
      <Text style={styles.payloadValue} numberOfLines={1}>
        {compactPayload(value)}
      </Text>
    </View>
  );
}

function WorkflowGraphBranches({
  branches,
  orderByStepId,
  selectedStepId,
  onSelectStep,
  mode,
}: {
  branches: WorkflowGraphBranch[];
  orderByStepId: Map<string, number>;
  selectedStepId: string | null;
  onSelectStep: ((stepId: string) => void) | undefined;
  mode: "design" | "run";
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.branchGroup}>
      <View style={styles.forkStem} />
      <View style={styles.branchHeading}>
        <GitBranch size={13} color={styles.branchIcon.color} />
        <Text style={styles.branchHeadingText}>{t("workflows.graph.branches")}</Text>
      </View>
      <View style={styles.branchRow}>
        {branches.map((branch) => (
          <View key={branch.id} style={styles.branch}>
            <View style={styles.branchLabelRow}>
              {branch.kind === "loop" ? (
                <Repeat2 size={12} color={styles.branchIcon.color} />
              ) : null}
              <Text style={styles.branchLabel}>{formatBranchLabel(branch, t)}</Text>
            </View>
            {branch.nodes.length > 0 ? (
              <WorkflowGraphSequence
                nodes={branch.nodes}
                orderByStepId={orderByStepId}
                selectedStepId={selectedStepId}
                onSelectStep={onSelectStep}
                mode={mode}
              />
            ) : (
              <View style={styles.emptyBranch}>
                <Text style={styles.emptyBranchText}>{t("workflows.graph.emptyBranch")}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
      <View style={styles.merge}>
        <ChevronDown size={13} color={styles.connectorIcon.color} />
        <Text style={styles.mergeText}>{t("workflows.graph.merge")}</Text>
      </View>
    </View>
  );
}

function SequenceConnector() {
  return (
    <View style={styles.connector}>
      <View style={styles.connectorLine} />
      <ChevronDown size={14} color={styles.connectorIcon.color} />
    </View>
  );
}

function renderStepIcon(node: WorkflowGraphNode): ReactElement {
  const props = { size: 13, color: styles.nodeIcon.color };
  if (node.stepType === "agent") {
    return <Bot {...props} />;
  }
  if (node.stepType === "workflow") {
    return <Workflow {...props} />;
  }
  if (node.stepType === "switch") {
    return <GitBranch {...props} />;
  }
  if (node.stepType === "for") {
    return <Repeat2 {...props} />;
  }
  if (node.stepType === "python") {
    return <FileCode2 {...props} />;
  }
  return <TerminalSquare {...props} />;
}

function statusVariant(status: WorkflowGraphStatus): "success" | "error" | "muted" {
  if (status === "succeeded") {
    return "success";
  }
  if (status === "failed" || status === "cancelled" || status === "timed_out") {
    return "error";
  }
  return "muted";
}

function createOrderIndex(nodes: WorkflowGraphNode[]): Map<string, number> {
  const order = new Map<string, number>();
  visitGraphNodes(nodes, (node) => order.set(node.stepId, order.size + 1));
  return order;
}

function visitGraphNodes(
  nodes: WorkflowGraphNode[],
  visit: (node: WorkflowGraphNode) => void,
): void {
  for (const node of nodes) {
    visit(node);
    for (const branch of node.branches) {
      visitGraphNodes(branch.nodes, visit);
    }
  }
}

function formatBranchLabel(
  branch: WorkflowGraphBranch,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (branch.kind === "default") {
    return t("workflows.graph.defaultBranch");
  }
  if (branch.kind === "loop") {
    return t("workflows.graph.loopBody");
  }
  return t("workflows.graph.caseBranch", { value: branch.label });
}

function compactPayload(value: string | null): string {
  if (!value) {
    return "—";
  }
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value;
  }
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  hint: {
    marginTop: theme.spacing[1],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  count: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  scrollContent: {
    minWidth: "100%",
    paddingHorizontal: theme.spacing[1],
    paddingBottom: theme.spacing[1],
    alignItems: "center",
  },
  sequence: {
    minWidth: 208,
    alignItems: "center",
  },
  sequenceItem: {
    alignItems: "center",
  },
  node: {
    width: 208,
    gap: theme.spacing[2],
    padding: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
  },
  nodeSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface3,
  },
  nodeHovered: {
    borderColor: theme.colors.borderAccent,
  },
  nodePressed: {
    opacity: theme.opacity[50],
  },
  nodeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  nodeIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  order: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface4,
  },
  orderText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
  },
  nodeIcon: {
    color: theme.colors.foregroundMuted,
  },
  nodeText: {
    flex: 1,
    minWidth: 0,
  },
  nodeName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  nodeId: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
  },
  dependencyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
  },
  connector: {
    height: 26,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  connectorLine: {
    flex: 1,
    width: theme.borderWidth[1],
    backgroundColor: theme.colors.borderAccent,
  },
  connectorIcon: {
    color: theme.colors.foregroundMuted,
  },
  branchGroup: {
    alignItems: "center",
  },
  forkStem: {
    width: theme.borderWidth[1],
    height: theme.spacing[3],
    backgroundColor: theme.colors.borderAccent,
  },
  branchHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
  branchHeadingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  branchIcon: {
    color: theme.colors.foregroundMuted,
  },
  branchRow: {
    marginTop: theme.spacing[1],
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
    padding: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
  },
  branch: {
    width: 224,
    alignItems: "center",
    gap: theme.spacing[2],
  },
  branchLabelRow: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
  branchLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
  emptyBranch: {
    width: 208,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderStyle: "dashed",
    borderRadius: theme.borderRadius.lg,
  },
  emptyBranchText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  merge: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    marginTop: theme.spacing[2],
  },
  mergeText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  runPreview: {
    gap: theme.spacing[1],
    paddingTop: theme.spacing[1],
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  runCount: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  payloadRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  payloadLabel: {
    minWidth: 28,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  payloadValue: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
  },
  errorPreview: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.xs,
  },
  footerHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
