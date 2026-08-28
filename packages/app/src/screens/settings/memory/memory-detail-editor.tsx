import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PaseoMemoryDetail, PaseoMemoryScope } from "@getpaseo/protocol/messages";
import { SettingsTextArea } from "@/components/settings-textarea";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import {
  MEMORY_CATEGORY_OPTIONS,
  MEMORY_DETAIL_STATUS_OPTIONS,
  MEMORY_SCOPE_OPTIONS,
  memoryCategoryLabel,
  memoryScopeLabel,
} from "./memory-form-options";
import { memoryDetailDraft, type MemoryDetailDraft } from "./memory-detail-draft";

export function MemoryDetailEditor({
  detail,
  disabled,
  scopeEditable = true,
  onSave,
  onDelete,
  onTitleChange,
}: {
  detail: PaseoMemoryDetail;
  disabled: boolean;
  scopeEditable?: boolean;
  onSave: (detail: PaseoMemoryDetail, draft: MemoryDetailDraft) => Promise<void>;
  onDelete: (detail: PaseoMemoryDetail) => Promise<void>;
  onTitleChange?: (title: string) => void;
}) {
  const [draft, setDraft] = useState(() => memoryDetailDraft(detail));

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
  const setTitle = useCallback(
    (title: string) => {
      setDraft((current) => ({ ...current, title }));
      onTitleChange?.(title);
    },
    [onTitleChange],
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
  const setAdditionalScopes = useCallback(
    (additionalScopes: string) => setDraft((current) => ({ ...current, additionalScopes })),
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
      {scopeEditable ? (
        <>
          <View style={styles.fieldGrid}>
            <View style={styles.gridItem}>
              <SelectField
                label="主要作用域"
                value={draft.scopeType}
                selectedDisplay={scopeDisplay}
                options={MEMORY_SCOPE_OPTIONS}
                onChange={setScopeType}
                placeholder="选择主要作用域"
                emptyText="没有可用作用域"
                disabled={disabled}
              />
            </View>
            {draft.scopeType === "global" ? null : (
              <View style={styles.gridItem}>
                <Field label="主要作用域 ID">
                  <FormTextInput
                    value={draft.scopeId}
                    onChangeText={setScopeId}
                    editable={!disabled}
                    placeholder="项目、助手或工作区 ID"
                  />
                </Field>
              </View>
            )}
          </View>
          <Field
            label="其他作用域"
            hint="可同时保存到多层记忆；使用英文逗号分隔，例如 project:prj_x, assistant:asst_x, global"
          >
            <FormTextInput
              value={draft.additionalScopes}
              onChangeText={setAdditionalScopes}
              editable={!disabled}
              placeholder="project:prj_x, assistant:asst_x, global"
            />
          </Field>
        </>
      ) : null}
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
            accessibilityLabel={`记忆详情 ${draft.title}`}
            value={draft.content}
            onChangeText={setContent}
            style={styles.detailInput}
          />
        </View>
      </Field>
      <Text style={styles.provenance}>
        已使用 {detail.useCount ?? 0} 次 · 有帮助 {detail.helpfulCount ?? 0} · 无帮助{" "}
        {detail.unhelpfulCount ?? 0} · {detail.sourceRefs?.length ?? 0} 个来源
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
          保存
        </Button>
        <Button size="sm" variant="outline" disabled={disabled} onPress={remove}>
          删除
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  editor: {
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
    minHeight: 320,
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
