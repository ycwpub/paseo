import { memo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Scissors } from "lucide-react-native";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { getCompactionProgressLabel } from "@/components/message-compaction-progress-label";

export interface StreamCompactionMarkerProps {
  status: "loading" | "completed";
  trigger?: "auto" | "manual";
  preTokens?: number;
}

export const StreamCompactionMarker = memo(function StreamCompactionMarker({
  status,
  trigger,
  preTokens,
}: StreamCompactionMarkerProps) {
  const label = getCompactionProgressLabel({ status, trigger, preTokens });

  return (
    <View style={styles.container}>
      <View style={styles.line} />
      <View style={styles.label}>
        {status === "loading" ? (
          <LoadingSpinner size="small" color="#a1a1aa" />
        ) : (
          <Scissors size={12} color="#a1a1aa" />
        )}
        <Text style={styles.text}>{label}</Text>
      </View>
      <View style={styles.line} />
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[2],
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  label: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  text: {
    fontFamily: theme.fontFamily.ui,
    fontSize: 13,
    color: theme.colors.foregroundMuted,
  },
}));
