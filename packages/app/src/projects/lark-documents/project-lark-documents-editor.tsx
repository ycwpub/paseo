import { useCallback, useMemo, useRef } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Plus, X } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { SettingsGroup } from "@/screens/settings/settings-group";
import { settingsStyles } from "@/styles/settings";

const ICON_SIZE = 14;

function ProjectLarkDocumentRow({
  first,
  index,
  value,
  values,
  onChange,
  onRemove,
}: {
  first: boolean;
  index: number;
  value: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  onRemove: (index: number) => void;
}) {
  const handleChange = useCallback(
    (nextValue: string) => {
      onChange(values.map((entry, rowIndex) => (rowIndex === index ? nextValue : entry)));
    },
    [index, onChange, values],
  );
  const handleRemove = useCallback(() => onRemove(index), [index, onRemove]);
  return (
    <View style={[styles.row, first && styles.firstRow]}>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://example.feishu.cn/wiki/..."
        placeholderTextColor={styles.placeholderColor.color}
        style={styles.input}
        value={value}
        onChangeText={handleChange}
        testID={`project-lark-document-${index}`}
      />
      <Pressable
        accessibilityLabel={`删除第 ${index + 1} 个飞书文档`}
        onPress={handleRemove}
        style={styles.removeButton}
      >
        <X size={ICON_SIZE} color={styles.iconColor.color} />
      </Pressable>
    </View>
  );
}

export function ProjectLarkDocumentsEditor({
  values,
  error,
  onChange,
}: {
  values: string[];
  error: string | null;
  onChange: (values: string[]) => void;
}) {
  const nextRowId = useRef(0);
  const rowIds = useRef<string[]>([]);
  while (rowIds.current.length < values.length) {
    rowIds.current.push(`lark-document-${nextRowId.current++}`);
  }
  if (rowIds.current.length > values.length) {
    rowIds.current.length = values.length;
  }
  const add = useCallback(() => onChange([...values, ""]), [onChange, values]);
  const remove = useCallback(
    (index: number) => {
      rowIds.current.splice(index, 1);
      onChange(values.filter((_, rowIndex) => rowIndex !== index));
    },
    [onChange, values],
  );
  const trailing = useMemo(
    () => (
      <Pressable
        accessibilityLabel="添加飞书文档"
        hitSlop={8}
        onPress={add}
        style={settingsStyles.sectionHeaderLink}
        testID="project-lark-document-add"
      >
        <Plus size={ICON_SIZE} color={styles.iconColor.color} />
      </Pressable>
    ),
    [add],
  );
  return (
    <SettingsGroup
      title="飞书文档"
      info="为当前 Project 维护多个飞书或 Lark 文档链接。字节开发流程会自动读取这些链接并作为研发上下文。"
      trailing={trailing}
      testID="project-lark-documents-group"
    >
      <View style={settingsStyles.card}>
        {values.length === 0 ? (
          <View style={settingsStyles.row}>
            <Text style={styles.emptyText}>尚未配置飞书文档。</Text>
          </View>
        ) : (
          values.map((value, index) => (
            <ProjectLarkDocumentRow
              key={rowIds.current[index]}
              first={index === 0}
              index={index}
              value={value}
              values={values}
              onChange={onChange}
              onRemove={remove}
            />
          ))
        )}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </SettingsGroup>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  firstRow: {
    borderTopWidth: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    fontSize: theme.fontSize.sm,
  },
  removeButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[3],
  },
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
  placeholderColor: {
    color: theme.colors.foregroundMuted,
  },
}));
