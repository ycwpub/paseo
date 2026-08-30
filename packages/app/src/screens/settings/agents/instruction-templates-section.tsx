import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { ChevronRight, FileText, Plus } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PaseoInstructionTemplate } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { EditingTextInput as TextInput } from "@/components/ui/text-input";
import { useToast } from "@/contexts/toast-context";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { confirmDialog } from "@/utils/confirm-dialog";

/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop -- Template rows and form fields bind actions to their current template values. */
interface InstructionTemplatesEntrySectionProps {
  serverId: string;
  onOpen: () => void;
}

interface InstructionTemplatesListPageProps {
  serverId: string;
  onCreate: () => void;
  onEdit: (templateId: string) => void;
}

interface InstructionTemplateEditorPageProps {
  serverId: string;
  templateId?: string;
  onDone: () => void;
}

interface InstructionTemplateDraft {
  id: string;
  name: string;
  description: string;
  content: string;
}

const EMPTY_DRAFT: InstructionTemplateDraft = {
  id: "",
  name: "",
  description: "",
  content: "",
};
const EMPTY_TEMPLATES: PaseoInstructionTemplate[] = [];

function templateToDraft(template: PaseoInstructionTemplate | undefined): InstructionTemplateDraft {
  if (!template) return EMPTY_DRAFT;
  return {
    id: template.id,
    name: template.name,
    description: template.description ?? "",
    content: template.content,
  };
}

function entryPressableStyle({
  hovered,
  pressed,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    settingsStyles.row,
    styles.entryRow,
    Boolean(hovered) && styles.entryRowHovered,
    pressed && styles.entryRowPressed,
  ];
}

function templatePressableStyle({
  hovered,
  pressed,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    settingsStyles.row,
    styles.templateRow,
    Boolean(hovered) && styles.entryRowHovered,
    pressed && styles.entryRowPressed,
  ];
}

export function InstructionTemplatesEntrySection({
  serverId,
  onOpen,
}: InstructionTemplatesEntrySectionProps) {
  const { config, isLoading } = useDaemonConfig(serverId);
  const count = config?.instructionTemplates?.length ?? 0;

  return (
    <SettingsSection title="全局指令模板" testID="host-instruction-templates-entry">
      <View style={settingsStyles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="管理全局指令模板"
          onPress={onOpen}
          style={entryPressableStyle}
          testID="open-instruction-templates"
        >
          <View style={styles.entryIcon}>
            <FileText size={18} color={styles.iconColor.color} />
          </View>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>管理指令模板</Text>
            <Text style={settingsStyles.rowHint}>
              {isLoading
                ? "正在加载模板…"
                : `当前主机已配置 ${count} 个模板，可供所有项目和智能体使用。`}
            </Text>
          </View>
          <ChevronRight size={18} color={styles.iconColor.color} />
        </Pressable>
      </View>
    </SettingsSection>
  );
}

export function InstructionTemplatesListPage({
  serverId,
  onCreate,
  onEdit,
}: InstructionTemplatesListPageProps) {
  const { config, isLoading } = useDaemonConfig(serverId);
  const templates = config?.instructionTemplates ?? [];
  let listContent: React.ReactNode;
  if (isLoading) {
    listContent = (
      <View style={settingsStyles.row}>
        <Text style={settingsStyles.rowHint}>正在加载模板…</Text>
      </View>
    );
  } else if (templates.length === 0) {
    listContent = (
      <View style={settingsStyles.row}>
        <Text style={settingsStyles.rowHint}>尚未配置指令模板。</Text>
      </View>
    );
  } else {
    listContent = templates.map((template, index) => (
      <Pressable
        key={template.id}
        accessibilityRole="button"
        accessibilityLabel={`编辑指令模板 ${template.name}`}
        onPress={() => onEdit(template.id)}
        style={templatePressableStyle}
        testID={`instruction-template-row-${template.id}`}
      >
        <View style={styles.templateContent}>
          <View style={styles.templateTitleRow}>
            <Text style={settingsStyles.rowTitle}>{template.name}</Text>
            <Text style={styles.templateId}>{template.id}</Text>
          </View>
          <Text numberOfLines={2} style={settingsStyles.rowHint}>
            {template.description?.trim() || template.content.trim() || "暂无说明"}
          </Text>
        </View>
        <ChevronRight size={18} color={styles.iconColor.color} />
        {index > 0 ? <View pointerEvents="none" style={styles.rowDivider} /> : null}
      </Pressable>
    ));
  }

  return (
    <SettingsSection
      title={`指令模板（${templates.length}）`}
      trailing={
        <Button size="sm" variant="default" onPress={onCreate} testID="create-instruction-template">
          <Plus size={16} />
          新建模板
        </Button>
      }
      testID="instruction-templates-list-page"
    >
      <Text style={styles.pageHint}>
        模板在当前主机的所有项目间共享。点击模板可进入详情页面查看和编辑。
      </Text>
      <View style={settingsStyles.card}>{listContent}</View>
    </SettingsSection>
  );
}

export function InstructionTemplateEditorPage({
  serverId,
  templateId,
  onDone,
}: InstructionTemplateEditorPageProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { config, isLoading, patchConfig } = useDaemonConfig(serverId);
  const [draft, setDraft] = useState<InstructionTemplateDraft>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const templates = useMemo(
    () => config?.instructionTemplates ?? EMPTY_TEMPLATES,
    [config?.instructionTemplates],
  );
  const template = useMemo(
    () => (templateId ? templates.find((candidate) => candidate.id === templateId) : undefined),
    [templateId, templates],
  );

  useEffect(() => {
    setDraft(templateToDraft(template));
  }, [template]);

  const validationError = useMemo(() => {
    if (!draft.id.trim() || !draft.name.trim() || !draft.content.trim()) {
      return t("settings.project.instructionTemplates.validation.incomplete");
    }
    const normalizedId = draft.id.trim();
    if (
      templates.some((candidate) => candidate.id === normalizedId && candidate.id !== templateId)
    ) {
      return t("settings.project.instructionTemplates.validation.duplicateId", {
        id: normalizedId,
      });
    }
    return null;
  }, [draft.content, draft.id, draft.name, t, templateId, templates]);

  const updateDraft = useCallback((patch: Partial<InstructionTemplateDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const save = useCallback(async () => {
    if (validationError || isSaving) return;
    const nextTemplate: PaseoInstructionTemplate = {
      ...template,
      id: draft.id.trim(),
      name: draft.name.trim(),
      content: draft.content,
    };
    if (draft.description.trim()) {
      nextTemplate.description = draft.description.trim();
    } else {
      delete nextTemplate.description;
    }

    const nextTemplates = templateId
      ? templates.map((candidate) => (candidate.id === templateId ? nextTemplate : candidate))
      : [...templates, nextTemplate];

    setIsSaving(true);
    try {
      await patchConfig({ instructionTemplates: nextTemplates });
      toast.show(t("settings.project.actions.saved"), { variant: "success" });
      onDone();
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : String(cause), { variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }, [
    draft.content,
    draft.description,
    draft.id,
    draft.name,
    isSaving,
    onDone,
    patchConfig,
    t,
    template,
    templateId,
    templates,
    toast,
    validationError,
  ]);

  const remove = useCallback(async () => {
    if (!templateId || !template || isSaving) return;
    const confirmed = await confirmDialog({
      title: `删除“${template.name}”？`,
      message: "删除后，该模板将不再供项目和智能体使用。此操作无法撤销。",
      confirmLabel: "删除",
      cancelLabel: "取消",
      destructive: true,
    });
    if (!confirmed) return;
    setIsSaving(true);
    try {
      await patchConfig({
        instructionTemplates: templates.filter((candidate) => candidate.id !== templateId),
      });
      toast.show("指令模板已删除", { variant: "success" });
      onDone();
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : String(cause), { variant: "error" });
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, onDone, patchConfig, template, templateId, templates, toast]);

  if (isLoading) {
    return (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>正在加载模板…</Text>
        </View>
      </View>
    );
  }

  if (templateId && !template) {
    return (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>找不到指令模板</Text>
            <Text style={settingsStyles.rowHint}>模板可能已被删除，或模板 ID 已发生变化。</Text>
          </View>
          <Button variant="outline" size="sm" onPress={onDone}>
            返回列表
          </Button>
        </View>
      </View>
    );
  }

  return (
    <SettingsSection
      title={templateId ? "模板详情" : "新建模板"}
      testID="instruction-template-editor-page"
    >
      <View style={styles.editorCard}>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>模板 ID</Text>
          <TextInput
            value={draft.id}
            onChangeText={(id) => updateDraft({ id })}
            placeholder={t("settings.project.instructionTemplates.idPlaceholder")}
            placeholderTextColor={styles.placeholderColor.color}
            style={styles.input}
            testID="instruction-template-id"
          />
          <Text style={styles.fieldHint}>用于唯一标识模板，保存后也可以修改。</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>模板名称</Text>
          <TextInput
            value={draft.name}
            onChangeText={(name) => updateDraft({ name })}
            placeholder={t("settings.project.instructionTemplates.namePlaceholder")}
            placeholderTextColor={styles.placeholderColor.color}
            style={styles.input}
            testID="instruction-template-name"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>模板说明</Text>
          <TextInput
            value={draft.description}
            onChangeText={(description) => updateDraft({ description })}
            placeholder={t("settings.project.instructionTemplates.descriptionPlaceholder")}
            placeholderTextColor={styles.placeholderColor.color}
            style={styles.input}
            testID="instruction-template-description"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>指令内容</Text>
          <TextInput
            value={draft.content}
            onChangeText={(content) => updateDraft({ content })}
            placeholder={t("settings.project.instructionTemplates.contentPlaceholder")}
            placeholderTextColor={styles.placeholderColor.color}
            style={styles.contentInput}
            multiline
            textAlignVertical="top"
            testID="instruction-template-content"
          />
          <Text style={styles.fieldHint}>
            支持 Markdown，并可通过 {"{{variableName}}"} 引用当前项目变量。
          </Text>
        </View>
        {validationError ? <Text style={settingsStyles.rowError}>{validationError}</Text> : null}
        <View style={styles.actions}>
          {templateId ? (
            <Button variant="outline" size="sm" onPress={remove} disabled={isSaving}>
              删除模板
            </Button>
          ) : (
            <View />
          )}
          <View style={styles.primaryActions}>
            <Button variant="outline" size="sm" onPress={onDone} disabled={isSaving}>
              取消
            </Button>
            <Button
              variant="default"
              size="sm"
              onPress={save}
              disabled={Boolean(validationError) || isSaving}
              loading={isSaving}
              testID="save-instruction-template"
            >
              保存
            </Button>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  entryRow: {
    minHeight: 76,
    gap: theme.spacing[3],
  },
  entryRowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  entryRowPressed: {
    opacity: 0.78,
  },
  entryIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
  },
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
  pageHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginHorizontal: theme.spacing[1],
  },
  templateRow: {
    position: "relative",
    gap: theme.spacing[3],
  },
  rowDivider: {
    position: "absolute",
    top: 0,
    left: theme.spacing[4],
    right: 0,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  templateContent: {
    flex: 1,
    minWidth: 0,
  },
  templateTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  templateId: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface2,
  },
  editorCard: {
    gap: theme.spacing[4],
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  field: {
    gap: theme.spacing[2],
  },
  fieldLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  fieldHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  input: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  contentInput: {
    minHeight: 260,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  placeholderColor: {
    color: theme.colors.foregroundMuted,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  primaryActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
}));
/* oxlint-enable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop */
