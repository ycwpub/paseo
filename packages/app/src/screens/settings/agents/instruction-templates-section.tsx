import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { SettingsGroup } from "@/screens/settings/settings-group";
import { settingsStyles } from "@/styles/settings";
import {
  instructionTemplateDraftsToConfig,
  instructionTemplatesToDraft,
  type ProjectInstructionTemplateDraft,
} from "@/utils/project-config-form";
import { useToast } from "@/contexts/toast-context";

/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop -- Dynamic template rows bind edits to their current entry. */
export function InstructionTemplatesSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { config, patchConfig } = useDaemonConfig(serverId);
  const [values, setValues] = useState<ProjectInstructionTemplateDraft[]>([]);

  useEffect(() => {
    setValues(instructionTemplatesToDraft(config?.instructionTemplates));
  }, [config?.instructionTemplates]);

  const error = useMemo(() => {
    const incomplete = values.find(
      (entry) => !entry.id.trim() || !entry.name.trim() || !entry.content.trim(),
    );
    if (incomplete) {
      return t("settings.project.instructionTemplates.validation.incomplete");
    }
    const ids = values.map((entry) => entry.id.trim()).filter(Boolean);
    const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
    return duplicate
      ? t("settings.project.instructionTemplates.validation.duplicateId", { id: duplicate })
      : null;
  }, [t, values]);

  const add = useCallback(() => {
    setValues((current) => [
      ...current,
      {
        rowId: `template-${Date.now()}`,
        id: "",
        name: "",
        description: "",
        content: "",
        rawEntry: { id: "new", name: "New template", content: "" },
      },
    ]);
  }, []);
  const update = useCallback((rowId: string, patch: Partial<ProjectInstructionTemplateDraft>) => {
    setValues((current) =>
      current.map((entry) => (entry.rowId === rowId ? { ...entry, ...patch } : entry)),
    );
  }, []);
  const save = useCallback(() => {
    if (error) return;
    void patchConfig({ instructionTemplates: instructionTemplateDraftsToConfig(values) })
      .then(() => toast.show(t("settings.project.actions.saved"), { variant: "success" }))
      .catch((cause) =>
        toast.show(cause instanceof Error ? cause.message : String(cause), { variant: "error" }),
      );
  }, [error, patchConfig, t, toast, values]);

  return (
    <SettingsGroup
      title={t("settings.project.instructionTemplates.title")}
      info={t("settings.project.instructionTemplates.info")}
      trailing={
        <Pressable onPress={add} hitSlop={8} style={settingsStyles.sectionHeaderLink}>
          <Plus size={16} color={styles.iconColor.color} />
        </Pressable>
      }
      testID="host-instruction-templates-group"
    >
      <View style={styles.list}>
        {values.length === 0 ? (
          <View style={settingsStyles.card}>
            <View style={settingsStyles.row}>
              <Text style={styles.empty}>{t("settings.project.instructionTemplates.empty")}</Text>
            </View>
          </View>
        ) : (
          values.map((entry) => (
            <View key={entry.rowId} style={styles.card}>
              <View style={styles.row}>
                <TextInput
                  value={entry.id}
                  onChangeText={(id) => update(entry.rowId, { id })}
                  placeholder={t("settings.project.instructionTemplates.idPlaceholder")}
                  placeholderTextColor={styles.placeholderColor.color}
                  style={styles.input}
                />
                <TextInput
                  value={entry.name}
                  onChangeText={(name) => update(entry.rowId, { name })}
                  placeholder={t("settings.project.instructionTemplates.namePlaceholder")}
                  placeholderTextColor={styles.placeholderColor.color}
                  style={styles.input}
                />
                <Pressable
                  accessibilityLabel={t("settings.project.instructionTemplates.remove")}
                  onPress={() =>
                    setValues((current) => current.filter((value) => value.rowId !== entry.rowId))
                  }
                  style={styles.remove}
                >
                  <X size={16} color={styles.iconColor.color} />
                </Pressable>
              </View>
              <TextInput
                value={entry.description}
                onChangeText={(description) => update(entry.rowId, { description })}
                placeholder={t("settings.project.instructionTemplates.descriptionPlaceholder")}
                placeholderTextColor={styles.placeholderColor.color}
                style={styles.input}
              />
              <TextInput
                value={entry.content}
                onChangeText={(content) => update(entry.rowId, { content })}
                placeholder={t("settings.project.instructionTemplates.contentPlaceholder")}
                placeholderTextColor={styles.placeholderColor.color}
                style={styles.content}
                multiline
                textAlignVertical="top"
              />
            </View>
          ))
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <Button variant="default" size="sm" disabled={Boolean(error)} onPress={save}>
            {t("settings.project.actions.save")}
          </Button>
        </View>
      </View>
    </SettingsGroup>
  );
}
/* oxlint-enable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-jsx-as-prop */

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.spacing[3],
  },
  card: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  row: {
    flexDirection: {
      xs: "column",
      md: "row",
    },
    gap: theme.spacing[2],
    alignItems: {
      xs: "stretch",
      md: "center",
    },
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  content: {
    minHeight: 140,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  remove: {
    padding: theme.spacing[2],
    alignSelf: "center",
  },
  actions: {
    alignItems: "flex-end",
  },
  empty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
  },
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
  placeholderColor: {
    color: theme.colors.foregroundMuted,
  },
}));
