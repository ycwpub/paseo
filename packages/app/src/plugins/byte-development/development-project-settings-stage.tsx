import { useCallback, useMemo } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DEVELOPMENT_PROJECT_SETTINGS_STAGE } from "./development-project-settings-stage-model";

export function DevelopmentProjectSettingsStage({
  disabled,
  onPress,
}: {
  disabled: boolean;
  onPress: () => void;
}) {
  const accessibilityState = useMemo(() => ({ disabled }), [disabled]);
  const handlePress = useCallback(() => {
    if (!disabled) onPress();
  }, [disabled, onPress]);
  const itemStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.stageItem,
      disabled && styles.stageItemDisabled,
      (hovered || pressed) && !disabled && styles.stageItemHovered,
    ],
    [disabled],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="打开 Project 设置"
      accessibilityHint={DEVELOPMENT_PROJECT_SETTINGS_STAGE.description}
      accessibilityState={accessibilityState}
      disabled={disabled}
      onPress={handlePress}
      style={itemStyle}
      testID="development-stage-project-settings"
    >
      <Text style={styles.stageIndex}>1</Text>
      <View style={styles.stageContent}>
        <Text style={styles.stageLabel}>{DEVELOPMENT_PROJECT_SETTINGS_STAGE.label}</Text>
        <Text numberOfLines={1} style={styles.stageDescription}>
          {disabled ? "当前流程未关联 Project" : DEVELOPMENT_PROJECT_SETTINGS_STAGE.description}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  stageItem: {
    minWidth: 130,
    flexGrow: 1,
    flexBasis: 130,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderColor: `${theme.colors.accent}88`,
    borderRadius: theme.borderRadius.md,
    backgroundColor: `${theme.colors.accent}0D`,
  },
  stageItemHovered: {
    backgroundColor: `${theme.colors.accent}18`,
  },
  stageItemDisabled: {
    opacity: 0.55,
  },
  stageIndex: {
    width: 20,
    height: 20,
    textAlign: "center",
    lineHeight: 20,
    borderRadius: theme.borderRadius.full,
    color: theme.colors.accentForeground,
    backgroundColor: theme.colors.accent,
    fontSize: theme.fontSize.xs,
  },
  stageContent: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  stageLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  stageDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: 10,
  },
}));
