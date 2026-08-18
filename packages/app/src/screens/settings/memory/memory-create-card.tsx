import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  PaseoMemoryCreateInput,
  PaseoMemoryDetail,
  PaseoMemoryScope,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { SettingsTextArea } from "@/components/settings-textarea";
import { settingsStyles } from "@/styles/settings";
import {
  MEMORY_CATEGORY_OPTIONS,
  MEMORY_SCOPE_OPTIONS,
  memoryCategoryLabel,
  memoryScopeLabel,
} from "./memory-form-options";

interface CreateDraft {
  title: string;
  category: PaseoMemoryDetail["category"];
  content: string;
  keywords: string;
  scopeType: PaseoMemoryScope["type"];
  scopeId: string;
  importance: string;
  validUntil: string;
  sensitive: boolean;
}

const EMPTY_DRAFT: CreateDraft = {
  title: "",
  category: "other",
  content: "",
  keywords: "",
  scopeType: "global",
  scopeId: "",
  importance: "1",
  validUntil: "",
  sensitive: false,
};

function parseImportance(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1;
}

export function MemoryCreateCard({
  disabled,
  globalUserId,
  onCreate,
}: {
  disabled: boolean;
  globalUserId: string;
  onCreate: (input: PaseoMemoryCreateInput) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<CreateDraft>(EMPTY_DRAFT);
  const categoryDisplay = useMemo(
    () => ({ label: memoryCategoryLabel(draft.category) }),
    [draft.category],
  );
  const scopeDisplay = useMemo(
    () => ({ label: memoryScopeLabel({ type: draft.scopeType, id: draft.scopeId || undefined }) }),
    [draft.scopeId, draft.scopeType],
  );
  const open = useCallback(() => setExpanded(true), []);
  const close = useCallback(() => setExpanded(false), []);
  const setTitle = useCallback(
    (title: string) => setDraft((current) => ({ ...current, title })),
    [],
  );
  const setCategory = useCallback(
    (category: PaseoMemoryDetail["category"]) => setDraft((current) => ({ ...current, category })),
    [],
  );
  const setScopeType = useCallback(
    (scopeType: PaseoMemoryScope["type"]) => setDraft((current) => ({ ...current, scopeType })),
    [],
  );
  const setScopeId = useCallback(
    (scopeId: string) => setDraft((current) => ({ ...current, scopeId })),
    [],
  );
  const setKeywords = useCallback(
    (keywords: string) => setDraft((current) => ({ ...current, keywords })),
    [],
  );
  const setImportance = useCallback(
    (importance: string) => setDraft((current) => ({ ...current, importance })),
    [],
  );
  const setValidUntil = useCallback(
    (validUntil: string) => setDraft((current) => ({ ...current, validUntil })),
    [],
  );
  const setSensitive = useCallback(
    (sensitive: boolean) => setDraft((current) => ({ ...current, sensitive })),
    [],
  );
  const setContent = useCallback(
    (content: string) => setDraft((current) => ({ ...current, content })),
    [],
  );
  const submit = useCallback(async () => {
    await onCreate({
      title: draft.title.trim(),
      category: draft.category,
      content: draft.content.trim(),
      keywords: draft.keywords
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      scope:
        draft.scopeType === "global"
          ? { type: "global", id: globalUserId }
          : { type: draft.scopeType, id: draft.scopeId.trim() },
      importance: parseImportance(draft.importance),
      validUntil: draft.validUntil.trim() || null,
      sensitive: draft.sensitive,
    });
    setDraft(EMPTY_DRAFT);
    setExpanded(false);
  }, [draft, globalUserId, onCreate]);

  if (!expanded) {
    return (
      <Button size="sm" variant="outline" disabled={disabled} onPress={open}>
        Add memory
      </Button>
    );
  }

  return (
    <View style={settingsStyles.card}>
      <View style={styles.form}>
        <Text style={styles.title}>Add explicit memory</Text>
        <Text style={settingsStyles.rowHint}>
          Explicit memories take precedence over later automatic extraction
        </Text>
        <Field label="Title">
          <FormTextInput value={draft.title} onChangeText={setTitle} editable={!disabled} />
        </Field>
        <View style={styles.fieldGrid}>
          <View style={styles.gridItem}>
            <SelectField
              label="Category"
              value={draft.category}
              selectedDisplay={categoryDisplay}
              options={MEMORY_CATEGORY_OPTIONS}
              onChange={setCategory}
              placeholder="Select category"
              emptyText="No categories"
              disabled={disabled}
            />
          </View>
          <View style={styles.gridItem}>
            <SelectField
              label="Scope"
              value={draft.scopeType}
              selectedDisplay={scopeDisplay}
              options={MEMORY_SCOPE_OPTIONS}
              onChange={setScopeType}
              placeholder="Select scope"
              emptyText="No scopes"
              disabled={disabled}
            />
          </View>
        </View>
        {draft.scopeType === "global" ? null : (
          <Field label="Scope ID">
            <FormTextInput value={draft.scopeId} onChangeText={setScopeId} editable={!disabled} />
          </Field>
        )}
        <Field label="Keywords" hint="Separate keywords with commas">
          <FormTextInput value={draft.keywords} onChangeText={setKeywords} editable={!disabled} />
        </Field>
        <View style={styles.fieldGrid}>
          <View style={styles.gridItem}>
            <Field label="Importance" hint="0 to 1">
              <FormTextInput
                value={draft.importance}
                onChangeText={setImportance}
                editable={!disabled}
                keyboardType="decimal-pad"
              />
            </Field>
          </View>
          <View style={styles.gridItem}>
            <Field label="Valid until" hint="ISO date/time or empty">
              <FormTextInput
                value={draft.validUntil}
                onChangeText={setValidUntil}
                editable={!disabled}
              />
            </Field>
          </View>
        </View>
        <View style={styles.switchRow}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>Sensitive information</Text>
            <Text style={settingsStyles.rowHint}>Mark this memory for privacy review</Text>
          </View>
          <Switch value={draft.sensitive} disabled={disabled} onValueChange={setSensitive} />
        </View>
        <Field label="Memory content">
          <View style={styles.textAreaCard}>
            <SettingsTextArea
              accessibilityLabel="New memory content"
              value={draft.content}
              onChangeText={setContent}
              style={styles.contentInput}
            />
          </View>
        </Field>
        <View style={styles.actions}>
          <Button
            size="sm"
            disabled={
              disabled ||
              !draft.title.trim() ||
              !draft.content.trim() ||
              (draft.scopeType !== "global" && !draft.scopeId.trim())
            }
            onPress={submit}
          >
            Add
          </Button>
          <Button size="sm" variant="ghost" disabled={disabled} onPress={close}>
            Cancel
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  form: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  fieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  gridItem: {
    flex: 1,
    minWidth: 220,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  textAreaCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
    overflow: "hidden",
  },
  contentInput: {
    minHeight: 180,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
