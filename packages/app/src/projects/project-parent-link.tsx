import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { buildProjectSettingsRoute } from "@/utils/host-routes";

export interface ProjectParentLinkProps {
  serverId: string;
  parentProjectId: string | null;
}

export function ProjectParentLink({ serverId, parentProjectId }: ProjectParentLinkProps) {
  const { t } = useTranslation();
  const normalizedParentProjectId = parentProjectId?.trim() ?? "";
  const handlePress = useCallback(() => {
    if (!normalizedParentProjectId) return;
    router.navigate(buildProjectSettingsRoute(serverId, normalizedParentProjectId));
  }, [normalizedParentProjectId, serverId]);
  const linkStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [styles.container, pressed && styles.pressed],
    [],
  );

  if (!normalizedParentProjectId) return null;

  const accessibilityLabel = `${t("settings.project.parentProjectId")}: ${normalizedParentProjectId}`;

  return (
    <Pressable
      testID="project-parent-link"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      style={linkStyle}
    >
      <View style={styles.text}>
        <Text style={styles.label}>{t("settings.project.parentProjectId")}:</Text>
        <Text style={styles.projectId} selectable>
          {normalizedParentProjectId}
        </Text>
      </View>
      <ChevronRight size={14} color={styles.icon.color} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    marginHorizontal: -theme.spacing[1],
    borderRadius: theme.borderRadius.sm,
  },
  pressed: {
    opacity: theme.opacity[50],
    backgroundColor: theme.colors.surface2,
  },
  text: {
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  projectId: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
  },
  icon: {
    color: theme.colors.foregroundMuted,
  },
}));
