import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { Copy, MessageSquare, Pencil, Play, Save, Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PluginSummary } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { settingsStyles } from "@/styles/settings";
import {
  DEVELOPMENT_STAGES,
  developmentJobIsActive,
  developmentJobStatusLabel,
  developmentStageLabel,
  type DevelopmentFlow,
  type DevelopmentStageId,
} from "./flow-model";
import {
  developmentStageStatusLabel,
  parseWorkflowPayload,
  resolveDevelopmentStageDetail,
} from "./stage-detail-model";
import { DevelopmentProjectSettingsStage } from "./development-project-settings-stage";
import { DEVELOPMENT_FLOW_NAVIGATION_STAGES } from "./development-project-settings-stage-model";
import { DevelopmentPrdField } from "./development-prd-field";
import {
  developmentPrdSourceFromInput,
  type DevelopmentPrdSourceValue,
} from "./development-prd-source-model";
import { useDevelopmentRun } from "./use-development-run";

interface DevelopmentStage {
  id: DevelopmentStageId;
  label: string;
}
type StageDetailModel = ReturnType<typeof resolveDevelopmentStageDetail>;
type StageNodeRun = NonNullable<StageDetailModel["latestRun"]>;

function prettyJson(value: unknown): string {
  if (value === undefined || value === null) return "暂无数据";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function statusVariant(status: DevelopmentFlow["job"]["status"]): "success" | "error" | "muted" {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "timed_out") return "error";
  return "muted";
}

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function nodeStatusVariant(
  status: StageNodeRun["status"] | undefined,
): "success" | "error" | "muted" {
  if (status === "succeeded") return "success";
  if (status === "failed" || status === "timed_out") return "error";
  return "muted";
}

function stageQueryMessage({
  detail,
  error,
  loading,
}: {
  detail: StageDetailModel;
  error: unknown;
  loading: boolean;
}): string {
  if (loading) return "正在读取节点运行信息…";
  if (error instanceof Error) return error.message;
  return developmentStageStatusLabel(detail);
}

function DevelopmentStageButton({
  stage,
  index,
  completed,
  current,
  selected,
  onSelect,
}: {
  stage: DevelopmentStage;
  index: number;
  completed: boolean;
  current: boolean;
  selected: boolean;
  onSelect: (stage: DevelopmentStageId) => void;
}) {
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const handlePress = useCallback(() => onSelect(stage.id), [onSelect, stage.id]);
  const itemStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.stageItem,
      completed && styles.stageItemCompleted,
      current && styles.stageItemCurrent,
      selected && styles.stageItemSelected,
      (hovered || pressed) && styles.stageItemHovered,
    ],
    [completed, current, selected],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={itemStyle}
      testID={`development-stage-${stage.id}`}
    >
      <Text style={[styles.stageIndex, (completed || current) && styles.stageIndexHighlighted]}>
        {index + 1}
      </Text>
      <Text style={styles.stageLabel}>{stage.label}</Text>
    </Pressable>
  );
}

function StageProgress({
  flow,
  selectedStage,
  onSelectStage,
  onOpenProjectSettings,
}: {
  flow: DevelopmentFlow;
  selectedStage: DevelopmentStageId;
  onSelectStage: (stage: DevelopmentStageId) => void;
  onOpenProjectSettings: () => void;
}) {
  const selectedIndex = DEVELOPMENT_STAGES.findIndex((stage) => stage.id === flow.currentStage);
  return (
    <View style={styles.stageGrid}>
      {DEVELOPMENT_FLOW_NAVIGATION_STAGES.map((stage, index) => {
        if (stage.kind === "project_settings") {
          return (
            <DevelopmentProjectSettingsStage
              key={stage.id}
              disabled={!flow.projectId}
              onPress={onOpenProjectSettings}
            />
          );
        }
        const workflowIndex = index - 1;
        const completed = flow.job.status === "succeeded" || workflowIndex < selectedIndex;
        const current = workflowIndex === selectedIndex && flow.job.status !== "succeeded";
        const selected = selectedStage === stage.id;
        return (
          <DevelopmentStageButton
            key={stage.id}
            stage={stage}
            index={index}
            completed={completed}
            current={current}
            selected={selected}
            onSelect={onSelectStage}
          />
        );
      })}
    </View>
  );
}

function NodeRunMetadata({ nodeRun }: { nodeRun: StageNodeRun }) {
  return (
    <View style={styles.infoGrid}>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>节点 ID</Text>
        <Text selectable style={styles.infoValue}>
          {nodeRun.stepId}
        </Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>开始时间</Text>
        <Text style={styles.infoValue}>{formatDate(nodeRun.startedAt)}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>结束时间</Text>
        <Text style={styles.infoValue}>{formatDate(nodeRun.endedAt)}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>执行次数</Text>
        <Text style={styles.infoValue}>
          {nodeRun.attempt} / {nodeRun.maxAttempts}
        </Text>
      </View>
      {nodeRun.agentId ? (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Agent ID</Text>
          <Text selectable style={styles.infoValue}>
            {nodeRun.agentId}
          </Text>
        </View>
      ) : null}
      {nodeRun.exitCode !== undefined ? (
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>退出码</Text>
          <Text style={styles.infoValue}>{nodeRun.exitCode ?? "—"}</Text>
        </View>
      ) : null}
    </View>
  );
}

function NodeRunPayloads({ nodeRun }: { nodeRun: StageNodeRun }) {
  const output =
    parseWorkflowPayload(nodeRun.outputPayload) ?? nodeRun.agentResponse ?? nodeRun.output;
  return (
    <View style={styles.payloadGrid}>
      <View style={styles.payloadBlock}>
        <Text style={styles.outputTitle}>节点输入</Text>
        <Text selectable style={styles.codeText}>
          {prettyJson(parseWorkflowPayload(nodeRun.inputPayload))}
        </Text>
      </View>
      <View style={styles.payloadBlock}>
        <Text style={styles.outputTitle}>节点输出</Text>
        <Text selectable style={styles.codeText}>
          {prettyJson(output)}
        </Text>
      </View>
    </View>
  );
}

function NodeRunDetail({ nodeRun }: { nodeRun: StageNodeRun }) {
  return (
    <>
      <NodeRunMetadata nodeRun={nodeRun} />
      {nodeRun.error ? (
        <View style={styles.errorBlock}>
          <Text style={styles.outputTitle}>节点错误</Text>
          <Text selectable style={styles.errorText}>
            {nodeRun.error}
          </Text>
        </View>
      ) : null}
      <NodeRunPayloads nodeRun={nodeRun} />
    </>
  );
}

function StageDetail({
  flow,
  serverId,
  stageId,
}: {
  flow: DevelopmentFlow;
  serverId: string;
  stageId: DevelopmentStageId;
}) {
  const query = useDevelopmentRun({
    active: true,
    serverId,
    runId: flow.job.workflowRunId,
  });
  const detail = useMemo(
    () => resolveDevelopmentStageDetail(query.data ?? null, stageId),
    [query.data, stageId],
  );
  const nodeRun = detail.latestRun;
  const stage = DEVELOPMENT_STAGES.find((candidate) => candidate.id === stageId);
  const queryMessage = stageQueryMessage({
    detail,
    error: query.error,
    loading: query.isLoading,
  });
  const emptyMessage = flow.job.workflowRunId
    ? "该阶段还没有节点运行记录。"
    : "当前流程没有 Workflow Run。";

  return (
    <View style={[settingsStyles.card, styles.stageDetailCard]}>
      <View style={styles.stageDetailHeader}>
        <View style={styles.stageDetailHeading}>
          <Text style={styles.outputTitle}>
            {stage?.label ?? stageId}
            {nodeRun?.stepName ? ` · ${nodeRun.stepName}` : ""}
          </Text>
          <Text style={styles.hint}>{queryMessage}</Text>
        </View>
        <StatusBadge
          label={developmentStageStatusLabel(detail)}
          variant={nodeStatusVariant(nodeRun?.status)}
        />
      </View>
      {nodeRun ? (
        <NodeRunDetail nodeRun={nodeRun} />
      ) : (
        <Text style={styles.hint}>{emptyMessage}</Text>
      )}
    </View>
  );
}

function DraftPrdStage({
  flow,
  serverId,
  plugin,
  onSave,
  onStart,
}: {
  flow: DevelopmentFlow;
  serverId: string;
  plugin: PluginSummary;
  onSave: (value: DevelopmentPrdSourceValue) => Promise<void>;
  onStart: (value: DevelopmentPrdSourceValue) => Promise<void>;
}) {
  const [value, setValue] = useState(() => developmentPrdSourceFromInput(flow.job.input));
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(developmentPrdSourceFromInput(flow.job.input));
    setError(null);
  }, [flow.id, flow.job.input]);

  const handleSave = useCallback(() => {
    setSaving(true);
    setError(null);
    void onSave(value)
      .catch((nextError: unknown) => {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => setSaving(false));
  }, [onSave, value]);

  const handleStart = useCallback(() => {
    setStarting(true);
    setError(null);
    void onStart(value)
      .catch((nextError: unknown) => {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => setStarting(false));
  }, [onStart, value]);

  return (
    <View style={[settingsStyles.card, styles.stageDetailCard]}>
      <View style={styles.stageDetailHeading}>
        <Text style={styles.outputTitle}>PRD / 需求说明</Text>
        <Text style={styles.hint}>
          直接输入需求或从 Meego 获取。保存后仍可继续修改；确认内容后再启动研发流程。
        </Text>
      </View>
      <DevelopmentPrdField
        active
        serverId={serverId}
        plugin={plugin}
        value={value}
        onChange={setValue}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.stageActions}>
        <Button
          variant="outline"
          leftIcon={Save}
          loading={saving}
          disabled={starting}
          onPress={handleSave}
        >
          保存 PRD
        </Button>
        <Button
          variant="default"
          leftIcon={Play}
          loading={starting}
          disabled={saving || !value.prd.trim()}
          onPress={handleStart}
        >
          启动研发流程
        </Button>
      </View>
    </View>
  );
}

export function DevelopmentFlowDetail({
  flow,
  projectName,
  serverId,
  plugin,
  canMutate,
  canCopy,
  copying,
  deleting,
  onOpenProject,
  onOpenProjectSettings,
  onSavePrd,
  onStartFlow,
  onCopy,
  onEdit,
  onDelete,
}: {
  flow: DevelopmentFlow;
  projectName: string;
  serverId: string;
  plugin: PluginSummary;
  canMutate: boolean;
  canCopy: boolean;
  copying: boolean;
  deleting: boolean;
  onOpenProject: () => void;
  onOpenProjectSettings: () => void;
  onSavePrd: (value: DevelopmentPrdSourceValue) => Promise<void>;
  onStartFlow: (value: DevelopmentPrdSourceValue) => Promise<void>;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [selectedStage, setSelectedStage] = useState<DevelopmentStageId>(
    flow.currentStage ?? "prd",
  );
  useEffect(() => {
    setSelectedStage(flow.currentStage ?? "prd");
  }, [flow.currentStage, flow.id]);
  const active = developmentJobIsActive(flow.job);
  const handleStageSelect = useCallback((stage: DevelopmentStageId) => {
    setSelectedStage(stage);
  }, []);

  return (
    <View style={styles.detail}>
      <View style={styles.detailHeader}>
        <View style={styles.detailHeading}>
          <Text style={styles.detailTitle}>{flow.title}</Text>
          <Text style={styles.detailSubtitle}>
            {projectName} · {developmentStageLabel(flow.currentStage)}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Button
            variant="outline"
            leftIcon={Copy}
            disabled={!canCopy || copying}
            loading={copying}
            onPress={onCopy}
          >
            复制
          </Button>
          <Button
            variant="outline"
            leftIcon={Pencil}
            disabled={active || !canMutate}
            onPress={onEdit}
          >
            编辑
          </Button>
          <Button
            variant="outline"
            leftIcon={Trash2}
            disabled={active || !canMutate}
            loading={deleting}
            onPress={onDelete}
          >
            删除
          </Button>
          <Button
            variant="outline"
            leftIcon={MessageSquare}
            disabled={!flow.projectId}
            onPress={onOpenProject}
          >
            在 Project 中对话
          </Button>
        </View>
      </View>
      <Text style={styles.projectChatHint}>
        点击 Project 设置可配置项目上下文；点击流程阶段可查看节点状态、输入、输出和执行时间。
      </Text>
      <StageProgress
        flow={flow}
        selectedStage={selectedStage}
        onSelectStage={handleStageSelect}
        onOpenProjectSettings={onOpenProjectSettings}
      />
      {flow.job.status === "draft" && selectedStage === "prd" ? (
        <DraftPrdStage
          flow={flow}
          serverId={serverId}
          plugin={plugin}
          onSave={onSavePrd}
          onStart={onStartFlow}
        />
      ) : (
        <StageDetail flow={flow} serverId={serverId} stageId={selectedStage} />
      )}
      <View style={[settingsStyles.card, styles.infoCard]}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>状态</Text>
          <StatusBadge
            label={developmentJobStatusLabel(flow.job.status)}
            variant={statusVariant(flow.job.status)}
          />
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Project ID</Text>
          <Text selectable style={styles.infoValue}>
            {flow.projectId ?? "未关联"}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Process ID</Text>
          <Text selectable style={styles.infoValue}>
            {flow.id}
          </Text>
        </View>
        {flow.job.workflowRunId ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Workflow Run ID</Text>
            <Text selectable style={styles.infoValue}>
              {flow.job.workflowRunId}
            </Text>
          </View>
        ) : null}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>创建时间</Text>
          <Text style={styles.infoValue}>{formatDate(flow.job.createdAt)}</Text>
        </View>
      </View>
      {flow.job.error ? (
        <View style={[settingsStyles.card, styles.errorCard]}>
          <Text style={styles.outputTitle}>错误信息</Text>
          <Text selectable style={styles.errorText}>
            {flow.job.error}
          </Text>
        </View>
      ) : null}
      <View style={[settingsStyles.card, styles.outputCard]}>
        <Text style={styles.outputTitle}>流程配置</Text>
        <Text selectable style={styles.codeText}>
          {prettyJson(flow.job.input)}
        </Text>
      </View>
      <View style={[settingsStyles.card, styles.outputCard]}>
        <Text style={styles.outputTitle}>最终输出</Text>
        <Text selectable style={styles.codeText}>
          {prettyJson(flow.job.result)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  detail: {
    gap: theme.spacing[4],
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  detailHeading: {
    flex: 1,
    minWidth: 260,
    gap: theme.spacing[1],
  },
  detailTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
  },
  detailSubtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  projectChatHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  stageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  stageItem: {
    minWidth: 86,
    flexGrow: 1,
    flexBasis: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
  },
  stageItemHovered: {
    backgroundColor: theme.colors.surface2,
  },
  stageItemCompleted: {
    borderColor: `${theme.colors.statusSuccess}55`,
    backgroundColor: `${theme.colors.statusSuccess}12`,
  },
  stageItemCurrent: {
    borderColor: theme.colors.accent,
  },
  stageItemSelected: {
    borderWidth: theme.borderWidth[2],
    borderColor: theme.colors.accent,
  },
  stageIndex: {
    width: 20,
    height: 20,
    textAlign: "center",
    lineHeight: 20,
    borderRadius: theme.borderRadius.full,
    color: theme.colors.foregroundMuted,
    backgroundColor: theme.colors.surface3,
    fontSize: theme.fontSize.xs,
  },
  stageIndexHighlighted: {
    color: theme.colors.accentForeground,
    backgroundColor: theme.colors.accent,
  },
  stageLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
  stageDetailCard: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  stageDetailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  stageDetailHeading: {
    flex: 1,
    gap: theme.spacing[1],
  },
  stageActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  infoGrid: {
    gap: theme.spacing[2],
  },
  infoCard: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[4],
  },
  infoLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  infoValue: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    textAlign: "right",
  },
  payloadGrid: {
    gap: theme.spacing[3],
  },
  payloadBlock: {
    gap: theme.spacing[2],
  },
  outputCard: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  errorCard: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
    borderColor: theme.colors.statusDanger,
  },
  errorBlock: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: `${theme.colors.statusDanger}10`,
  },
  outputTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  codeText: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  errorText: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
}));
