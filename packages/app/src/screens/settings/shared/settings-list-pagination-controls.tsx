import type { ComponentProps } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { MemoryPaginationControls } from "@/screens/settings/memory/memory-pagination-controls";

export function SettingsListPaginationControls(
  props: ComponentProps<typeof MemoryPaginationControls>,
) {
  return (
    <View style={styles.card}>
      <MemoryPaginationControls {...props} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[3],
    marginTop: theme.spacing[3],
  },
}));
