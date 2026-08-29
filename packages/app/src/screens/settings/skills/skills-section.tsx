import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { Skill } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingsTextAreaCard } from "@/components/settings-textarea";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useSkills } from "@/hooks/use-skills";
import { useHostFeature } from "@/runtime/host-features";
import { confirmDialog } from "@/utils/confirm-dialog";

interface SkillsSectionProps {
  serverId: string;
  onCreate: () => void;
  onEdit: (skill: Skill) => void;
}

const DEFAULT_SKILL_CONTENT = `---
name: my-skill
description: Explain when this skill should be used.
---

# My skill

Describe the workflow, constraints, and examples the agent should follow.
`;

function SkillsUpgradeCard() {
  return (
    <SettingsSection title="技能">
      <View style={settingsStyles.card} testID="host-page-skills-upgrade-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>Skill 管理需要更新主机</Text>
            <Text style={settingsStyles.rowHint}>
              请更新所选 Paseo Daemon，以创建、编辑、启用或删除 Skill。
            </Text>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}

function parseTagsInput(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatTags(tags: string[] | undefined): string {
  return (tags ?? []).join(", ");
}

function skillSourceLabel(skill: Skill): string {
  if (skill.source === "builtin") return "内置";
  if (skill.source === "marketplace") return skill.pluginName ?? "插件";
  return "自定义";
}

function SkillRow({
  skill,
  isFirst,
  onToggleEnabled,
  onEdit,
  onDelete,
}: {
  skill: Skill;
  isFirst: boolean;
  onToggleEnabled: (skill: Skill, enabled: boolean) => void;
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
}) {
  const isReadOnly = skill.source !== "user";
  const handleToggle = useCallback(
    (enabled: boolean) => onToggleEnabled(skill, enabled),
    [onToggleEnabled, skill],
  );
  const handleEdit = useCallback(() => onEdit(skill), [onEdit, skill]);
  const handleDelete = useCallback(() => onDelete(skill), [onDelete, skill]);
  const rowStyle = useMemo(
    () => [
      isFirst ? settingsStyles.row : [settingsStyles.row, settingsStyles.rowBorder],
      styles.skillRow,
    ],
    [isFirst],
  );

  return (
    <View style={rowStyle} testID={`skill-row-${skill.id}`}>
      <View style={settingsStyles.rowContent}>
        <View style={styles.rowTitleLine}>
          <Text style={settingsStyles.rowTitle} numberOfLines={1}>
            {skill.name}
          </Text>
          <Text style={styles.sourceBadge}>{skillSourceLabel(skill)}</Text>
          {!skill.enabled ? <Text style={styles.sourceBadge}>已禁用</Text> : null}
        </View>
        {skill.description ? (
          <Text style={settingsStyles.rowHint} numberOfLines={2}>
            {skill.description}
          </Text>
        ) : null}
        {skill.tags?.length ? (
          <Text style={settingsStyles.rowHint} numberOfLines={1}>
            {skill.tags.join(", ")}
          </Text>
        ) : null}
        {skill.path ? (
          <Text style={styles.monoHint} numberOfLines={1}>
            {skill.path}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowActions}>
        <Switch
          value={skill.enabled}
          onValueChange={handleToggle}
          accessibilityLabel={`启用 ${skill.name}`}
        />
        <Button size="sm" variant="outline" onPress={handleEdit} disabled={isReadOnly}>
          编辑
        </Button>
        <Button size="sm" variant="destructive" onPress={handleDelete} disabled={isReadOnly}>
          删除
        </Button>
      </View>
    </View>
  );
}

export function SkillsSection({ serverId, onCreate, onEdit }: SkillsSectionProps) {
  const supportsSkills = useHostFeature(serverId, "skills");
  const skills = useSkills(serverId, { enabled: supportsSkills });
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const filteredSkills = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return skills.skills;
    return skills.skills.filter((skill) => {
      const haystack = [
        skill.name,
        skill.description ?? "",
        skill.source,
        ...(skill.tags ?? []),
        skill.path ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, skills.skills]);

  const handleToggleEnabled = useCallback(
    (skill: Skill, nextEnabled: boolean) => {
      void skills.updateSkill({ id: skill.id, enabled: nextEnabled });
    },
    [skills],
  );

  const handleDelete = useCallback(
    (skill: Skill) => {
      void confirmDialog({
        title: `删除 ${skill.name}？`,
        message: "这会从当前主机移除该技能。",
        confirmLabel: "删除",
        destructive: true,
      }).then((confirmed) => {
        if (confirmed) {
          void skills.deleteSkill(skill.id);
        }
        return undefined;
      });
    },
    [skills],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshMessage(null);
    try {
      await skills.refreshSkills();
      setRefreshMessage("已扫描本地技能和 MCP 资源。");
    } catch {
      // The hook exposes the mutation error below.
    }
  }, [skills]);

  const skillListContent = useMemo(() => {
    if (skills.isLoading) {
      return (
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>正在加载 Skills…</Text>
        </View>
      );
    }

    if (filteredSkills.length > 0) {
      return filteredSkills.map((skill, index) => (
        <SkillRow
          key={skill.id}
          skill={skill}
          isFirst={index === 0}
          onToggleEnabled={handleToggleEnabled}
          onEdit={onEdit}
          onDelete={handleDelete}
        />
      ));
    }

    return (
      <View style={settingsStyles.row}>
        <Text style={settingsStyles.rowHint}>
          {skills.skills.length === 0 ? "暂无技能。" : "没有匹配的技能。"}
        </Text>
      </View>
    );
  }, [
    filteredSkills,
    handleDelete,
    handleToggleEnabled,
    onEdit,
    skills.isLoading,
    skills.skills.length,
  ]);

  if (!supportsSkills) {
    return <SkillsUpgradeCard />;
  }

  return (
    <View testID="host-page-skills">
      <SettingsSection title="技能">
        <View style={styles.headerCard}>
          <View style={styles.headerText}>
            <Text style={settingsStyles.rowTitle}>管理可复用的智能体技能</Text>
            <Text style={settingsStyles.rowHint}>
              创建自定义技能、编辑 Markdown 指令，并启用或禁用。
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Button
              variant="outline"
              onPress={handleRefresh}
              loading={skills.isMutating}
              disabled={!skills.isConnected}
            >
              扫描本地资源
            </Button>
            <Button variant="default" onPress={onCreate} disabled={!skills.isConnected}>
              创建技能
            </Button>
          </View>
        </View>
      </SettingsSection>

      <SettingsSection title={`可用技能（${skills.skills.length}）`}>
        <View style={styles.searchCard}>
          <Field label="搜索">
            <FormTextInput
              initialValue={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="搜索技能"
            />
          </Field>
        </View>
        <View style={settingsStyles.card}>{skillListContent}</View>
        {refreshMessage ? <Text style={styles.sectionMessage}>{refreshMessage}</Text> : null}
        {skills.error ? <Text style={settingsStyles.rowError}>{skills.error.message}</Text> : null}
        {skills.mutationError ? (
          <Text style={settingsStyles.rowError}>{skills.mutationError.message}</Text>
        ) : null}
      </SettingsSection>
    </View>
  );
}

export function SkillEditorPage({
  serverId,
  skillId,
  onDone,
}: {
  serverId: string;
  skillId?: string;
  onDone: () => void;
}) {
  const supportsSkills = useHostFeature(serverId, "skills");
  const skills = useSkills(serverId, { enabled: supportsSkills });
  const editingSkill = useMemo(
    () => skills.skills.find((skill) => skill.id === skillId) ?? null,
    [skillId, skills.skills],
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [content, setContent] = useState(DEFAULT_SKILL_CONTENT);
  const [enabled, setEnabled] = useState(true);
  const [formResetKey, bumpFormResetKey] = useReducer((key: number) => key + 1, 0);

  useEffect(() => {
    if (!editingSkill) return;
    setName(editingSkill.name);
    setDescription(editingSkill.description ?? "");
    setTagsInput(formatTags(editingSkill.tags));
    setContent(editingSkill.content ?? "");
    setEnabled(editingSkill.enabled);
    bumpFormResetKey();
  }, [editingSkill]);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedContent = content.trim();
    if (!trimmedName || !trimmedContent) return;

    try {
      if (editingSkill) {
        await skills.updateSkill({
          id: editingSkill.id,
          name: trimmedName,
          description,
          content,
          enabled,
          tags: parseTagsInput(tagsInput),
        });
      } else {
        await skills.createSkill({
          name: trimmedName,
          description,
          content,
          tags: parseTagsInput(tagsInput),
        });
      }
      onDone();
    } catch {
      // The hook exposes the mutation error below.
    }
  }, [content, description, editingSkill, enabled, name, onDone, skills, tagsInput]);

  const canSave = name.trim().length > 0 && content.trim().length > 0 && skills.isConnected;

  if (!supportsSkills) {
    return <SkillsUpgradeCard />;
  }

  if (skillId && !skills.isLoading && !editingSkill) {
    return (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>找不到技能</Text>
            <Text style={settingsStyles.rowHint}>该技能可能已被删除或不再可编辑。</Text>
          </View>
          <Button size="sm" variant="outline" onPress={onDone}>
            返回列表
          </Button>
        </View>
      </View>
    );
  }

  return (
    <SettingsSection title={skillId ? "编辑技能" : "创建技能"}>
      <View style={styles.formCard}>
        <Field label="名称" testID="skill-name-field">
          <FormTextInput
            initialValue={name}
            resetKey={`skill-name-${formResetKey}`}
            onChangeText={setName}
            placeholder="code-review"
          />
        </Field>
        <Field label="描述" testID="skill-description-field">
          <FormTextInput
            initialValue={description}
            resetKey={`skill-description-${formResetKey}`}
            onChangeText={setDescription}
            placeholder="用于审查代码改动"
          />
        </Field>
        <Field label="标签" hint="使用英文逗号分隔。" testID="skill-tags-field">
          <FormTextInput
            initialValue={tagsInput}
            resetKey={`skill-tags-${formResetKey}`}
            onChangeText={setTagsInput}
            placeholder="review, code"
          />
        </Field>
        {editingSkill ? (
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>已启用</Text>
              <Text style={settingsStyles.rowHint}>禁用后不会向 Agent 提供该技能。</Text>
            </View>
            <Switch value={enabled} onValueChange={setEnabled} accessibilityLabel="启用技能" />
          </View>
        ) : null}
        <Field label="技能 Markdown 内容" testID="skill-content-field">
          <SettingsTextAreaCard
            key={`skill-content-${skillId ?? "new"}-${editingSkill?.updatedAt ?? "loading"}`}
            value={content}
            onChangeText={setContent}
            accessibilityLabel="技能 Markdown 内容"
            placeholder={DEFAULT_SKILL_CONTENT}
            style={styles.contentInput}
            testID="skill-content-input"
          />
        </Field>
        {skills.mutationError ? (
          <Text style={settingsStyles.rowError}>{skills.mutationError.message}</Text>
        ) : null}
        <View style={styles.actionsRow}>
          <Button variant="outline" onPress={onDone} disabled={skills.isMutating}>
            取消
          </Button>
          <Button
            variant="default"
            onPress={handleSave}
            disabled={!canSave || (skillId !== undefined && !editingSkill)}
            loading={skills.isMutating}
            testID="save-skill"
          >
            {skillId ? "保存技能" : "创建技能"}
          </Button>
        </View>
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  headerCard: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[4],
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  formCard: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  searchCard: {
    backgroundColor: theme.colors.surface1,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.colors.border,
    padding: theme.spacing[3],
  },
  contentInput: {
    minHeight: 280,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  skillRow: {
    alignItems: "flex-start",
  },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  sourceBadge: {
    color: theme.colors.foregroundMuted,
    backgroundColor: theme.colors.surface3,
    borderRadius: theme.borderRadius.full,
    overflow: "hidden",
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    fontSize: theme.fontSize.xs,
  },
  monoHint: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.4),
    marginTop: theme.spacing[1],
  },
  sectionMessage: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[2],
  },
}));
