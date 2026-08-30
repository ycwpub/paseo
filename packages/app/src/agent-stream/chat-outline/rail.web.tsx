import { memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PointerEvent as RNPointerEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useReducedMotion } from "react-native-reanimated";
import { useContainerWidthBelow } from "@/hooks/use-container-width";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { createChatOutlineHoverIntent } from "./hover-intent";
import { promptTickMagnification } from "./model";
import type { ChatOutlineRailProps } from "./rail";

// Hover tracking lives on the rail and the slots, never on the Pressable inside them:
// magnifying a slot must not move the box the pointer is resting on. See docs/hover.md.
const RAIL_WIDTH = 36;
const SLOT_HEIGHT = 8;
// Keep the rail available in ordinary desktop windows and moderately sized split panes.
// The preview is transient and overlays the transcript, so reserving almost 1,000 px before
// showing navigation made the feature disappear in the layouts where it is most useful.
const MIN_PANEL_WIDTH = 640;
const RESTING_PILL_HEIGHT = 2;
const MAGNIFIED_PILL_HEIGHT = 4;
const RESTING_PILL_WIDTH = 10;
const ACTIVE_PILL_WIDTH = 22;
const MAGNIFIED_PILL_WIDTH = 30;
const PREVIEW_WIDTH = 380;
const PREVIEW_HEIGHT = 188;
const PREVIEW_GAP = 6;

export const ChatOutlineRail = memo(function ChatOutlineRail({
  prompts,
  activePrompt,
  model,
  onJumpToPrompt,
}: ChatOutlineRailProps) {
  const { t, i18n } = useTranslation();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const activeSeq = useSyncExternalStore(activePrompt.subscribe, activePrompt.getActiveSeq);
  const prefersReducedMotion = useReducedMotion();
  const { onLayout, isBelow: isPanelNarrow } = useContainerWidthBelow(MIN_PANEL_WIDTH);

  const hoverIntent = useMemo(
    () =>
      createChatOutlineHoverIntent({
        activate: setHoveredIndex,
        schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
        cancel: (timerId) => window.clearTimeout(timerId),
      }),
    [],
  );
  const handlePointerEnterTick = useCallback(
    (index: number) => hoverIntent.pointAt(index),
    [hoverIntent],
  );
  const handlePointerEnterRail = useCallback(
    (event: RNPointerEvent) => {
      hoverIntent.enter({ x: event.nativeEvent.clientX, y: event.nativeEvent.clientY });
    },
    [hoverIntent],
  );
  const handlePointerMoveRail = useCallback(
    (event: RNPointerEvent) => {
      hoverIntent.move({ x: event.nativeEvent.clientX, y: event.nativeEvent.clientY });
    },
    [hoverIntent],
  );
  const handlePointerLeaveRail = useCallback(() => hoverIntent.leave(), [hoverIntent]);
  useEffect(() => () => hoverIntent.dispose(), [hoverIntent]);
  useEffect(() => {
    if (isPanelNarrow) hoverIntent.leave();
  }, [hoverIntent, isPanelNarrow]);
  const handleFocusChange = useCallback((index: number, focused: boolean) => {
    setFocusedIndex((current) => {
      if (focused) return index;
      return current === index ? null : current;
    });
  }, []);

  // The pointer owns the magnified band while it is on the rail; keyboard focus drives the
  // same band and the same preview once the pointer leaves.
  const attentionIndex = hoveredIndex ?? focusedIndex;

  if (prompts.length === 0) return null;

  return (
    <View style={styles.panelMeasure} pointerEvents="box-none" onLayout={onLayout}>
      {isPanelNarrow ? null : (
        <View
          style={styles.rail}
          role="tablist"
          testID="chat-outline-rail"
          onPointerEnter={handlePointerEnterRail}
          onPointerMove={handlePointerMoveRail}
          onPointerLeave={handlePointerLeaveRail}
        >
          {prompts.map((prompt, index) => (
            <ChatOutlineTick
              key={prompt.seq}
              index={index}
              promptCount={prompts.length}
              seq={prompt.seq}
              preview={prompt.preview}
              answerPreview={prompt.answerPreview}
              model={model}
              timestamp={prompt.timestamp}
              locale={i18n.resolvedLanguage ?? i18n.language}
              label={`${index + 1}/${prompts.length}: ${prompt.preview}`}
              questionLabel={t("agentStream.chatOutline.question")}
              answerLabel={t("agentStream.chatOutline.answer")}
              modelLabel={t("agentStream.chatOutline.model")}
              timeLabel={t("agentStream.chatOutline.time")}
              pendingAnswerLabel={t("agentStream.chatOutline.pendingAnswer")}
              unknownModelLabel={t("agentStream.chatOutline.unknownModel")}
              isActive={prompt.seq === activeSeq}
              hasAttention={index === attentionIndex}
              magnification={
                prefersReducedMotion || attentionIndex === null
                  ? 0
                  : promptTickMagnification(index - attentionIndex)
              }
              onHover={handlePointerEnterTick}
              onFocusChange={handleFocusChange}
              onJumpToPrompt={onJumpToPrompt}
            />
          ))}
        </View>
      )}
    </View>
  );
});

interface ChatOutlineTickProps {
  index: number;
  promptCount: number;
  seq: number;
  preview: string;
  answerPreview?: string;
  model: string | null;
  timestamp: string;
  locale: string;
  label: string;
  questionLabel: string;
  answerLabel: string;
  modelLabel: string;
  timeLabel: string;
  pendingAnswerLabel: string;
  unknownModelLabel: string;
  isActive: boolean;
  hasAttention: boolean;
  magnification: number;
  onHover: (index: number) => void;
  onFocusChange: (index: number, focused: boolean) => void;
  onJumpToPrompt: (seq: number) => void;
}

const ChatOutlineTick = memo(function ChatOutlineTick({
  index,
  promptCount,
  seq,
  preview,
  answerPreview,
  model,
  timestamp,
  locale,
  label,
  questionLabel,
  answerLabel,
  modelLabel,
  timeLabel,
  pendingAnswerLabel,
  unknownModelLabel,
  isActive,
  hasAttention,
  magnification,
  onHover,
  onFocusChange,
  onJumpToPrompt,
}: ChatOutlineTickProps) {
  const formattedTime = useMemo(
    () => formatChatOutlineTimestamp(timestamp, locale),
    [locale, timestamp],
  );
  const handlePress = useCallback(() => {
    onJumpToPrompt(seq);
    onFocusChange(index, false);
  }, [index, onFocusChange, onJumpToPrompt, seq]);
  const handlePointerEnter = useCallback(() => onHover(index), [index, onHover]);
  const handleFocus = useCallback(() => onFocusChange(index, true), [index, onFocusChange]);
  const handleBlur = useCallback(() => onFocusChange(index, false), [index, onFocusChange]);

  // The pill grows inside a slot that never moves, so magnification can never pull the hit
  // target out from under the pointer.
  const restingWidth = isActive ? ACTIVE_PILL_WIDTH : RESTING_PILL_WIDTH;
  const pillWidth = restingWidth + magnification * (MAGNIFIED_PILL_WIDTH - restingWidth);
  const pillHeight =
    RESTING_PILL_HEIGHT + magnification * (MAGNIFIED_PILL_HEIGHT - RESTING_PILL_HEIGHT);

  return (
    <View style={styles.slot} onPointerEnter={handlePointerEnter}>
      <Pressable
        style={styles.target}
        onPress={handlePress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        accessibilityRole="tab"
        aria-selected={isActive}
        accessibilityLabel={label}
        testID={`chat-outline-tick-${seq}`}
      >
        <View
          style={[
            styles.pill,
            isActive && styles.pillActive,
            hasAttention && styles.pillAttention,
            inlineUnistylesStyle({ width: pillWidth, height: pillHeight }),
          ]}
        />
      </Pressable>
      {hasAttention ? (
        <View style={styles.preview} pointerEvents="none" aria-hidden testID="chat-outline-preview">
          <View style={styles.previewHeader}>
            <Text style={styles.previewPosition}>
              {index + 1} / {promptCount}
            </Text>
            <Text style={styles.previewTime}>
              {timeLabel} · {formattedTime}
            </Text>
          </View>
          <View style={styles.previewSection}>
            <Text style={styles.previewLabel}>{questionLabel}</Text>
            <Text style={styles.previewText} numberOfLines={2}>
              {preview}
            </Text>
          </View>
          <View style={styles.previewDivider} />
          <View style={styles.previewSection}>
            <Text style={styles.previewLabel}>{answerLabel}</Text>
            <Text
              style={[styles.previewText, !answerPreview && styles.previewPlaceholder]}
              numberOfLines={3}
            >
              {answerPreview || pendingAnswerLabel}
            </Text>
          </View>
          <View style={styles.previewFooter}>
            <Text style={styles.previewMetaLabel}>{modelLabel}</Text>
            <Text style={styles.previewModel} numberOfLines={1}>
              {model || unknownModelLabel}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
});

export function formatChatOutlineTimestamp(timestamp: string, locale: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const styles = StyleSheet.create((theme) => ({
  panelMeasure: {
    position: "absolute",
    inset: 0,
  },
  rail: {
    position: "absolute",
    left: theme.spacing[2],
    top: "8%",
    bottom: "8%",
    width: RAIL_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
  // Slots tile the rail with no gaps, so every pixel of the column belongs to a prompt even
  // when a long conversation squeezes them well below their resting height.
  slot: {
    width: RAIL_WIDTH,
    flexBasis: SLOT_HEIGHT,
    flexShrink: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Pills share one left rail and grow rightward, so magnification reads as a bulge moving
  // with the pointer instead of every tick breathing about its own centre.
  target: {
    width: "100%",
    height: "100%",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingLeft: theme.spacing[1],
    borderRadius: theme.borderRadius.base,
  },
  // At rest the pills use low-emphasis chrome so the column stays readable peripherally
  // without competing with the transcript. Attention is the only foreground state.
  pill: {
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.borderAccent,
    opacity: 0.72,
    transitionProperty: "width, height, background-color",
    transitionDuration: "140ms",
    transitionTimingFunction: "ease-out",
  },
  pillActive: {
    backgroundColor: theme.colors.foreground,
    opacity: 1,
  },
  pillAttention: {
    backgroundColor: theme.colors.foreground,
    opacity: 1,
  },
  preview: {
    position: "absolute",
    left: RAIL_WIDTH + PREVIEW_GAP,
    top: "50%",
    marginTop: -PREVIEW_HEIGHT / 2,
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
    padding: theme.spacing[3],
    gap: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    ...theme.shadow.md,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  previewPosition: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  previewTime: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  previewSection: {
    gap: theme.spacing[1],
  },
  previewLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  previewText: {
    fontSize: theme.fontSize.sm,
    lineHeight: 19,
    color: theme.colors.foreground,
  },
  previewPlaceholder: {
    color: theme.colors.foregroundMuted,
  },
  previewDivider: {
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
  },
  previewFooter: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingTop: theme.spacing[1],
  },
  previewMetaLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  previewModel: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
}));
