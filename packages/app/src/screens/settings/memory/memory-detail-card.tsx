import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { PaseoMemoryDetail, PaseoMemoryScope } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import { SettingsTextArea } from "@/components/settings-textarea";
import { settingsStyles } from "@/styles/settings";
import type { Theme } from "@/styles/theme";
import {
  MEMORY_CATEGORY_OPTIONS,
  MEMORY_DETAIL_STATUS_OPTIONS,
  MEMORY_SCOPE_OPTIONS,
  memoryCategoryLabel,
  memoryScopeLabel,
  memoryStatus,
} from "./memory-form-options";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface MemoryDetailDraft {
  title: string;
  category: PaseoMemoryDetail["category"];
  content: string;
  keywords: string;
  scopeType: PaseoMemoryScope["type"];
  scopeId: string;
  status: NonNullable<PaseoMemoryDetail["status"]>;
  importance: string;
  validUntil: string;
}

function draftFromDetail(detail: PaseoMemoryDetail): MemoryDetailDraft {
  return {
    title: detail.title,
    category: detail.category,
    content: detail.content,
    keywords: detail.keywords.join(", "),
    scopeType: detail.scope?.type ?? "global",
    scopeId: detail.scope?.id ?? "",
    status: memoryStatus(detail),
    importance: String(detail.importance ?? 0.5),
    validUntil: detail.validUntil ?? "",
  };
}

function rowPressStyle({ pressed }: PressableStateCallbackType) {
  return [settingsStyles.row, styles.header, pressed ? styles.headerPressed : null];
}

export function MemoryDetailCard({
  detail,
  disabled,
  onSave,
  onDelete,
}: {
  detail: PaseoMemoryDetail;
  disabled: boolean;
  onSave: (detail: PaseoMemoryDetail, draft: MemoryDetailDraft) => Promise<void>;
  onDelete: (detail: PaseoMemoryDetail) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(() => draftFromDetail(detail));
  useEffect(() => setDraft(draftFromDetail(detail)), [detail]);
  const toggle = useCallback(() => setExpanded((value) => !value), []);
  const save = useCallback(() => onSave(detail, draft), [detail, draft, onSave]);
  const remove = useCallback(() => onDelete(detail), [detail, onDelete]);
  const categoryDisplay = useMemo(
    () => ({ label: memoryCategoryLabel(draft.category) }),
    [draft.category],
  );
  const scopeDisplay = useMemo(
    () => ({ label: memoryScopeLabel({ type: draft.scopeType, id: draft.scopeId || undefined }) }),
    [draft.scopeId, draft.scopeType],
  );
  const statusDisplay = useMemo(
    () => ({
      label:
        MEMORY_DETAIL_STATUS_OPTIONS.find((option) => option.value === draft.status)?.label ??
        draft.status,
    }),
    [draft.status],
  );
  const accessibilityState = useMemo(() => ({ expanded }), [expanded]);
  const setTitle = useCallback(
    (title: string) => setDraft((current) => ({ ...current, title })),
    [],
  );
  const setCategory = useCallback(
    (category: PaseoMemoryDetail["category"]) => setDraft((current) => ({ ...current, category })),
    [],
  );
  const setStatus = useCallback(
    (status: NonNullable<PaseoMemoryDetail["status"]>) =>
      setDraft((current) => ({ ...current, status })),
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
  const setContent = useCallback(
    (content: string) => setDraft((current) => ({ ...current, content })),
    [],
  );

  return (
    <View style={settingsStyles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        onPress={toggle}
        style={rowPressStyle}
      >
        {expanded ? (
          <ThemedChevronDown size={16} uniProps={mutedIconMapping} />
        ) : (
          <ThemedChevronRight size={16} uniProps={mutedIconMapping} />
        )}
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>{detail.title}</Text>
          <Text style={settingsStyles.rowHint}>
            {memoryCategoryLabel(detail.category)} · {memoryScopeLabel(detail.scope)} ·{" "}
            {memoryStatus(detail)} · {(detail.importance ?? 0.5).toFixed(2)}
          </Text>
          <Text numberOfLines={expanded ? undefined : 2} style={styles.preview}>
            {detail.content}
          </Text>
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.editor}>
          <Field label="标题">
            <FormTextInput value={draft.title} onChangeText={setTitle} editable={!disabled} />
          </Field>
          <View style={styles.fieldGrid}>
            <View style={styles.gridItem}>
              <SelectField
                label="分类"
                value={draft.category}
                selectedDisplay={categoryDisplay}
                options={MEMORY_CATEGORY_OPTIONS}
                onChange={setCategory}
                placeholder="选择分类"
                emptyText="没有可用分类"
                disabled={disabled}
              />
            </View>
            <View style={styles.gridItem}>
              <SelectField
                label="状态"
                value={draft.status}
                selectedDisplay={statusDisplay}
                options={MEMORY_DETAIL_STATUS_OPTIONS}
                onChange={setStatus}
                placeholder="选择状态"
                emptyText="没有可用状态"
                disabled={disabled}
              />
            </View>
          </View>
          <View style={styles.fieldGrid}>
            <View style={styles.gridItem}>
              <SelectField
                label="作用域"
                value={draft.scopeType}
                selectedDisplay={scopeDisplay}
                options={MEMORY_SCOPE_OPTIONS}
                onChange={setScopeType}
                placeholder="选择作用域"
                emptyText="没有可用作用域"
                disabled={disabled}
              />
            </View>
            {draft.scopeType === "global" ? null : (
              <View style={styles.gridItem}>
                <Field label="作用域 ID">
                  <FormTextInput
                    value={draft.scopeId}
                    onChangeText={setScopeId}
                    editable={!disabled}
                    placeholder="Project、助手或 Workspace ID"
                  />
                </Field>
              </View>
            )}
          </View>
          <Field label="关键词" hint="使用英文逗号分隔关键词">
            <FormTextInput value={draft.keywords} onChangeText={setKeywords} editable={!disabled} />
          </Field>
          <View style={styles.fieldGrid}>
            <View style={styles.gridItem}>
              <Field label="重要度" hint="0 到 1">
                <FormTextInput
                  value={draft.importance}
                  onChangeText={setImportance}
                  editable={!disabled}
                  keyboardType="decimal-pad"
                />
              </Field>
            </View>
            <View style={styles.gridItem}>
              <Field label="有效期" hint="ISO 日期时间，留空表示长期有效">
                <FormTextInput
                  value={draft.validUntil}
                  onChangeText={setValidUntil}
                  editable={!disabled}
                  placeholder="2027-01-01T00:00:00Z"
                />
              </Field>
            </View>
          </View>
          <Field label="记忆内容">
            <View style={styles.textAreaCard}>
              <SettingsTextArea
                accessibilityLabel={`记忆详情 ${detail.title}`}
                value={draft.content}
                onChangeText={setContent}
                style={styles.detailInput}
              />
            </View>
          </Field>
          <Text style={styles.provenance}>
            Used {detail.useCount ?? 0} times · helpful {detail.helpfulCount ?? 0} · unhelpful{" "}
            {detail.unhelpfulCount ?? 0} · {detail.sourceRefs?.length ?? 0} sources
          </Text>
          <Text selectable style={styles.path}>
            {detail.path}
          </Text>
          <View style={styles.actions}>
            <Button
              size="sm"
              disabled={disabled || !draft.title.trim() || !draft.content.trim()}
              onPress={save}
            >
              Save
            </Button>
            <Button size="sm" variant="outline" disabled={disabled} onPress={remove}>
              Delete
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export type { MemoryDetailDraft };

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  headerPressed: {
    backgroundColor: theme.colors.surface2,
  },
  preview: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.45),
    marginTop: theme.spacing[1],
  },
  editor: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[4],
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
  textAreaCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
    overflow: "hidden",
  },
  detailInput: {
    minHeight: 180,
  },
  provenance: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  path: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
