import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import {
  CheckCircle2,
  Copy,
  MessageSquare,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PluginSummary } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { settingsStyles } from "@/styles/settings";
import {
  DEVELOPMENT_STAGES,
  developmentFlowStatusLabel,
  developmentStageLabel,
  type DevelopmentFlow,
  type DevelopmentStageId,
} from "./flow-model";
import {
  developmentStageCollaborationFromInput,
  type DevelopmentStageCollaboration,
} from "./development-stage-collaboration-model";
import { DevelopmentProjectSettingsStage } from "./development-project-settings-stage";
import { DEVELOPMENT_FLOW_NAVIGATION_STAGES } from "./development-project-settings-stage-model";
import { DevelopmentPrdField } from "./development-prd-field";
import {
  developmentPrdSourceFromInput,
  type DevelopmentPrdSourceValue,
} from "./development-prd-source-model";

interface DevelopmentStage {
  id: DevelopmentStageId;
  label: string;
}

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function stageStatusLabel(status: DevelopmentStageCollaboration["status"]): string {
  if (status === "completed") return "已完成";
  if (status === "in_progress") return "协作中";
  return "待开始";
}

function stageStatusVariant(status: DevelopmentStageCollaboration["status"]): "success" | "muted" {
  return status === "completed" ? "success" : "muted";
}

function DevelopmentStageButton({
  stage,
  index,
  status,
  current,
  selected,
  onSelect,
}: {
  stage: DevelopmentStage;
  index: number;
  status: DevelopmentStageCollaboration["status"];
  current: boolean;
  selected: boolean;
  onSelect: (stage: DevelopmentStageId) => void;
}) {
  const completed = status === "completed";
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
      <View style={styles.stageButtonCopy}>
        <Text style={styles.stageLabel}>{stage.label}</Text>
        <Text style={styles.stageState}>{stageStatusLabel(status)}</Text>
      </View>
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
        const collaboration = developmentStageCollaborationFromInput(flow.job.input, stage.id);
        return (
          <DevelopmentStageButton
            key={stage.id}
            stage={stage}
            index={index}
            status={collaboration.status}
            current={flow.currentStage === stage.id}
            selected={selectedStage === stage.id}
            onSelect={onSelectStage}
          />
        );
      })}
    </View>
  );
}

function StageCollaborationCard({
  flow,
  serverId,
  plugin,
  stageId,
  canMutate,
  onSavePrd,
  onSaveKnowledge,
  onOpenStage,
  onCompleteStage,
  onReopenStage,
}: {
  flow: DevelopmentFlow;
  serverId: string;
  plugin: PluginSummary;
  stageId: DevelopmentStageId;
  canMutate: boolean;
  onSavePrd: (value: DevelopmentPrdSourceValue) => Promise<void>;
  onSaveKnowledge: (stageId: DevelopmentStageId, knowledge: string) => Promise<void>;
  onOpenStage: (
    stageId: DevelopmentStageId,
    knowledge: string,
    prdSource?: DevelopmentPrdSourceValue,
  ) => Promise<void>;
  onCompleteStage: (stageId: DevelopmentStageId, knowledge: string) => Promise<void>;
  onReopenStage: (stageId: DevelopmentStageId, knowledge: string) => Promise<void>;
}) {
  const stage = DEVELOPMENT_STAGES.find((candidate) => candidate.id === stageId);
  const collaboration = developmentStageCollaborationFromInput(flow.job.input, stageId);
  const [knowledge, setKnowledge] = useState(collaboration.knowledge);
  const [prd, setPrd] = useState(() => developmentPrdSourceFromInput(flow.job.input));
  const [action, setAction] = useState<
    "save-prd" | "save-knowledge" | "open" | "complete" | "reopen" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = developmentStageCollaborationFromInput(flow.job.input, stageId);
    setKnowledge(next.knowledge);
    setPrd(developmentPrdSourceFromInput(flow.job.input));
    setError(null);
  }, [flow.id, flow.job.input, stageId]);

  const runAction = useCallback(
    async (
      nextAction: NonNullable<typeof action>,
      operation: () => Promise<void>,
    ): Promise<void> => {
      setAction(nextAction);
      setError(null);
      try {
        await operation();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      } finally {
        setAction(null);
      }
    },
    [],
  );

  const handleSavePrd = useCallback(() => {
    void runAction("save-prd", () => onSavePrd(prd));
  }, [onSavePrd, prd, runAction]);
  const handleSaveKnowledge = useCallback(() => {
    void runAction("save-knowledge", () => onSaveKnowledge(stageId, knowledge));
  }, [knowledge, onSaveKnowledge, runAction, stageId]);
  const handleOpen = useCallback(() => {
    void runAction("open", async () => {
      await onOpenStage(stageId, knowledge, stageId === "prd" ? prd : undefined);
    });
  }, [knowledge, onOpenStage, prd, runAction, stageId]);
  const handleComplete = useCallback(() => {
    void runAction("complete", () => onCompleteStage(stageId, knowledge));
  }, [knowledge, onCompleteStage, runAction, stageId]);
  const handleReopen = useCallback(() => {
    void runAction("reopen", () => onReopenStage(stageId, knowledge));
  }, [knowledge, onReopenStage, runAction, stageId]);

  const busy = action !== null;
  const openLabel = collaboration.agentId ? "继续 Project 会话" : "在 Project 中开始";

  return (
    <View style={[settingsStyles.card, styles.stageDetailCard]}>
      <View style={styles.stageDetailHeader}>
        <View style={styles.stageDetailHeading}>
          <Text style={styles.outputTitle}>{stage?.label ?? stageId}</Text>
          <Text style={styles.hint}>
            插件只保存节点状态和专有知识；实际任务在关联 Project 的 Agent 会话中，由你与 Agent
            共同完成。
          </Text>
        </View>
        <StatusBadge
          label={stageStatusLabel(collaboration.status)}
          variant={stageStatusVariant(collaboration.status)}
        />
      </View>

      {stageId === "prd" ? (
        <View style={styles.prdSection}>
          <DevelopmentPrdField
            active
            serverId={serverId}
            plugin={plugin}
            value={prd}
            onChange={setPrd}
          />
          <View style={styles.inlineActions}>
            <Button
              size="sm"
              variant="outline"
              leftIcon={Save}
              loading={action === "save-prd"}
              disabled={!canMutate || busy}
              onPress={handleSavePrd}
            >
              保存 PRD 配置
            </Button>
          </View>
        </View>
      ) : null}

      <Field
        label="节点知识"
        hint="仅作用于当前节点，用于保存该节点的目标、规则、资源、验收标准和其他专有配置；不会自动变成其他节点或 Project 的公共知识。"
      >
        <FormTextInput
          value={knowledge}
          onChangeText={setKnowledge}
          placeholder="输入当前节点专有的配置和知识"
          multiline
          editable={canMutate && !busy}
          textInputStyle={styles.knowledgeInput}
        />
      </Field>

      {collaboration.agentId ? (
        <View style={styles.sessionInfo}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Agent ID</Text>
            <Text selectable style={styles.infoValue}>
              {collaboration.agentId}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>开始时间</Text>
            <Text style={styles.infoValue}>{formatDate(collaboration.startedAt)}</Text>
          </View>
          {collaboration.completedAt ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>完成时间</Text>
              <Text style={styles.infoValue}>{formatDate(collaboration.completedAt)}</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.hint}>
          尚未创建本节点的 Agent。点击“在 Project 中开始”后，会复用 Project workspace
          并创建专属会话。
        </Text>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.stageActions}>
        <Button
          variant="outline"
          leftIcon={Save}
          loading={action === "save-knowledge"}
          disabled={!canMutate || busy}
          onPress={handleSaveKnowledge}
        >
          保存节点知识
        </Button>
        <Button
          variant="default"
          leftIcon={MessageSquare}
          loading={action === "open"}
          disabled={!flow.projectId || !canMutate || busy}
          onPress={handleOpen}
        >
          {openLabel}
        </Button>
        {collaboration.status === "completed" ? (
          <Button
            variant="outline"
            leftIcon={RotateCcw}
            loading={action === "reopen"}
            disabled={!canMutate || busy}
            onPress={handleReopen}
          >
            重新打开节点
          </Button>
        ) : (
          <Button
            variant="outline"
            leftIcon={CheckCircle2}
            loading={action === "complete"}
            disabled={!canMutate || busy || !collaboration.agentId}
            onPress={handleComplete}
          >
            标记节点完成
          </Button>
        )}
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
  onSaveStageKnowledge,
  onOpenStage,
  onCompleteStage,
  onReopenStage,
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
  onSaveStageKnowledge: (stageId: DevelopmentStageId, knowledge: string) => Promise<void>;
  onOpenStage: (
    stageId: DevelopmentStageId,
    knowledge: string,
    prdSource?: DevelopmentPrdSourceValue,
  ) => Promise<void>;
  onCompleteStage: (stageId: DevelopmentStageId, knowledge: string) => Promise<void>;
  onReopenStage: (stageId: DevelopmentStageId, knowledge: string) => Promise<void>;
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
          <Button variant="outline" leftIcon={Pencil} disabled={!canMutate} onPress={onEdit}>
            编辑
          </Button>
          <Button
            variant="outline"
            leftIcon={Trash2}
            disabled={!canMutate}
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
            前往 Project
          </Button>
        </View>
      </View>
      <Text style={styles.projectChatHint}>
        流程页面只负责节点配置、知识和进度。点击节点后进入对应的 Project Agent
        会话协作，不会在插件页面直接执行整条研发流程。
      </Text>
      <StageProgress
        flow={flow}
        selectedStage={selectedStage}
        onSelectStage={setSelectedStage}
        onOpenProjectSettings={onOpenProjectSettings}
      />
      <StageCollaborationCard
        flow={flow}
        serverId={serverId}
        plugin={plugin}
        stageId={selectedStage}
        canMutate={canMutate}
        onSavePrd={onSavePrd}
        onSaveKnowledge={onSaveStageKnowledge}
        onOpenStage={onOpenStage}
        onCompleteStage={onCompleteStage}
        onReopenStage={onReopenStage}
      />
      <View style={[settingsStyles.card, styles.infoCard]}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>流程状态</Text>
          <StatusBadge label={developmentFlowStatusLabel(flow)} variant="muted" />
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Project ID</Text>
          <Text selectable style={styles.infoValue}>
            {flow.projectId ?? "未关联"}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>流程 ID</Text>
          <Text selectable style={styles.infoValue}>
            {flow.id}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>创建时间</Text>
          <Text style={styles.infoValue}>{formatDate(flow.job.createdAt)}</Text>
        </View>
      </View>
      {flow.job.workflowRunId ? (
        <View style={[settingsStyles.card, styles.legacyCard]}>
          <Text style={styles.outputTitle}>历史 Workflow Run</Text>
          <Text style={styles.hint}>
            该流程由旧版本直接执行过。历史运行记录仍保留，但新节点任务不会再从插件页面直接执行。
          </Text>
          <Text selectable style={styles.codeText}>
            {flow.job.workflowRunId}
          </Text>
        </View>
      ) : null}
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
    minWidth: 100,
    flexGrow: 1,
    flexBasis: 100,
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
  stageButtonCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  stageLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
  stageState: {
    color: theme.colors.foregroundMuted,
    fontSize: 10,
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
  inlineActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  prdSection: {
    gap: theme.spacing[3],
  },
  knowledgeInput: {
    minHeight: 150,
    textAlignVertical: "top",
  },
  sessionInfo: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
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
  legacyCard: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
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
