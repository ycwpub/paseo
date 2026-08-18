import React, { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { Brain, ChevronDown, ChevronRight } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { PaseoMemoryDetail, PaseoMemoryState } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/styles/theme";

const ThemedBrain = withUnistyles(Brain);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function triggerStyle({ pressed }: PressableStateCallbackType) {
  return [styles.trigger, pressed ? styles.triggerPressed : null];
}

function scopeLabel(detail: PaseoMemoryDetail): string {
  if (!detail.scope || detail.scope.type === "global") return "Global";
  return `${detail.scope.type}:${detail.scope.id}`;
}

type MemoryFeedbackValue = "helpful" | "unhelpful" | "outdated" | "incorrect";

function MemorySourceRow({
  detail,
  bordered,
  isMutating,
  onFeedback,
}: {
  detail: PaseoMemoryDetail;
  bordered: boolean;
  isMutating: boolean;
  onFeedback: (id: string, value: MemoryFeedbackValue) => Promise<void>;
}) {
  const helpful = useCallback(() => void onFeedback(detail.id, "helpful"), [detail.id, onFeedback]);
  const unhelpful = useCallback(
    () => void onFeedback(detail.id, "unhelpful"),
    [detail.id, onFeedback],
  );
  const outdated = useCallback(
    () => void onFeedback(detail.id, "outdated"),
    [detail.id, onFeedback],
  );
  const incorrect = useCallback(
    () => void onFeedback(detail.id, "incorrect"),
    [detail.id, onFeedback],
  );
  const updatedDate = useMemo(
    () => new Date(detail.updatedAt).toLocaleDateString(),
    [detail.updatedAt],
  );
  return (
    <View style={[styles.memoryRow, bordered ? styles.memoryRowBorder : null]}>
      <View style={styles.memoryHeader}>
        <Text style={styles.memoryTitle}>{detail.title}</Text>
        <Text style={styles.memoryMeta}>
          {scopeLabel(detail)} · updated {updatedDate}
        </Text>
      </View>
      <Text style={styles.memoryContent}>{detail.content}</Text>
      <View style={styles.feedback}>
        <Button size="xs" variant="ghost" disabled={isMutating} onPress={helpful}>
          Helpful
        </Button>
        <Button size="xs" variant="ghost" disabled={isMutating} onPress={unhelpful}>
          Not useful
        </Button>
        <Button size="xs" variant="ghost" disabled={isMutating} onPress={outdated}>
          Outdated
        </Button>
        <Button size="xs" variant="ghost" disabled={isMutating} onPress={incorrect}>
          Incorrect
        </Button>
      </View>
    </View>
  );
}

export function TurnMemorySources({
  agentId,
  assistantMessageId,
  memory,
  isMutating,
  error,
  onFeedback,
}: {
  agentId: string;
  assistantMessageId?: string;
  memory: PaseoMemoryState | null;
  isMutating: boolean;
  error: string | null;
  onFeedback: (
    id: string,
    value: "helpful" | "unhelpful" | "outdated" | "incorrect",
  ) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const usage = useMemo(() => {
    if (!assistantMessageId) return null;
    return (
      memory?.recentUsages
        ?.toReversed()
        .find(
          (candidate) =>
            candidate.agentId === agentId && candidate.assistantMessageId === assistantMessageId,
        ) ?? null
    );
  }, [agentId, assistantMessageId, memory?.recentUsages]);
  const details = useMemo(() => {
    if (!usage || !memory) return [];
    const detailById = new Map(memory.details.map((detail) => [detail.id, detail]));
    return usage.memoryIds.flatMap((id) => {
      const detail = detailById.get(id);
      return detail ? [detail] : [];
    });
  }, [memory, usage]);
  const toggle = useCallback(() => setExpanded((value) => !value), []);
  const accessibilityState = useMemo(() => ({ expanded }), [expanded]);

  if (!memory?.settings.enabled || memory.settings.showSources === false || details.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        onPress={toggle}
        style={triggerStyle}
        testID="turn-memory-sources-trigger"
      >
        <ThemedBrain size={14} uniProps={mutedIconMapping} />
        <Text style={styles.triggerText}>Referenced {details.length} memories</Text>
        {expanded ? (
          <ThemedChevronDown size={14} uniProps={mutedIconMapping} />
        ) : (
          <ThemedChevronRight size={14} uniProps={mutedIconMapping} />
        )}
      </Pressable>
      {expanded ? (
        <View style={styles.panel}>
          {details.map((detail, index) => (
            <MemorySourceRow
              key={detail.id}
              detail={detail}
              bordered={index > 0}
              isMutating={isMutating}
              onFeedback={onFeedback}
            />
          ))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignSelf: "stretch",
    gap: theme.spacing[2],
  },
  trigger: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  triggerPressed: {
    backgroundColor: theme.colors.surface2,
  },
  triggerText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  panel: {
    width: "100%",
    maxWidth: 720,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    overflow: "hidden",
  },
  memoryRow: {
    padding: theme.spacing[3],
    gap: theme.spacing[2],
  },
  memoryRowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  memoryHeader: {
    gap: theme.spacing[1],
  },
  memoryTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  memoryMeta: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
  memoryContent: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.45),
  },
  feedback: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[3],
  },
}));
