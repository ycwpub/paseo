import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DiffStat } from "@/components/diff-stat";
import type { ParsedDiffFile } from "@/git/use-diff-query";

interface TurnChangeRowProps {
  cwd: string;
  file: ParsedDiffFile;
  onReview: (cwd: string, path?: string) => void;
}

/**
 * The whole file row is a review target, matching Codex App.
 *
 * Opening the source file from this card creates an ambiguous second action
 * and bypasses the diff surface, so this component deliberately exposes only
 * the file-scoped review interaction.
 */
export const TurnChangeRow = memo(function TurnChangeRow({
  cwd,
  file,
  onReview,
}: TurnChangeRowProps) {
  const { t } = useTranslation();
  const review = useCallback(() => onReview(cwd, file.path), [cwd, file.path, onReview]);
  const rowStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.fileRow,
      pressed ? styles.fileRowPressed : null,
    ],
    [],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("agentStream.changes.reviewFile", { fileName: file.path })}
      onPress={review}
      style={rowStyle}
      testID={`turn-change-row-${file.path}`}
    >
      <Text numberOfLines={2} style={styles.path}>
        {file.path}
      </Text>
      <DiffStat additions={file.additions} deletions={file.deletions} />
    </Pressable>
  );
});

const styles = StyleSheet.create((theme) => ({
  fileRow: {
    minWidth: 0,
    width: "100%",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  fileRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  path: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
