import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { formatDuration } from "@/utils/time";

interface ProcessingDisclosureProps {
  expanded: boolean;
  durationMs?: number;
  turnId: string;
  isActive: boolean;
  onToggle: (turnId: string, isActive: boolean) => void;
}

export const ProcessingDisclosure = memo(function ProcessingDisclosure({
  expanded,
  durationMs,
  turnId,
  isActive,
  onToggle,
}: ProcessingDisclosureProps) {
  const { t } = useTranslation();
  const duration = durationMs === undefined ? null : formatDuration(durationMs);
  const label = duration
    ? t("agentStream.process.processedWithDuration", { duration })
    : t("agentStream.process.processed");
  const accessibilityState = useMemo(() => ({ expanded }), [expanded]);
  const Icon = expanded ? ChevronDown : ChevronRight;
  const handleToggle = useCallback(() => onToggle(turnId, isActive), [isActive, onToggle, turnId]);

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.trigger}
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        accessibilityLabel={label}
        testID="process-visibility-toggle"
      >
        <Text style={styles.label}>{label}</Text>
        <Icon size={16} color={styles.icon.color} />
      </Pressable>
      <View style={styles.divider} />
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    width: "100%",
    marginBottom: theme.spacing[3],
  },
  trigger: {
    minHeight: 32,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[2],
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  icon: {
    color: theme.colors.foregroundMuted,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: theme.colors.border,
  },
}));
