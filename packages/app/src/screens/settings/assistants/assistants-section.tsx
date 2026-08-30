import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { Assistant, AssistantResourceSelection } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import { SettingsTextAreaCard } from "@/components/settings-textarea";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useAssistants } from "@/hooks/use-assistants";
import { useMcpServers } from "@/hooks/use-mcp-servers";
import { useSkills } from "@/hooks/use-skills";
import { useHostFeature } from "@/runtime/host-features";
import {
  AssistantResourcePaginationControls,
  DEFAULT_ASSISTANT_RESOURCE_PAGE_SIZE,
  paginateAssistantResources,
} from "./assistant-resource-pagination";

interface AssistantsSectionProps {
  serverId: string;
  onCreate: () => void;
  onEdit: (assistant: Assistant) => void;
}

function AssistantsUpgradeCard() {
  return (
    <SettingsSection title="助手">
      <View style={settingsStyles.card} testID="host-page-assistants-upgrade-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>助手功能需要更新主机</Text>
            <Text style={settingsStyles.rowHint}>
              请更新所选主机的 Paseo 服务后再创建和管理助手。
            </Text>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}

function AssistantRow({
  assistant,
  onEdit,
  onDelete,
}: {
  assistant: Assistant;
  onEdit: (assistant: Assistant) => void;
  onDelete: (id: string) => void;
}) {
  const handleEdit = useCallback(() => {
    onEdit(assistant);
  }, [assistant, onEdit]);
  const handleDelete = useCallback(() => {
    onDelete(assistant.id);
  }, [assistant.id, onDelete]);

  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{assistant.name || "未命名助手"}</Text>
        {assistant.description ? (
          <Text style={settingsStyles.rowHint}>{assistant.description}</Text>
        ) : null}
      </View>
      <View style={styles.rowActions}>
        <Button size="sm" variant="outline" onPress={handleEdit}>
          编辑
        </Button>
        <Button size="sm" variant="outline" onPress={handleDelete}>
          删除
        </Button>
      </View>
    </View>
  );
}

function toggleId(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
}

function AssistantResourceOption({
  id,
  name,
  description,
  selected,
  accessibilityLabel,
  onToggle,
}: {
  id: string;
  name: string;
  description?: string;
  selected: boolean;
  accessibilityLabel: string;
  onToggle: (id: string) => void;
}) {
  const handleToggle = useCallback(() => {
    onToggle(id);
  }, [id, onToggle]);

  return (
    <View style={styles.resourceOptionRow}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{name}</Text>
        {description ? <Text style={settingsStyles.rowHint}>{description}</Text> : null}
      </View>
      <Switch
        value={selected}
        onValueChange={handleToggle}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

function AssistantResourceGroup({
  kind,
  title,
  hint,
  countLabel,
  children,
}: {
  kind: "mcp" | "skill";
  title: string;
  hint: string;
  countLabel: string;
  children: ReactNode;
}) {
  const cardStyle = kind === "mcp" ? styles.resourceGroupCardMcp : styles.resourceGroupCardSkill;

  return (
    <View style={cardStyle} testID={`assistant-resource-group-${kind}`}>
      <View style={styles.resourceGroupHeader}>
        <View style={settingsStyles.rowContent}>
          <Text style={styles.resourceGroupTitle}>{title}</Text>
          <Text style={styles.resourceGroupHint}>{hint}</Text>
        </View>
        <Text style={styles.resourceGroupBadge}>{countLabel}</Text>
      </View>
      <View style={styles.resourceOptionsList}>{children}</View>
    </View>
  );
}

function AssistantResourceSelectionEditor({
  mode,
  selectedMcpServerIds,
  selectedSkillIds,
  mcpServers,
  skills,
  onModeChange,
  onToggleMcpServer,
  onToggleSkill,
}: {
  mode: AssistantResourceSelection["mode"];
  selectedMcpServerIds: string[];
  selectedSkillIds: string[];
  mcpServers: Array<{ id: string; name: string; description?: string }>;
  skills: Array<{ id: string; name: string; description?: string }>;
  onModeChange: (mode: AssistantResourceSelection["mode"]) => void;
  onToggleMcpServer: (id: string) => void;
  onToggleSkill: (id: string) => void;
}) {
  const isAllEnabled = mode === "all-enabled";
  const [mcpPage, setMcpPage] = useState(1);
  const [mcpPageSize, setMcpPageSize] = useState(DEFAULT_ASSISTANT_RESOURCE_PAGE_SIZE);
  const [skillPage, setSkillPage] = useState(1);
  const [skillPageSize, setSkillPageSize] = useState(DEFAULT_ASSISTANT_RESOURCE_PAGE_SIZE);
  const selectedMcpIdSet = useMemo(() => new Set(selectedMcpServerIds), [selectedMcpServerIds]);
  const selectedSkillIdSet = useMemo(() => new Set(selectedSkillIds), [selectedSkillIds]);
  const mcpPagination = useMemo(
    () => paginateAssistantResources(mcpServers, mcpPage, mcpPageSize),
    [mcpPage, mcpPageSize, mcpServers],
  );
  const skillPagination = useMemo(
    () => paginateAssistantResources(skills, skillPage, skillPageSize),
    [skillPage, skillPageSize, skills],
  );
  useEffect(() => {
    if (mcpPage !== mcpPagination.page) setMcpPage(mcpPagination.page);
  }, [mcpPage, mcpPagination.page]);
  useEffect(() => {
    if (skillPage !== skillPagination.page) setSkillPage(skillPagination.page);
  }, [skillPage, skillPagination.page]);
  const handleUseAllChange = useCallback(
    (value: boolean) => {
      onModeChange(value ? "all-enabled" : "custom");
    },
    [onModeChange],
  );
  const handleMcpPageSizeChange = useCallback((pageSize: number) => {
    setMcpPageSize(pageSize);
    setMcpPage(1);
  }, []);
  const handleSkillPageSizeChange = useCallback((pageSize: number) => {
    setSkillPageSize(pageSize);
    setSkillPage(1);
  }, []);

  return (
    <View style={styles.resourceCard} testID="assistant-resource-selection">
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>MCP 与 Skills</Text>
          <Text style={settingsStyles.rowHint}>
            默认使用全部已启用的 MCP 服务和技能；也可改为自定义，仅启用指定资源。
          </Text>
        </View>
      </View>
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>使用所有已启用的 MCP 服务和 Skills</Text>
          <Text style={settingsStyles.rowHint}>新会话选择此助手时，将自动使用当前启用的资源。</Text>
        </View>
        <Switch
          value={isAllEnabled}
          onValueChange={handleUseAllChange}
          accessibilityLabel="使用所有已启用的助手资源"
        />
      </View>
      {!isAllEnabled ? (
        <View style={styles.resourceCustomLists}>
          <AssistantResourceGroup
            kind="mcp"
            title="MCP 服务"
            hint="该助手在新会话中可以调用的外部工具。"
            countLabel={`已选择 ${
              mcpServers.filter((server) => selectedMcpIdSet.has(server.id)).length
            }/${mcpServers.length}`}
          >
            {mcpServers.length > 0 ? (
              <>
                {mcpPagination.items.map((server) => (
                  <AssistantResourceOption
                    key={server.id}
                    id={server.id}
                    name={server.name}
                    description={server.description}
                    selected={selectedMcpIdSet.has(server.id)}
                    accessibilityLabel={`Enable MCP ${server.name} for assistant`}
                    onToggle={onToggleMcpServer}
                  />
                ))}
                {mcpServers.length > DEFAULT_ASSISTANT_RESOURCE_PAGE_SIZE ? (
                  <AssistantResourcePaginationControls
                    pagination={mcpPagination}
                    onPageChange={setMcpPage}
                    onPageSizeChange={handleMcpPageSizeChange}
                  />
                ) : null}
              </>
            ) : (
              <Text style={settingsStyles.rowHint}>没有已启用的 MCP 服务。</Text>
            )}
          </AssistantResourceGroup>
          <AssistantResourceGroup
            kind="skill"
            title="技能"
            hint="注入给该助手的指令包。"
            countLabel={`已选择 ${
              skills.filter((skill) => selectedSkillIdSet.has(skill.id)).length
            }/${skills.length}`}
          >
            {skills.length > 0 ? (
              <>
                {skillPagination.items.map((skill) => (
                  <AssistantResourceOption
                    key={skill.id}
                    id={skill.id}
                    name={skill.name}
                    description={skill.description}
                    selected={selectedSkillIdSet.has(skill.id)}
                    accessibilityLabel={`Enable skill ${skill.name} for assistant`}
                    onToggle={onToggleSkill}
                  />
                ))}
                {skills.length > DEFAULT_ASSISTANT_RESOURCE_PAGE_SIZE ? (
                  <AssistantResourcePaginationControls
                    pagination={skillPagination}
                    onPageChange={setSkillPage}
                    onPageSizeChange={handleSkillPageSizeChange}
                  />
                ) : null}
              </>
            ) : (
              <Text style={settingsStyles.rowHint}>没有已启用的 Skill。</Text>
            )}
          </AssistantResourceGroup>
        </View>
      ) : null}
    </View>
  );
}

function formatCharCount(charCount: number): string {
  return `${charCount.toLocaleString()} 字符`;
}

function AssistantMemorySummaryBody({
  memorySummary,
  summary,
  summaryPath,
  isEditing,
  emptyFilesMessage,
  onMemorySummaryChange,
}: {
  memorySummary: string;
  summary: string;
  summaryPath: string;
  isEditing: boolean;
  emptyFilesMessage: string;
  onMemorySummaryChange: (value: string) => void;
}) {
  if (isEditing && (summary || summaryPath)) {
    return (
      <SettingsTextAreaCard
        value={memorySummary}
        onChangeText={onMemorySummaryChange}
        placeholder="编辑首次 Agent 提示词中提供的记忆总览。"
        accessibilityLabel="记忆总文件内容"
        style={styles.memoryArtifactEditor}
      />
    );
  }

  if (summary) {
    return (
      <View style={styles.memoryPreviewCard}>
        <Text selectable style={styles.memoryPreviewText}>
          {summary}
        </Text>
      </View>
    );
  }

  return <Text style={styles.memoryArtifactEmpty}>{emptyFilesMessage}</Text>;
}

function AssistantMemoryDetailFile({
  file,
  isEditing,
  onContentChange,
}: {
  file: NonNullable<Assistant["memoryFiles"]>["detailFiles"][number];
  isEditing: boolean;
  onContentChange: (id: string, value: string) => void;
}) {
  const content = (file.content ?? "").trim();
  const handleContentChange = useCallback(
    (value: string) => {
      onContentChange(file.id, value);
    },
    [file.id, onContentChange],
  );

  let body: ReactNode = null;
  if (isEditing) {
    body = (
      <SettingsTextAreaCard
        value={file.content ?? ""}
        onChangeText={handleContentChange}
        placeholder="编辑该记忆子文件。"
        accessibilityLabel={`Memory detail file ${file.id} content`}
        style={styles.memoryDetailEditor}
      />
    );
  } else if (content) {
    body = (
      <View style={styles.detailPreviewCard}>
        <Text selectable numberOfLines={10} style={styles.memoryPreviewText}>
          {content}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.detailFileCard}>
      <View style={styles.detailFileHeader}>
        <Text numberOfLines={1} style={styles.detailFileTitle}>
          {file.title || file.id}
        </Text>
        <Text style={styles.detailFileMeta}>
          {file.id} · {formatCharCount(file.charCount)}
        </Text>
      </View>
      <Text selectable numberOfLines={2} style={styles.memoryArtifactPath}>
        {file.path}
      </Text>
      {body}
    </View>
  );
}

export function AssistantMemoryArtifacts({
  memorySummary,
  memoryFiles,
  isEditing,
  onMemorySummaryChange,
  onDetailFileContentChange,
}: {
  memorySummary: string;
  memoryFiles: Assistant["memoryFiles"] | null;
  isEditing: boolean;
  onMemorySummaryChange: (value: string) => void;
  onDetailFileContentChange: (id: string, value: string) => void;
}) {
  const summary = memorySummary.trim();
  const summaryPath = (memoryFiles?.summaryPath ?? "").trim();
  const detailFiles = memoryFiles?.detailFiles ?? [];
  const emptyFilesMessage = isEditing
    ? "保存此助手后将生成总记忆和子记忆文件。"
    : "保存助手后会显示总记忆和子记忆文件。";

  return (
    <View style={styles.memoryArtifacts} testID="assistant-memory-artifacts">
      <View style={styles.memoryArtifactCard} testID="assistant-memory-summary-file">
        <View style={styles.memoryArtifactHeader}>
          <View style={styles.memoryArtifactTitleBlock}>
            <Text style={styles.memoryArtifactTitle}>记忆总文件</Text>
            <Text style={styles.memoryArtifactHint}>
              首次调用智能体时提供总览，详细记忆保存在子文件中。
            </Text>
          </View>
          <Text style={styles.memoryArtifactBadge}>{summary ? "已生成" : "待生成"}</Text>
        </View>
        {summaryPath ? (
          <Text selectable numberOfLines={2} style={styles.memoryArtifactPath}>
            {summaryPath}
          </Text>
        ) : (
          <Text style={styles.memoryArtifactEmpty}>尚无记忆总文件。</Text>
        )}
        <AssistantMemorySummaryBody
          memorySummary={memorySummary}
          summary={summary}
          summaryPath={summaryPath}
          isEditing={isEditing}
          emptyFilesMessage={emptyFilesMessage}
          onMemorySummaryChange={onMemorySummaryChange}
        />
      </View>

      <View style={styles.memoryArtifactCard} testID="assistant-memory-detail-files">
        <View style={styles.memoryArtifactHeader}>
          <View style={styles.memoryArtifactTitleBlock}>
            <Text style={styles.memoryArtifactTitle}>记忆子文件</Text>
            <Text style={styles.memoryArtifactHint}>
              智能体可根据任务需要按需读取对应的记忆子文件。
            </Text>
          </View>
          <Text style={styles.memoryArtifactBadge}>{detailFiles.length} 个文件</Text>
        </View>
        {detailFiles.length > 0 ? (
          <View style={styles.detailFilesList}>
            {detailFiles.map((file) => (
              <AssistantMemoryDetailFile
                key={`${file.id}-${file.path}`}
                file={file}
                isEditing={isEditing}
                onContentChange={onDetailFileContentChange}
              />
            ))}
          </View>
        ) : (
          <Text style={styles.memoryArtifactEmpty}>{emptyFilesMessage}</Text>
        )}
      </View>
    </View>
  );
}

export function AssistantEditorPage({
  serverId,
  assistantId,
  onDone,
  onOpenMemory,
}: {
  serverId: string;
  assistantId?: string;
  onDone: () => void;
  onOpenMemory?: (assistantId: string) => void;
}) {
  const supportsAssistants = useHostFeature(serverId, "assistants");
  const assistants = useAssistants(serverId, { enabled: supportsAssistants });
  const mcpCatalog = useMcpServers(serverId, { enabled: supportsAssistants });
  const skillCatalog = useSkills(serverId, { enabled: supportsAssistants });
  const activeMcpServers = useMemo(
    () => mcpCatalog.servers.filter((server) => server.enabled),
    [mcpCatalog.servers],
  );
  const activeSkills = useMemo(
    () => skillCatalog.skills.filter((skill) => skill.enabled && Boolean(skill.content?.trim())),
    [skillCatalog.skills],
  );
  const activeMcpServerIds = useMemo(
    () => activeMcpServers.map((server) => server.id),
    [activeMcpServers],
  );
  const activeSkillIds = useMemo(() => activeSkills.map((skill) => skill.id), [activeSkills]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [memory, setMemory] = useState("");
  const [resourceSelectionMode, setResourceSelectionMode] =
    useState<AssistantResourceSelection["mode"]>("all-enabled");
  const [selectedMcpServerIds, setSelectedMcpServerIds] = useState<string[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [editingAssistantId, setEditingAssistantId] = useState<string | null>(null);
  const [formResetKey, bumpFormResetKey] = useReducer((key: number) => key + 1, 0);
  const initializedAssistantIdRef = useRef<string | null>(null);

  const handleEdit = useCallback((assistant: Assistant) => {
    setEditingAssistantId(assistant.id);
    setName(assistant.name);
    setDescription(assistant.description);
    setPrompt(assistant.prompt);
    setMemoryEnabled(assistant.memoryEnabled);
    setMemory("");
    setResourceSelectionMode(assistant.resourceSelection.mode);
    setSelectedMcpServerIds(assistant.resourceSelection.selectedMcpServerIds);
    setSelectedSkillIds(assistant.resourceSelection.selectedSkillIds);
    bumpFormResetKey();
  }, []);
  const editingAssistant = useMemo(
    () =>
      assistantId
        ? (assistants.assistants.find((assistant) => assistant.id === assistantId) ?? null)
        : null,
    [assistantId, assistants.assistants],
  );
  useEffect(() => {
    if (!editingAssistant || initializedAssistantIdRef.current === editingAssistant.id) return;
    initializedAssistantIdRef.current = editingAssistant.id;
    handleEdit(editingAssistant);
  }, [editingAssistant, handleEdit]);

  const handleResourceSelectionModeChange = useCallback(
    (nextMode: AssistantResourceSelection["mode"]) => {
      setResourceSelectionMode(nextMode);
      if (nextMode === "custom") {
        setSelectedMcpServerIds((current) => (current.length > 0 ? current : activeMcpServerIds));
        setSelectedSkillIds((current) => (current.length > 0 ? current : activeSkillIds));
      }
    },
    [activeMcpServerIds, activeSkillIds],
  );

  const handleToggleMcpServer = useCallback((id: string) => {
    setSelectedMcpServerIds((current) => toggleId(current, id));
  }, []);

  const handleToggleSkill = useCallback((id: string) => {
    setSelectedSkillIds((current) => toggleId(current, id));
  }, []);

  const assistantResourceSelection = useMemo<AssistantResourceSelection>(
    () => ({
      mode: resourceSelectionMode,
      selectedMcpServerIds: resourceSelectionMode === "custom" ? selectedMcpServerIds : [],
      selectedSkillIds: resourceSelectionMode === "custom" ? selectedSkillIds : [],
    }),
    [resourceSelectionMode, selectedMcpServerIds, selectedSkillIds],
  );

  const handleSaveAssistant = useCallback(async () => {
    if (editingAssistantId) {
      await assistants.updateAssistant({
        id: editingAssistantId,
        name,
        description,
        prompt,
        resourceSelection: assistantResourceSelection,
      });
      onDone();
    } else {
      await assistants.createAssistant({
        name,
        description,
        prompt,
        memoryEnabled,
        memory,
        resourceSelection: assistantResourceSelection,
      });
      onDone();
    }
  }, [
    assistantResourceSelection,
    assistants,
    description,
    editingAssistantId,
    memory,
    memoryEnabled,
    name,
    onDone,
    prompt,
  ]);

  const canCreate = prompt.trim().length > 0;
  const isEditingAssistant = Boolean(editingAssistantId);
  const sourceMemoryLabel = isEditingAssistant ? "追加源记忆" : "源记忆";
  const sourceMemoryHint = isEditingAssistant
    ? "仅在此追加新记忆；现有记忆会保留，并展示在下方总文件和子文件中。"
    : "使用 Markdown 保存稳定偏好和上下文；保存后会拆分为总文件和子文件。";
  const sourceMemoryPlaceholder = isEditingAssistant
    ? "填写要追加的新记忆；留空则保持现有记忆不变。"
    : "使用 Markdown 保存稳定的偏好和上下文。";
  const handleOpenMemory = useCallback(() => {
    if (editingAssistantId) onOpenMemory?.(editingAssistantId);
  }, [editingAssistantId, onOpenMemory]);

  if (!supportsAssistants) {
    return <AssistantsUpgradeCard />;
  }
  if (assistantId && assistants.isLoading) {
    return <Text style={settingsStyles.rowHint}>正在加载助手…</Text>;
  }
  if (assistantId && !editingAssistant) {
    return (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>找不到要编辑的助手。</Text>
        </View>
      </View>
    );
  }

  return (
    <View testID="assistant-editor-page">
      <SettingsSection title={assistantId ? "编辑助手" : "创建助手"}>
        <View style={styles.formCard}>
          <Field label="名称" testID="assistant-name-field">
            <FormTextInput
              initialValue={name}
              resetKey={`assistant-name-${formResetKey}`}
              onChangeText={setName}
              placeholder="代码审查助手"
            />
          </Field>
          <Field label="描述" testID="assistant-description-field">
            <FormTextInput
              initialValue={description}
              resetKey={`assistant-description-${formResetKey}`}
              onChangeText={setDescription}
              placeholder="审查代码并提出修复建议"
            />
          </Field>
          <Field label="助手提示词" testID="assistant-prompt-field">
            <SettingsTextAreaCard
              value={prompt}
              onChangeText={setPrompt}
              placeholder="使用 Markdown 描述该助手的行为规范。"
              accessibilityLabel="助手提示词"
              style={styles.promptInput}
            />
          </Field>
          <AssistantResourceSelectionEditor
            mode={resourceSelectionMode}
            selectedMcpServerIds={selectedMcpServerIds}
            selectedSkillIds={selectedSkillIds}
            mcpServers={activeMcpServers}
            skills={activeSkills}
            onModeChange={handleResourceSelectionModeChange}
            onToggleMcpServer={handleToggleMcpServer}
            onToggleSkill={handleToggleSkill}
          />
          {isEditingAssistant && editingAssistant ? (
            <View style={styles.memoryEntryCard} testID="assistant-memory-entry">
              <View style={settingsStyles.rowContent}>
                <Text style={settingsStyles.rowTitle}>助手记忆</Text>
                <Text style={settingsStyles.rowHint}>
                  {editingAssistant.memoryEnabled ? "已启用" : "未启用"} ·{" "}
                  {editingAssistant.memoryFiles.detailFiles.length} 个记忆子文件
                </Text>
                {editingAssistant.memoryFiles.summaryPath ? (
                  <Text selectable numberOfLines={2} style={styles.memoryArtifactPath}>
                    {editingAssistant.memoryFiles.summaryPath}
                  </Text>
                ) : null}
              </View>
              <Button
                size="sm"
                variant="outline"
                onPress={handleOpenMemory}
                disabled={!onOpenMemory}
              >
                配置记忆
              </Button>
            </View>
          ) : (
            <>
              <View style={settingsStyles.row}>
                <View style={settingsStyles.rowContent}>
                  <Text style={settingsStyles.rowTitle}>记忆</Text>
                  <Text style={settingsStyles.rowHint}>
                    记忆按总文件和子文件保存，首次消息仅提供总览。
                  </Text>
                </View>
                <Switch
                  value={memoryEnabled}
                  onValueChange={setMemoryEnabled}
                  accessibilityLabel="启用助手记忆"
                />
              </View>
              {memoryEnabled ? (
                <Field
                  label={sourceMemoryLabel}
                  hint={sourceMemoryHint}
                  testID="assistant-memory-field"
                >
                  <SettingsTextAreaCard
                    value={memory}
                    onChangeText={setMemory}
                    placeholder={sourceMemoryPlaceholder}
                    accessibilityLabel="助手记忆"
                    style={styles.memoryInput}
                  />
                </Field>
              ) : null}
            </>
          )}
          {assistants.mutationError ? (
            <Text style={settingsStyles.rowError}>{assistants.mutationError.message}</Text>
          ) : null}
          <View style={styles.actionsRow}>
            <Button
              variant="default"
              onPress={handleSaveAssistant}
              disabled={!canCreate || !assistants.isConnected}
              loading={assistants.isMutating}
            >
              {editingAssistantId ? "保存更改" : "添加助手"}
            </Button>
            <Button variant="outline" onPress={onDone} disabled={assistants.isMutating}>
              取消
            </Button>
          </View>
        </View>
      </SettingsSection>
    </View>
  );
}

export function AssistantsSection({ serverId, onCreate, onEdit }: AssistantsSectionProps) {
  const supportsAssistants = useHostFeature(serverId, "assistants");
  const assistants = useAssistants(serverId, { enabled: supportsAssistants });
  const handleDelete = useCallback(
    (id: string) => {
      void assistants.deleteAssistant(id);
    },
    [assistants],
  );
  const createAction = useMemo(
    () => (
      <Button size="sm" variant="default" onPress={onCreate}>
        创建助手
      </Button>
    ),
    [onCreate],
  );

  if (!supportsAssistants) return <AssistantsUpgradeCard />;

  return (
    <View>
      <SettingsSection title="助手" trailing={createAction}>
        <View style={settingsStyles.card} testID="host-page-assistants">
          {assistants.assistants.length > 0 ? (
            assistants.assistants.map((assistant) => (
              <AssistantRow
                key={assistant.id}
                assistant={assistant}
                onEdit={onEdit}
                onDelete={handleDelete}
              />
            ))
          ) : (
            <View style={settingsStyles.row}>
              <Text style={settingsStyles.rowHint}>暂无助手。点击“创建助手”开始配置。</Text>
            </View>
          )}
        </View>
        {assistants.error ? (
          <Text style={settingsStyles.rowError}>{assistants.error.message}</Text>
        ) : null}
      </SettingsSection>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  formCard: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  rowActions: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  resourceCard: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  resourceCustomLists: {
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[4],
    gap: theme.spacing[3],
  },
  resourceGroupCardMcp: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.accent,
    padding: theme.spacing[3],
    gap: theme.spacing[3],
  },
  resourceGroupCardSkill: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.accentBright,
    padding: theme.spacing[3],
    gap: theme.spacing[3],
  },
  resourceGroupHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  resourceGroupTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  resourceGroupHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.4),
    marginTop: theme.spacing[1],
  },
  resourceGroupBadge: {
    color: theme.colors.foregroundMuted,
    backgroundColor: theme.colors.surface3,
    borderRadius: theme.borderRadius.full,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    overflow: "hidden",
  },
  resourceOptionsList: {
    gap: theme.spacing[2],
  },
  resourceOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  promptInput: {
    minHeight: 140,
  },
  memoryInput: {
    minHeight: 120,
  },
  memoryEntryCard: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[3],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  memoryArtifacts: {
    gap: theme.spacing[3],
  },
  memoryArtifactCard: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[3],
    gap: theme.spacing[3],
  },
  memoryArtifactHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  memoryArtifactTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  memoryArtifactTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  memoryArtifactHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.4),
    marginTop: theme.spacing[1],
  },
  memoryArtifactBadge: {
    color: theme.colors.foregroundMuted,
    backgroundColor: theme.colors.surface3,
    borderRadius: theme.borderRadius.full,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    overflow: "hidden",
  },
  memoryArtifactPath: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.4),
  },
  memoryArtifactEmpty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.4),
  },
  memoryPreviewCard: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
  },
  memoryPreviewText: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.5),
  },
  memoryArtifactEditor: {
    minHeight: 180,
  },
  memoryDetailEditor: {
    minHeight: 220,
  },
  detailFilesList: {
    gap: theme.spacing[3],
  },
  detailFileCard: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
  },
  detailFileHeader: {
    gap: theme.spacing[1],
  },
  detailFileTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  detailFileMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  detailPreviewCard: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
}));
