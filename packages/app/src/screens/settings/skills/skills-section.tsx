import { useCallback, useMemo, useReducer, useState } from "react";
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
}

const ROW_WITH_BORDER_STYLE = [settingsStyles.row, settingsStyles.rowBorder];

const DEFAULT_SKILL_CONTENT = `---
name: my-skill
description: Explain when this skill should be used.
---

# My skill

Describe the workflow, constraints, and examples the agent should follow.
`;

function SkillsUpgradeCard() {
  return (
    <SettingsSection title="Skills">
      <View style={settingsStyles.card} testID="host-page-skills-upgrade-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>Skill management requires a newer host</Text>
            <Text style={settingsStyles.rowHint}>
              Update the selected Paseo daemon to create, edit, enable, or remove skills.
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
  if (skill.source === "builtin") return "Built-in";
  if (skill.source === "marketplace") return "Marketplace";
  return "Custom";
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
  const isReadOnly = skill.source === "builtin";
  const handleToggle = useCallback(
    (enabled: boolean) => onToggleEnabled(skill, enabled),
    [onToggleEnabled, skill],
  );
  const handleEdit = useCallback(() => onEdit(skill), [onEdit, skill]);
  const handleDelete = useCallback(() => onDelete(skill), [onDelete, skill]);
  const rowStyle = useMemo(
    () => [isFirst ? settingsStyles.row : ROW_WITH_BORDER_STYLE, styles.skillRow],
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
          {!skill.enabled ? <Text style={styles.sourceBadge}>Disabled</Text> : null}
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
          accessibilityLabel={`Enable ${skill.name}`}
        />
        <Button size="sm" variant="outline" onPress={handleEdit} disabled={isReadOnly}>
          Edit
        </Button>
        <Button size="sm" variant="destructive" onPress={handleDelete} disabled={isReadOnly}>
          Delete
        </Button>
      </View>
    </View>
  );
}

export function SkillsSection({ serverId }: SkillsSectionProps) {
  const supportsSkills = useHostFeature(serverId, "skills");
  const skills = useSkills(serverId, { enabled: supportsSkills });
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [content, setContent] = useState(DEFAULT_SKILL_CONTENT);
  const [enabled, setEnabled] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [formResetKey, bumpFormResetKey] = useReducer((key: number) => key + 1, 0);

  const editingSkill = useMemo(
    () => skills.skills.find((skill) => skill.id === editingSkillId) ?? null,
    [editingSkillId, skills.skills],
  );

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

  const resetForm = useCallback(() => {
    setEditingSkillId(null);
    setFormOpen(false);
    setName("");
    setDescription("");
    setTagsInput("");
    setContent(DEFAULT_SKILL_CONTENT);
    setEnabled(true);
    bumpFormResetKey();
  }, []);

  const openCreateForm = useCallback(() => {
    setEditingSkillId(null);
    setName("");
    setDescription("");
    setTagsInput("");
    setContent(DEFAULT_SKILL_CONTENT);
    setEnabled(true);
    setFormOpen(true);
    bumpFormResetKey();
  }, []);

  const openEditForm = useCallback((skill: Skill) => {
    setEditingSkillId(skill.id);
    setName(skill.name);
    setDescription(skill.description ?? "");
    setTagsInput(formatTags(skill.tags));
    setContent(skill.content ?? "");
    setEnabled(skill.enabled);
    setFormOpen(true);
    bumpFormResetKey();
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedContent = content.trim();
    if (!trimmedName || !trimmedContent) return;

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
    resetForm();
  }, [content, description, editingSkill, enabled, name, resetForm, skills, tagsInput]);

  const handleToggleEnabled = useCallback(
    (skill: Skill, nextEnabled: boolean) => {
      void skills.updateSkill({ id: skill.id, enabled: nextEnabled });
    },
    [skills],
  );

  const handleDelete = useCallback(
    (skill: Skill) => {
      void confirmDialog({
        title: `Delete ${skill.name}?`,
        message: "This removes the skill from this host.",
        confirmLabel: "Delete",
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

  const canSave = name.trim().length > 0 && content.trim().length > 0 && skills.isConnected;
  const skillListContent = useMemo(() => {
    if (skills.isLoading) {
      return (
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>Loading skills…</Text>
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
          onEdit={openEditForm}
          onDelete={handleDelete}
        />
      ));
    }

    return (
      <View style={settingsStyles.row}>
        <Text style={settingsStyles.rowHint}>
          {skills.skills.length === 0 ? "No skills yet." : "No matching skills."}
        </Text>
      </View>
    );
  }, [
    filteredSkills,
    handleDelete,
    handleToggleEnabled,
    openEditForm,
    skills.isLoading,
    skills.skills.length,
  ]);

  if (!supportsSkills) {
    return <SkillsUpgradeCard />;
  }

  return (
    <View testID="host-page-skills">
      <SettingsSection title="Skills">
        <View style={styles.headerCard}>
          <View style={styles.headerText}>
            <Text style={settingsStyles.rowTitle}>Manage reusable agent skills</Text>
            <Text style={settingsStyles.rowHint}>
              Create custom skills, edit their Markdown instructions, and enable or disable them.
            </Text>
          </View>
          <Button variant="default" onPress={openCreateForm} disabled={!skills.isConnected}>
            Add skill
          </Button>
        </View>
      </SettingsSection>

      {formOpen ? (
        <SettingsSection title={editingSkill ? "Edit skill" : "Create skill"}>
          <View style={styles.formCard}>
            <Field label="Name" testID="skill-name-field">
              <FormTextInput
                initialValue={name}
                resetKey={`skill-name-${formResetKey}`}
                onChangeText={setName}
                placeholder="code-review"
              />
            </Field>
            <Field label="Description" testID="skill-description-field">
              <FormTextInput
                initialValue={description}
                resetKey={`skill-description-${formResetKey}`}
                onChangeText={setDescription}
                placeholder="Use when reviewing code changes"
              />
            </Field>
            <Field label="Tags" hint="Comma-separated labels." testID="skill-tags-field">
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
                  <Text style={settingsStyles.rowTitle}>Enabled</Text>
                  <Text style={settingsStyles.rowHint}>
                    Disabled skills are not offered to agents.
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={setEnabled}
                  accessibilityLabel="Enable skill"
                />
              </View>
            ) : null}
            <Field label="Skill Markdown" testID="skill-content-field">
              <SettingsTextAreaCard
                value={content}
                onChangeText={setContent}
                accessibilityLabel="Skill Markdown"
                placeholder={DEFAULT_SKILL_CONTENT}
                style={styles.contentInput}
              />
            </Field>
            {skills.mutationError ? (
              <Text style={settingsStyles.rowError}>{skills.mutationError.message}</Text>
            ) : null}
            <View style={styles.actionsRow}>
              <Button
                variant="default"
                onPress={handleSave}
                disabled={!canSave}
                loading={skills.isMutating}
              >
                {editingSkill ? "Save skill" : "Create skill"}
              </Button>
              <Button variant="outline" onPress={resetForm} disabled={skills.isMutating}>
                Cancel
              </Button>
            </View>
          </View>
        </SettingsSection>
      ) : null}

      <SettingsSection title={`Available skills (${skills.skills.length})`}>
        <View style={styles.searchCard}>
          <Field label="Search">
            <FormTextInput
              initialValue={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search skills"
            />
          </Field>
        </View>
        <View style={settingsStyles.card}>{skillListContent}</View>
        {skills.error ? <Text style={settingsStyles.rowError}>{skills.error.message}</Text> : null}
      </SettingsSection>
    </View>
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
}));
