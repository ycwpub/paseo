import { useCallback, useMemo } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { PaseoMemoryDetail } from "@getpaseo/protocol/messages";
import { settingsStyles } from "@/styles/settings";
import type { Theme } from "@/styles/theme";
import {
  MEMORY_DETAIL_STATUS_OPTIONS,
  memoryCategoryLabel,
  memoryScopesLabel,
  memoryStatus,
} from "./memory-form-options";
import { memoryStoragePaths } from "./memory-storage-paths";

const ThemedChevronRight = withUnistyles(ChevronRight);
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function rowStyle({ pressed }: PressableStateCallbackType) {
  return [styles.row, pressed ? styles.rowPressed : null];
}

export function MemoryDetailRow({
  detail,
  onPress,
}: {
  detail: PaseoMemoryDetail;
  onPress: (detail: PaseoMemoryDetail) => void;
}) {
  const status = memoryStatus(detail);
  const statusLabel = useMemo(
    () => MEMORY_DETAIL_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status,
    [status],
  );
  const handlePress = useCallback(() => onPress(detail), [detail, onPress]);
  const storagePaths = useMemo(() => memoryStoragePaths(detail), [detail]);

  return (
    <View style={settingsStyles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={detail.title}
        onPress={handlePress}
        style={rowStyle}
      >
        <View style={styles.content}>
          <Text style={settingsStyles.rowTitle}>{detail.title}</Text>
          <Text style={styles.metadata}>
            {memoryCategoryLabel(detail.category)} · {memoryScopesLabel(detail)} · {statusLabel} ·
            重要度 {(detail.importance ?? 0.5).toFixed(2)}
          </Text>
          <Text numberOfLines={3} style={styles.preview}>
            {detail.content}
          </Text>
          <View style={styles.paths}>
            <Text style={styles.pathLabel}>存储路径</Text>
            {storagePaths.map((path) => (
              <Text key={path} selectable style={styles.path}>
                {path}
              </Text>
            ))}
          </View>
        </View>
        <ThemedChevronRight size={18} uniProps={mutedIconMapping} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  rowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  content: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  metadata: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  preview: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.45),
  },
  paths: {
    gap: theme.spacing[1],
    marginTop: theme.spacing[1],
  },
  pathLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  path: {
    color: theme.colors.foregroundExtraMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
  },
}));
