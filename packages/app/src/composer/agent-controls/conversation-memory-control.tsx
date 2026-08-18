import { useCallback, useMemo, useState } from "react";
import { Pressable, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { BrainCircuit } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHostFeature } from "@/runtime/host-features";
import { MemoryPolicyEditor } from "@/memory/policy-editor";
import type { Theme } from "@/styles/theme";

const ThemedBrainCircuit = withUnistyles(BrainCircuit);
const brainIconMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

export function ConversationMemoryControl({
  serverId,
  agentId,
}: {
  serverId: string;
  agentId: string;
}) {
  const { t } = useTranslation();
  const isSupported = useHostFeature(serverId, "memoryPolicies");
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const target = useMemo(() => ({ type: "conversation" as const, id: agentId }), [agentId]);
  const header = useMemo<SheetHeader>(() => ({ title: t("agentControls.memory.title") }), [t]);
  const copy = useMemo(
    () => ({
      enabledTitle: t("agentControls.memory.enabledTitle"),
      enabledHint: t("agentControls.memory.enabledHint"),
      instructionsTitle: t("agentControls.memory.instructionsTitle"),
      instructionsHint: t("agentControls.memory.instructionsHint"),
      instructionsPlaceholder: t("agentControls.memory.instructionsPlaceholder"),
      save: t("agentControls.memory.save"),
      saving: t("agentControls.memory.saving"),
      saved: t("agentControls.memory.saved"),
      saveError: t("agentControls.memory.saveError"),
    }),
    [t],
  );
  const triggerStyle = useCallback(
    ({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
      styles.trigger,
      hovered && styles.triggerHovered,
      pressed && styles.triggerPressed,
    ],
    [],
  );

  if (!isSupported) return null;

  return (
    <>
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild>
          <Pressable
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel={t("agentControls.memory.open")}
            testID="conversation-memory-control"
            style={triggerStyle}
          >
            <ThemedBrainCircuit size={16} uniProps={brainIconMapping} />
          </Pressable>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" offset={8}>
          <Text style={styles.tooltipText}>{t("agentControls.memory.open")}</Text>
        </TooltipContent>
      </Tooltip>
      <AdaptiveModalSheet
        header={header}
        visible={visible}
        onClose={close}
        testID="conversation-memory-sheet"
      >
        <MemoryPolicyEditor
          serverId={serverId}
          target={target}
          copy={copy}
          testID="conversation-memory-policy"
        />
      </AdaptiveModalSheet>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    width: 30,
    height: 30,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
  triggerPressed: {
    backgroundColor: theme.colors.surface3,
  },
  tooltipText: {
    color: theme.colors.popoverForeground,
    fontSize: theme.fontSize.sm,
  },
}));
