/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- Workflow graph positions and node selection styles are derived from the stable layout model. */
import { useCallback, useMemo, useState, type ReactElement } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  Bot,
  CircleStop,
  FileCode2,
  GitBranch,
  Maximize2,
  Play,
  Repeat2,
  TerminalSquare,
  ZoomIn,
  ZoomOut,
} from "lucide-react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { StyleSheet } from "react-native-unistyles";
import type { WorkflowNodeRun, WorkflowStep } from "@getpaseo/protocol/workflow/types";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import {
  buildWorkflowGraphModel,
  type WorkflowGraphNode,
  type WorkflowGraphStatus,
} from "@/workflows/graph-model";
import {
  layoutWorkflowGraph,
  type WorkflowGraphLayoutEdge,
  type WorkflowGraphLayoutNode,
} from "@/workflows/graph-layout";
import {
  calculateWorkflowGraphZoomGeometry,
  DEFAULT_WORKFLOW_GRAPH_ZOOM,
  formatWorkflowGraphZoom,
  zoomWorkflowGraphIn,
  zoomWorkflowGraphOut,
} from "@/workflows/graph-zoom";

const FULL_GRAPH_SNAP_POINTS = ["95%"];

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
  const { height: windowHeight } = useWindowDimensions();
  const [fullGraphVisible, setFullGraphVisible] = useState(false);
  const fullGraphHeight = Math.max(420, Math.min(900, Math.round(windowHeight * 0.72)));
  const openFullGraph = useCallback(() => setFullGraphVisible(true), []);
  const closeFullGraph = useCallback(() => setFullGraphVisible(false), []);
  const selectFromFullGraph = useCallback(
    (stepId: string) => {
      closeFullGraph();
      onSelectStep?.(stepId);
    },
    [closeFullGraph, onSelectStep],
  );
  const fullGraphHeader = useMemo<SheetHeader>(
    () => ({
      title: t("workflows.graph.fullViewTitle"),
      subtitle: t("workflows.graph.fullViewHint"),
    }),
    [t],
  );

  return (
    <>
      <WorkflowGraphSurface
        steps={steps}
        nodeRuns={nodeRuns}
        selectedStepId={selectedStepId}
        onSelectStep={onSelectStep}
        onOpenFullGraph={openFullGraph}
        mode={mode}
      />
      <AdaptiveModalSheet
        visible={fullGraphVisible}
        header={fullGraphHeader}
        onClose={closeFullGraph}
        desktopMaxWidth={1600}
        snapPoints={FULL_GRAPH_SNAP_POINTS}
        scrollable={false}
        contentStyle={styles.fullGraphSheetContent}
        testID="workflow-full-graph"
      >
        <WorkflowGraphSurface
          steps={steps}
          nodeRuns={nodeRuns}
          selectedStepId={selectedStepId}
          onSelectStep={onSelectStep ? selectFromFullGraph : undefined}
          mode={mode}
          presentation="full"
          viewportHeight={fullGraphHeight}
        />
      </AdaptiveModalSheet>
    </>
  );
}

function WorkflowGraphSurface({
  steps,
  nodeRuns,
  selectedStepId,
  onSelectStep,
  onOpenFullGraph,
  mode,
  presentation = "embedded",
  viewportHeight,
}: {
  steps: WorkflowStep[];
  nodeRuns: WorkflowNodeRun[];
  selectedStepId: string | null;
  onSelectStep?: (stepId: string) => void;
  onOpenFullGraph?: () => void;
  mode: "design" | "run";
  presentation?: "embedded" | "full";
  viewportHeight?: number;
}): ReactElement {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(DEFAULT_WORKFLOW_GRAPH_ZOOM);
  const model = useMemo(() => buildWorkflowGraphModel(steps, nodeRuns), [nodeRuns, steps]);
  const layout = useMemo(() => layoutWorkflowGraph(model), [model]);
  const orderByStepId = useMemo(
    () =>
      new Map(
        layout.nodes
          .filter((candidate) => candidate.kind === "step")
          .map((candidate, index) => [candidate.id, index + 1]),
      ),
    [layout.nodes],
  );
  const nodeById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes],
  );
  const zoomIn = useCallback(() => setZoom((current) => zoomWorkflowGraphIn(current)), []);
  const zoomOut = useCallback(() => setZoom((current) => zoomWorkflowGraphOut(current)), []);
  const resetZoom = useCallback(() => setZoom(DEFAULT_WORKFLOW_GRAPH_ZOOM), []);
  const zoomGeometry = useMemo(
    () => calculateWorkflowGraphZoomGeometry(layout.width, layout.height, zoom),
    [layout.height, layout.width, zoom],
  );
  const graphScaleStyle = useMemo(
    () => ({
      width: layout.width,
      height: layout.height,
      transform: [{ scale: zoomGeometry.scale }],
      transformOrigin: "0px 0px",
    }),
    [layout.height, layout.width, zoomGeometry.scale],
  );
  const scaledCanvasStyle = useMemo(
    () => ({
      width: zoomGeometry.contentWidth,
      height: zoomGeometry.contentHeight,
    }),
    [zoomGeometry.contentHeight, zoomGeometry.contentWidth],
  );

  return (
    <View
      style={[
        styles.card,
        presentation === "full" && styles.fullGraphCard,
        viewportHeight ? { height: viewportHeight } : null,
      ]}
    >
      <View style={styles.header}>
        <View style={styles.heading}>
          <View style={styles.titleRow}>
            <GitBranch size={15} color={styles.headingIcon.color} />
            <Text style={styles.title}>{t("workflows.graph.title")}</Text>
          </View>
          <Text style={styles.hint}>
            {t(mode === "run" ? "workflows.graph.runHint" : "workflows.graph.designHint")}
          </Text>
        </View>
        <View style={styles.headerMeta}>
          <Text style={styles.direction}>{t("workflows.graph.leftToRight")}</Text>
          <Text style={styles.count}>
            {t("workflows.graph.nodeCount", { count: orderByStepId.size })}
          </Text>
        </View>
      </View>
      <View style={styles.graphToolbar}>
        {mode === "run" ? <WorkflowGraphLegend /> : <View style={styles.toolbarSpacer} />}
        <View style={styles.graphActions}>
          <Button
            variant="ghost"
            size="xs"
            leftIcon={ZoomOut}
            onPress={zoomOut}
            accessibilityLabel={t("workflows.graph.zoomOut")}
            testID="workflow-graph-zoom-out"
          />
          <Button
            variant="ghost"
            size="xs"
            onPress={resetZoom}
            accessibilityLabel={t("workflows.graph.resetZoom")}
            testID="workflow-graph-reset-zoom"
          >
            {formatWorkflowGraphZoom(zoom)}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            leftIcon={ZoomIn}
            onPress={zoomIn}
            accessibilityLabel={t("workflows.graph.zoomIn")}
            testID="workflow-graph-zoom-in"
          />
          {onOpenFullGraph ? (
            <Button
              variant="outline"
              size="xs"
              leftIcon={Maximize2}
              onPress={onOpenFullGraph}
              testID="workflow-graph-open-full"
            >
              {t("workflows.graph.fullView")}
            </Button>
          ) : null}
        </View>
      </View>
      <View
        style={[
          styles.canvasViewport,
          presentation === "full"
            ? styles.fullGraphCanvasViewport
            : { height: zoomGeometry.viewportHeight },
        ]}
      >
        <ScrollView
          style={styles.graphVerticalViewport}
          contentContainerStyle={styles.verticalScrollContent}
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={styles.scrollContent}
            nestedScrollEnabled
          >
            <View style={scaledCanvasStyle}>
              <View style={[styles.canvas, graphScaleStyle]}>
                <WorkflowGraphEdges
                  width={layout.width}
                  height={layout.height}
                  edges={layout.edges}
                  nodeById={nodeById}
                  mode={mode}
                />
                {layout.edges.map((edge) => (
                  <WorkflowGraphEdgeLabel
                    key={`label:${edge.id}`}
                    edge={edge}
                    source={nodeById.get(edge.from) ?? null}
                  />
                ))}
                {layout.nodes.map((positioned) => (
                  <WorkflowGraphCanvasNode
                    key={positioned.id}
                    positioned={positioned}
                    order={orderByStepId.get(positioned.id) ?? 0}
                    selected={selectedStepId === positioned.id}
                    onSelectStep={onSelectStep}
                    mode={mode}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        </ScrollView>
      </View>
      {mode === "run" ? (
        <Text style={styles.footerHint}>{t("workflows.graph.selectNodeHint")}</Text>
      ) : null}
    </View>
  );
}

function WorkflowGraphEdges({
  width,
  height,
  edges,
  nodeById,
  mode,
}: {
  width: number;
  height: number;
  edges: WorkflowGraphLayoutEdge[];
  nodeById: Map<string, WorkflowGraphLayoutNode>;
  mode: "design" | "run";
}) {
  return (
    <Svg width={width} height={height} style={styles.edgeLayer} pointerEvents="none">
      {edges.map((edge) => {
        const targetStatus = nodeById.get(edge.to)?.node?.status ?? "not_run";
        const color = edgeColor(edge, targetStatus, mode);
        return (
          <Path
            key={edge.id}
            d={edge.path}
            fill="none"
            stroke={color}
            strokeWidth={edge.kind === "loop_back" ? 1.5 : 1.25}
            strokeDasharray={edge.kind === "loop_back" ? "5 4" : undefined}
          />
        );
      })}
      {edges.map((edge) => {
        const target = nodeById.get(edge.to);
        if (!target) {
          return null;
        }
        const color = edgeColor(edge, target.node?.status ?? "not_run", mode);
        return (
          <Circle
            key={`target:${edge.id}`}
            cx={target.x}
            cy={target.y + target.height / 2}
            r={2.5}
            fill={color}
          />
        );
      })}
    </Svg>
  );
}

function WorkflowGraphEdgeLabel({
  edge,
  source,
}: {
  edge: WorkflowGraphLayoutEdge;
  source: WorkflowGraphLayoutNode | null;
}) {
  const { t } = useTranslation();
  const label = formatEdgeLabel(edge, source?.node ?? null, t);
  if (!label) {
    return null;
  }
  return (
    <View
      pointerEvents="none"
      style={[
        styles.edgeLabel,
        {
          left: edge.labelX - 48,
          top: edge.labelY - 10,
        },
      ]}
    >
      <Text style={styles.edgeLabelText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function WorkflowGraphCanvasNode({
  positioned,
  order,
  selected,
  onSelectStep,
  mode,
}: {
  positioned: WorkflowGraphLayoutNode;
  order: number;
  selected: boolean;
  onSelectStep: ((stepId: string) => void) | undefined;
  mode: "design" | "run";
}) {
  const position = {
    left: positioned.x,
    top: positioned.y,
    width: positioned.width,
    height: positioned.height,
  };
  if (positioned.kind !== "step" || !positioned.node) {
    return <WorkflowBoundaryNode positioned={positioned} position={position} />;
  }
  const node = positioned.node;
  const content = <WorkflowStepNodeContent node={node} order={order} mode={mode} />;
  if (!onSelectStep) {
    return (
      <View
        style={[
          styles.node,
          statusNodeStyle(node.status, mode),
          selected && styles.nodeSelected,
          position,
        ]}
      >
        <WorkflowNodePorts />
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => onSelectStep(node.stepId)}
      style={({ hovered, pressed }) => [
        styles.node,
        statusNodeStyle(node.status, mode),
        selected && styles.nodeSelected,
        hovered && styles.nodeHovered,
        pressed && styles.nodePressed,
        position,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${node.stepName || node.stepId}, ${node.stepType}`}
    >
      <WorkflowNodePorts />
      {content}
    </Pressable>
  );
}

function WorkflowStepNodeContent({
  node,
  order,
  mode,
}: {
  node: WorkflowGraphNode;
  order: number;
  mode: "design" | "run";
}) {
  const { t } = useTranslation();
  const runtimeMeta = formatRuntimeMeta(node);
  return (
    <>
      <View style={styles.nodeHeader}>
        <View style={styles.typeIdentity}>
          {renderStepIcon(node)}
          <Text style={styles.typeLabel}>{t(`workflows.nodes.types.${node.stepType}`)}</Text>
        </View>
        {mode === "run" ? (
          <View style={styles.statusIdentity}>
            <View style={[styles.statusDot, statusDotStyle(node.status)]} />
            <Text style={styles.statusText}>{t(`workflows.graph.status.${node.status}`)}</Text>
          </View>
        ) : (
          <Text style={styles.orderText}>{String(order).padStart(2, "0")}</Text>
        )}
      </View>
      <Text style={styles.nodeName} numberOfLines={2}>
        {node.stepName || node.stepId}
      </Text>
      <View style={styles.nodeFooter}>
        <Text style={styles.nodeId} numberOfLines={1}>
          {node.stepId}
        </Text>
        {mode === "run" && runtimeMeta ? (
          <Text style={styles.runtimeMeta} numberOfLines={1}>
            {runtimeMeta}
          </Text>
        ) : null}
      </View>
    </>
  );
}

function WorkflowBoundaryNode({
  positioned,
  position,
}: {
  positioned: WorkflowGraphLayoutNode;
  position: { left: number; top: number; width: number; height: number };
}) {
  const { t } = useTranslation();
  const isStart = positioned.kind === "start";
  return (
    <View style={[styles.boundaryNode, position]}>
      {isStart ? (
        <Play size={12} color={styles.boundaryIcon.color} fill={styles.boundaryIcon.color} />
      ) : (
        <CircleStop size={13} color={styles.boundaryIcon.color} />
      )}
      <Text style={styles.boundaryText}>
        {t(isStart ? "workflows.graph.start" : "workflows.graph.end")}
      </Text>
      <View style={isStart ? styles.outputPort : styles.inputPort} />
    </View>
  );
}

function WorkflowNodePorts() {
  return (
    <>
      <View style={styles.inputPort} />
      <View style={styles.outputPort} />
    </>
  );
}

function WorkflowGraphLegend() {
  const { t } = useTranslation();
  const statuses: WorkflowGraphStatus[] = ["running", "succeeded", "failed", "not_run"];
  return (
    <View style={styles.legend}>
      {statuses.map((status) => (
        <View key={status} style={styles.legendItem}>
          <View style={[styles.statusDot, statusDotStyle(status)]} />
          <Text style={styles.legendText}>{t(`workflows.graph.status.${status}`)}</Text>
        </View>
      ))}
    </View>
  );
}

function renderStepIcon(node: WorkflowGraphNode): ReactElement {
  const props = { size: 12, color: styles.nodeIcon.color };
  if (node.stepType === "agent") {
    return <Bot {...props} />;
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

function formatEdgeLabel(
  edge: WorkflowGraphLayoutEdge,
  source: WorkflowGraphNode | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (edge.kind === "loop_back") {
    return t("workflows.graph.loopBack");
  }
  if (edge.kind !== "branch") {
    return null;
  }
  if (source?.stepType === "for") {
    return t("workflows.graph.loopBody");
  }
  if (edge.label === null) {
    return t("workflows.graph.defaultBranch");
  }
  return t("workflows.graph.caseBranch", { value: edge.label });
}

function formatRuntimeMeta(node: WorkflowGraphNode): string | null {
  const latest = node.latestRun;
  if (!latest) {
    return null;
  }
  const count = node.runs.length > 1 ? `×${node.runs.length}` : "";
  const duration = formatCompactDuration(latest.startedAt, latest.endedAt);
  const control = latest.outputControl?.trim();
  return [count, duration, control ? `→ ${control}` : ""].filter(Boolean).join(" · ");
}

function formatCompactDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) {
    return "";
  }
  const durationMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return "";
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
  }
  return `${Math.floor(durationMs / 60_000)}m ${Math.round((durationMs % 60_000) / 1000)}s`;
}

function edgeColor(
  edge: WorkflowGraphLayoutEdge,
  targetStatus: WorkflowGraphStatus,
  mode: "design" | "run",
): string {
  if (edge.kind === "loop_back") {
    return styles.edgeLoop.color;
  }
  if (mode === "design") {
    return edge.kind === "branch" ? styles.edgeBranch.color : styles.edgeDefault.color;
  }
  if (targetStatus === "running") {
    return styles.edgeRunning.color;
  }
  if (targetStatus === "succeeded") {
    return styles.edgeSucceeded.color;
  }
  if (targetStatus === "failed" || targetStatus === "cancelled" || targetStatus === "timed_out") {
    return styles.edgeFailed.color;
  }
  return styles.edgeDefault.color;
}

function statusNodeStyle(status: WorkflowGraphStatus, mode: "design" | "run") {
  if (mode === "design") {
    return null;
  }
  if (status === "running") {
    return styles.nodeRunning;
  }
  if (status === "succeeded") {
    return styles.nodeSucceeded;
  }
  if (status === "failed" || status === "cancelled" || status === "timed_out") {
    return styles.nodeFailed;
  }
  if (status === "skipped") {
    return styles.nodeSkipped;
  }
  return null;
}

function statusDotStyle(status: WorkflowGraphStatus) {
  if (status === "running") {
    return styles.statusRunning;
  }
  if (status === "succeeded") {
    return styles.statusSucceeded;
  }
  if (status === "failed" || status === "cancelled" || status === "timed_out") {
    return styles.statusFailed;
  }
  if (status === "skipped") {
    return styles.statusSkipped;
  }
  return styles.statusPending;
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
  fullGraphCard: {
    flex: 1,
    minHeight: 0,
  },
  fullGraphSheetContent: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  heading: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  headingIcon: {
    color: theme.colors.foregroundMuted,
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
  headerMeta: {
    alignItems: "flex-end",
    gap: theme.spacing[1],
  },
  direction: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  count: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
  },
  legend: {
    flex: 1,
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  graphToolbar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  toolbarSpacer: {
    flex: 1,
  },
  graphActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
  canvasViewport: {
    width: "100%",
    minHeight: 0,
    overflow: "hidden",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
  },
  fullGraphCanvasViewport: {
    flex: 1,
  },
  graphVerticalViewport: {
    flex: 1,
    minHeight: 0,
  },
  verticalScrollContent: {
    minHeight: "100%",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  legendText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  scrollContent: {
    minWidth: "100%",
    paddingBottom: theme.spacing[1],
  },
  canvas: {
    position: "relative",
  },
  edgeLayer: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  edgeDefault: {
    color: theme.colors.borderAccent,
  },
  edgeBranch: {
    color: theme.colors.foregroundMuted,
  },
  edgeLoop: {
    color: theme.colors.foregroundMuted,
  },
  edgeRunning: {
    color: theme.colors.accentBright,
  },
  edgeSucceeded: {
    color: theme.colors.statusSuccess,
  },
  edgeFailed: {
    color: theme.colors.statusDanger,
  },
  edgeLabel: {
    position: "absolute",
    width: 96,
    minHeight: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[1],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface1,
  },
  edgeLabelText: {
    color: theme.colors.foregroundMuted,
    fontSize: 10,
    fontFamily: theme.fontFamily.mono,
  },
  node: {
    position: "absolute",
    justifyContent: "space-between",
    gap: 2,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 7,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
  },
  nodeSelected: {
    borderWidth: 2,
    borderColor: theme.colors.accentBright,
    backgroundColor: theme.colors.surface2,
  },
  nodeHovered: {
    borderColor: theme.colors.foregroundMuted,
    backgroundColor: theme.colors.surface2,
  },
  nodePressed: {
    opacity: theme.opacity[50],
  },
  nodeRunning: {
    borderColor: theme.colors.accentBright,
  },
  nodeSucceeded: {
    borderColor: theme.colors.statusSuccess,
  },
  nodeFailed: {
    borderColor: theme.colors.statusDanger,
  },
  nodeSkipped: {
    borderStyle: "dashed",
  },
  nodeHeader: {
    minHeight: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  typeIdentity: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  nodeIcon: {
    color: theme.colors.foregroundMuted,
  },
  typeLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: 10,
    textTransform: "uppercase",
  },
  orderText: {
    color: theme.colors.foregroundMuted,
    fontSize: 10,
    fontFamily: theme.fontFamily.mono,
  },
  statusIdentity: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: theme.borderRadius.full,
  },
  statusText: {
    color: theme.colors.foregroundMuted,
    fontSize: 10,
  },
  statusPending: {
    backgroundColor: theme.colors.foregroundMuted,
  },
  statusRunning: {
    backgroundColor: theme.colors.accentBright,
  },
  statusSucceeded: {
    backgroundColor: theme.colors.statusSuccess,
  },
  statusFailed: {
    backgroundColor: theme.colors.statusDanger,
  },
  statusSkipped: {
    backgroundColor: theme.colors.surface4,
  },
  nodeName: {
    minHeight: 28,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 14,
  },
  nodeFooter: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  nodeId: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: 10,
    fontFamily: theme.fontFamily.mono,
  },
  runtimeMeta: {
    maxWidth: 82,
    color: theme.colors.foregroundMuted,
    fontSize: 10,
    fontFamily: theme.fontFamily.mono,
  },
  boundaryNode: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
  },
  boundaryIcon: {
    color: theme.colors.foregroundMuted,
  },
  boundaryText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  inputPort: {
    position: "absolute",
    left: -4,
    top: "50%",
    width: 8,
    height: 8,
    marginTop: -4,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.foregroundMuted,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface0,
  },
  outputPort: {
    position: "absolute",
    right: -4,
    top: "50%",
    width: 8,
    height: 8,
    marginTop: -4,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.foregroundMuted,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface0,
  },
  footerHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
