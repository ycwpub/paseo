import { useCallback, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type PressableStateCallbackType,
} from "react-native";
import { FolderPlus } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isNative, isWeb } from "@/constants/platform";
import { useHostFeature } from "@/runtime/host-features";
import { useAddProjectFlowStore } from "@/stores/add-project-flow-store";
import type { Theme } from "@/styles/theme";

interface SidebarProjectChildActionProps {
  target: { serverId: string; projectId: string } | null;
  displayName: string;
  visible: boolean;
  projectViewKey: string;
}

const ThemedFolderPlus = withUnistyles(FolderPlus);

const foregroundColorMapping = (theme: Theme) => ({
  color: theme.colors.foreground,
});

const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

export function SidebarProjectChildAction({
  target,
  displayName,
  visible,
  projectViewKey,
}: SidebarProjectChildActionProps) {
  const [hovered, setHovered] = useState(false);
  const supportsProjectHierarchy = useHostFeature(target?.serverId ?? "", "projectHierarchy");
  const openAddProject = useAddProjectFlowStore((state) => state.openRequest);
  const available = target !== null && supportsProjectHierarchy;
  const shown = available && (visible || isNative);

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (!target) return;
      openAddProject({
        preferredHostId: target.serverId,
        parentProjectId: target.projectId,
      });
    },
    [openAddProject, target],
  );
  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);
  const pressableStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.button,
      !shown && styles.hidden,
      (hovered || pressed) && styles.hovered,
    ],
    [hovered, shown],
  );

  if (!available) {
    return null;
  }

  const label = `为 ${displayName} 创建子 Project`;
  return (
    <View style={styles.slot} pointerEvents={shown ? "auto" : "none"}>
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild disabled={!shown}>
          <Pressable
            style={pressableStyle}
            onPress={handlePress}
            onHoverIn={handleHoverIn}
            onHoverOut={handleHoverOut}
            accessibilityRole={isWeb ? undefined : "button"}
            accessibilityLabel={label}
            testID={`sidebar-project-create-child-${projectViewKey}`}
          >
            <ThemedFolderPlus
              size={15}
              uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
            />
          </Pressable>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" offset={8}>
          <Text style={styles.tooltipText}>创建子 Project</Text>
        </TooltipContent>
      </Tooltip>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  slot: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  button: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  hidden: {
    opacity: 0,
  },
  hovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
}));
