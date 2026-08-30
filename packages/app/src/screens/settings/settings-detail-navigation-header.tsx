import React, { type ComponentType, type ReactNode } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";

interface SettingsDetailNavigationHeaderProps {
  title: string;
  Icon: ComponentType<{ size: number; color: string }>;
  iconColor: string;
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
 * a plain back affordance, the page icon, and the current page title.
 */
export function SettingsDetailNavigationHeader({
  title,
  Icon,
  iconColor,
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
        <ArrowLeft size={18} color={iconColor} />
      </Pressable>
      <View style={styles.pageIcon} testID="settings-detail-page-icon">
        <Icon size={18} color={iconColor} />
      </View>
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
  },
  backButtonActive: {
    opacity: 0.6,
  },
  pageIcon: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
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
