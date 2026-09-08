import { Blocks } from "lucide-react-native";
import { Pressable, Text } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Theme } from "@/styles/theme";
import { usePluginSidebarVisibilityStore } from "./visibility-store";

const ThemedBlocks = withUnistyles(Blocks);
const iconColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function HiddenPluginSidebarRestoreButton() {
  const hidden = usePluginSidebarVisibilityStore((state) => state.hidden);
  const show = usePluginSidebarVisibilityStore((state) => state.show);

  if (!hidden) return null;

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityLabel="显示插件区域"
          accessibilityRole="button"
          onPress={show}
          style={styles.button}
          testID="sidebar-show-hidden-plugins"
        >
          <ThemedBlocks size={16} uniProps={iconColorMapping} />
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <Text style={styles.tooltipText}>显示插件区域</Text>
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
  },
  tooltipText: {
    color: theme.colors.popoverForeground,
    fontSize: theme.fontSize.base,
  },
}));
