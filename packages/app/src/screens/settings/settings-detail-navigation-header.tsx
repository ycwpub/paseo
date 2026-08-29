import React, { type ReactNode } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";

const ThemedArrowLeft = withUnistyles(ArrowLeft);
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface SettingsDetailNavigationHeaderProps {
  title: string;
  titleAccessory?: ReactNode;
  onBack: () => void;
}

function backPressableStyle({
  hovered,
  pressed,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.backButton, (hovered || pressed) && styles.backButtonActive];
}

/**
 * Canonical header for secondary and tertiary settings pages:
 * a single back icon followed by the current page title.
 */
export function SettingsDetailNavigationHeader({
  title,
  titleAccessory,
  onBack,
}: SettingsDetailNavigationHeaderProps) {
  return (
    <View style={styles.container} testID="settings-detail-navigation-header">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回"
        onPress={onBack}
        style={backPressableStyle}
        testID="settings-detail-back"
      >
        <ThemedArrowLeft size={18} uniProps={mutedIconMapping} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1} testID="settings-detail-header-title">
        {title}
      </Text>
      {titleAccessory}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  backButton: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  backButtonActive: {
    backgroundColor: theme.colors.surface2,
  },
  title: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: theme.fontSize.base,
    fontWeight: {
      xs: "400",
      md: "300",
    },
    color: theme.colors.foreground,
  },
}));
