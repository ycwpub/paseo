import { useCallback, useMemo, useReducer, useState, type ReactNode } from "react";
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

interface AssistantsSectionProps {
  serverId: string;
}

function AssistantsUpgradeCard() {
  return (
    <SettingsSection title="Assistants">
      <View style={settingsStyles.card} testID="host-page-assistants-upgrade-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>Assistants require a newer host</Text>
            <Text style={settingsStyles.rowHint}>
              Update the selected Paseo daemon to create and manage assistants.
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
        <Text style={settingsStyles.rowTitle}>{assistant.name || "Unnamed assistant"}</Text>
        {assistant.description ? (
          <Text style={settingsStyles.rowHint}>{assistant.description}</Text>
        ) : null}
      </View>
      <View style={styles.rowActions}>
        <Button size="sm" variant="outline" onPress={handleEdit}>
          Edit
        </Button>
        <Button size="sm" variant="outline" onPress={handleDelete}>
          Delete
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
  const selectedMcpIdSet = useMemo(() => new Set(selectedMcpServerIds), [selectedMcpServerIds]);
  const selectedSkillIdSet = useMemo(() => new Set(selectedSkillIds), [selectedSkillIds]);
  const handleUseAllChange = useCallback(
    (value: boolean) => {
      onModeChange(value ? "all-enabled" : "custom");
    },
    [onModeChange],
  );

  return (
    <View style={styles.resourceCard} testID="assistant-resource-selection">
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>MCP and Skills</Text>
          <Text style={settingsStyles.rowHint}>
            Default uses every active MCP server and skill. Choose custom to limit what this
            assistant enables for new conversations.
          </Text>
        </View>
      </View>
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>Use all active MCP servers and skills</Text>
          <Text style={settingsStyles.rowHint}>
            New conversations will pick up active resources automatically when this assistant is
            selected.
          </Text>
        </View>
        <Switch
          value={isAllEnabled}
          onValueChange={handleUseAllChange}
          accessibilityLabel="Use all active assistant resources"
        />
      </View>
      {!isAllEnabled ? (
        <View style={styles.resourceCustomLists}>
          <AssistantResourceGroup
            kind="mcp"
            title="MCP servers"
            hint="External tools this assistant may call in new conversations."
            countLabel={`${mcpServers.filter((server) => selectedMcpIdSet.has(server.id)).length}/${mcpServers.length} selected`}
          >
            {mcpServers.length > 0 ? (
              mcpServers.map((server) => (
                <AssistantResourceOption
                  key={server.id}
                  id={server.id}
                  name={server.name}
                  description={server.description}
                  selected={selectedMcpIdSet.has(server.id)}
                  accessibilityLabel={`Enable MCP ${server.name} for assistant`}
                  onToggle={onToggleMcpServer}
                />
              ))
            ) : (
              <Text style={settingsStyles.rowHint}>No active MCP servers.</Text>
            )}
          </AssistantResourceGroup>
          <AssistantResourceGroup
            kind="skill"
            title="Skills"
            hint="Instruction packs injected for this assistant."
            countLabel={`${skills.filter((skill) => selectedSkillIdSet.has(skill.id)).length}/${skills.length} selected`}
          >
            {skills.length > 0 ? (
              skills.map((skill) => (
                <AssistantResourceOption
                  key={skill.id}
                  id={skill.id}
                  name={skill.name}
                  description={skill.description}
                  selected={selectedSkillIdSet.has(skill.id)}
                  accessibilityLabel={`Enable skill ${skill.name} for assistant`}
                  onToggle={onToggleSkill}
                />
              ))
            ) : (
              <Text style={settingsStyles.rowHint}>No active skills.</Text>
            )}
          </AssistantResourceGroup>
        </View>
      ) : null}
    </View>
  );
}

function formatCharCount(charCount: number): string {
  return `${charCount.toLocaleString()} chars`;
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
        placeholder="Edit the memory summary sent in the first agent prompt."
        accessibilityLabel="Memory summary file content"
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
        placeholder="Edit this memory detail file."
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

function AssistantMemoryArtifacts({
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
    ? "Save this assistant to generate summary and detail memory files."
    : "Summary and detail files will appear after the assistant is saved.";

  return (
    <View style={styles.memoryArtifacts} testID="assistant-memory-artifacts">
      <View style={styles.memoryArtifactCard} testID="assistant-memory-summary-file">
        <View style={styles.memoryArtifactHeader}>
          <View style={styles.memoryArtifactTitleBlock}>
            <Text style={styles.memoryArtifactTitle}>Memory summary file</Text>
            <Text style={styles.memoryArtifactHint}>
              Included in the first agent prompt. Detailed memories stay in files.
            </Text>
          </View>
          <Text style={styles.memoryArtifactBadge}>{summary ? "Generated" : "Pending"}</Text>
        </View>
        {summaryPath ? (
          <Text selectable numberOfLines={2} style={styles.memoryArtifactPath}>
            {summaryPath}
          </Text>
        ) : (
          <Text style={styles.memoryArtifactEmpty}>No summary file yet.</Text>
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
            <Text style={styles.memoryArtifactTitle}>Memory detail files</Text>
            <Text style={styles.memoryArtifactHint}>
              Agents can open only the specific detail file needed for a task.
            </Text>
          </View>
          <Text style={styles.memoryArtifactBadge}>{detailFiles.length} files</Text>
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

export function AssistantsSection({ serverId }: AssistantsSectionProps) {
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
  const [editingMemorySummary, setEditingMemorySummary] = useState("");
  const [editingMemoryFiles, setEditingMemoryFiles] = useState<Assistant["memoryFiles"] | null>(
    null,
  );
  const [memorySummaryDirty, setMemorySummaryDirty] = useState(false);
  const [dirtyMemoryDetailFileIds, setDirtyMemoryDetailFileIds] = useState<string[]>([]);
  const [editingAssistantId, setEditingAssistantId] = useState<string | null>(null);
  const [formResetKey, bumpFormResetKey] = useReducer((key: number) => key + 1, 0);

  const resetForm = useCallback(() => {
    setEditingAssistantId(null);
    setName("");
    setDescription("");
    setPrompt("");
    setMemoryEnabled(false);
    setMemory("");
    setResourceSelectionMode("all-enabled");
    setSelectedMcpServerIds([]);
    setSelectedSkillIds([]);
    setEditingMemorySummary("");
    setEditingMemoryFiles(null);
    setMemorySummaryDirty(false);
    setDirtyMemoryDetailFileIds([]);
    bumpFormResetKey();
  }, []);

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
    setEditingMemorySummary(assistant.memorySummary);
    setEditingMemoryFiles(assistant.memoryFiles);
    setMemorySummaryDirty(false);
    setDirtyMemoryDetailFileIds([]);
    bumpFormResetKey();
  }, []);

  const handleMemorySummaryChange = useCallback((value: string) => {
    setEditingMemorySummary(value);
    setMemorySummaryDirty(true);
  }, []);

  const handleDetailFileContentChange = useCallback((id: string, value: string) => {
    setEditingMemoryFiles((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        detailFiles: current.detailFiles.map((file) =>
          file.id === id ? { ...file, content: value, charCount: value.length } : file,
        ),
      };
    });
    setDirtyMemoryDetailFileIds((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

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
      const memoryAppend = memory.trim();
      const memoryDetailFileEdits =
        editingMemoryFiles?.detailFiles
          .filter((file) => dirtyMemoryDetailFileIds.includes(file.id))
          .map((file) => ({ id: file.id, content: file.content ?? "" })) ?? [];
      const updatedAssistant = await assistants.updateAssistant({
        id: editingAssistantId,
        name,
        description,
        prompt,
        memoryEnabled,
        resourceSelection: assistantResourceSelection,
        ...(memoryEnabled && memoryAppend.length > 0 ? { memoryAppend } : {}),
        ...(memoryEnabled && memorySummaryDirty ? { memorySummary: editingMemorySummary } : {}),
        ...(memoryEnabled && memoryDetailFileEdits.length > 0 ? { memoryDetailFileEdits } : {}),
      });
      handleEdit(updatedAssistant);
      return;
    } else {
      await assistants.createAssistant({
        name,
        description,
        prompt,
        memoryEnabled,
        memory,
        resourceSelection: assistantResourceSelection,
      });
    }
    resetForm();
  }, [
    assistantResourceSelection,
    assistants,
    description,
    dirtyMemoryDetailFileIds,
    editingAssistantId,
    editingMemoryFiles,
    editingMemorySummary,
    handleEdit,
    memory,
    memoryEnabled,
    memorySummaryDirty,
    name,
    prompt,
    resetForm,
  ]);

  const handleDelete = useCallback(
    (id: string) => {
      void assistants.deleteAssistant(id);
    },
    [assistants],
  );

  const canCreate = prompt.trim().length > 0;
  const isEditingAssistant = Boolean(editingAssistantId);
  const sourceMemoryLabel = isEditingAssistant ? "Append source memory" : "Source memory";
  const sourceMemoryHint = isEditingAssistant
    ? "Add only new memory here. Existing memory is preserved and shown in the summary/detail files below."
    : "Use Markdown to store stable preferences and context. Saving splits it into summary/detail files.";
  const sourceMemoryPlaceholder = isEditingAssistant
    ? "Add new memories to append. Leave empty to keep current memory unchanged."
    : "Use Markdown to store stable preferences and context.";

  if (!supportsAssistants) {
    return <AssistantsUpgradeCard />;
  }

  return (
    <View testID="host-page-assistants">
      <SettingsSection title={editingAssistantId ? "Edit assistant" : "Create assistant"}>
        <View style={styles.formCard}>
          <Field label="Name" testID="assistant-name-field">
            <FormTextInput
              initialValue={name}
              resetKey={`assistant-name-${formResetKey}`}
              onChangeText={setName}
              placeholder="Code reviewer"
            />
          </Field>
          <Field label="Description" testID="assistant-description-field">
            <FormTextInput
              initialValue={description}
              resetKey={`assistant-description-${formResetKey}`}
              onChangeText={setDescription}
              placeholder="Reviews code and suggests fixes"
            />
          </Field>
          <Field label="Assistant prompt" testID="assistant-prompt-field">
            <SettingsTextAreaCard
              value={prompt}
              onChangeText={setPrompt}
              placeholder="Use Markdown to describe how this assistant should behave."
              accessibilityLabel="Assistant prompt"
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
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>Memory</Text>
              <Text style={settingsStyles.rowHint}>
                Store memory as summary/detail files. Only the summary is sent in the first message.
              </Text>
            </View>
            <Switch
              value={memoryEnabled}
              onValueChange={setMemoryEnabled}
              accessibilityLabel="Enable assistant memory"
            />
          </View>
          {memoryEnabled ? (
            <>
              <Field
                label={sourceMemoryLabel}
                hint={sourceMemoryHint}
                testID="assistant-memory-field"
              >
                <SettingsTextAreaCard
                  value={memory}
                  onChangeText={setMemory}
                  placeholder={sourceMemoryPlaceholder}
                  accessibilityLabel="Assistant memory"
                  style={styles.memoryInput}
                />
              </Field>
              <AssistantMemoryArtifacts
                memorySummary={editingMemorySummary}
                memoryFiles={editingMemoryFiles}
                isEditing={isEditingAssistant}
                onMemorySummaryChange={handleMemorySummaryChange}
                onDetailFileContentChange={handleDetailFileContentChange}
              />
            </>
          ) : null}
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
              {editingAssistantId ? "Save changes" : "Add assistant"}
            </Button>
            {editingAssistantId ? (
              <Button variant="outline" onPress={resetForm} disabled={assistants.isMutating}>
                Cancel
              </Button>
            ) : null}
          </View>
        </View>
      </SettingsSection>

      <SettingsSection title="Assistants">
        <View style={settingsStyles.card}>
          {assistants.assistants.length > 0 ? (
            assistants.assistants.map((assistant) => (
              <AssistantRow
                key={assistant.id}
                assistant={assistant}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))
          ) : (
            <View style={settingsStyles.row}>
              <Text style={settingsStyles.rowHint}>No assistants yet.</Text>
            </View>
          )}
        </View>
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
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.4),
    marginTop: theme.spacing[1],
  },
  resourceGroupBadge: {
    color: theme.colors.foregroundMuted,
    backgroundColor: theme.colors.surface3,
    borderRadius: theme.borderRadius.full,
    fontSize: theme.fontSize.xs,
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
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.4),
    marginTop: theme.spacing[1],
  },
  memoryArtifactBadge: {
    color: theme.colors.foregroundMuted,
    backgroundColor: theme.colors.surface3,
    borderRadius: theme.borderRadius.full,
    fontSize: theme.fontSize.xs,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    overflow: "hidden",
  },
  memoryArtifactPath: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.4),
  },
  memoryArtifactEmpty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.4),
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
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.5),
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
    fontSize: theme.fontSize.xs,
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
