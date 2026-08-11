import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Wrench } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import type { StreamItem } from "@/types/stream";
import { collectTurnHookCalls, type TurnHookCall } from "./turn-hook-summary-model";

const ThemedWrench = withUnistyles(Wrench);
const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const HookCallMenuItem = memo(function HookCallMenuItem({ call }: { call: TurnHookCall }) {
  const trailing = useMemo(() => <Text style={styles.count}>{call.count}</Text>, [call.count]);
  return (
    <DropdownMenuItem closeOnSelect={false} trailing={trailing}>
      {call.name}
    </DropdownMenuItem>
  );
});

export const TurnHookSummary = memo(function TurnHookSummary({ items }: { items: StreamItem[] }) {
  const { t } = useTranslation();
  const calls = useMemo(() => collectTurnHookCalls(items), [items]);
  const total = useMemo(() => calls.reduce((sum, call) => sum + call.count, 0), [calls]);
  const tooltip = t("agentStream.hooks.calls", { count: total });

  if (calls.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
        <TooltipTrigger asChild>
          <View style={styles.triggerSlot} collapsable={false}>
            <DropdownMenuTrigger
              accessibilityLabel={tooltip}
              accessibilityRole="button"
              style={styles.trigger}
              testID="turn-hook-summary-trigger"
            >
              {({ hovered, open }) => (
                <>
                  <ThemedWrench
                    size={ICON_SIZE.sm}
                    uniProps={hovered || open ? foregroundMapping : mutedMapping}
                  />
                  <Text style={styles.total}>{total}</Text>
                </>
              )}
            </DropdownMenuTrigger>
          </View>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" offset={8}>
          <Text style={styles.tooltipText}>{tooltip}</Text>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" minWidth={220} side="bottom">
        <DropdownMenuLabel>{t("agentStream.hooks.title")}</DropdownMenuLabel>
        {calls.map((call) => (
          <HookCallMenuItem key={call.name} call={call} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

const styles = StyleSheet.create((theme) => ({
  triggerSlot: {
    alignSelf: "center",
  },
  trigger: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    padding: theme.spacing[1],
  },
  total: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontVariant: ["tabular-nums"],
  },
  count: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontVariant: ["tabular-nums"],
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
}));
