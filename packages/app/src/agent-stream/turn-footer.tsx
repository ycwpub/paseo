import React, { memo, useCallback, useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { MAX_CONTENT_WIDTH } from "@/constants/layout";
import type { Theme } from "@/styles/theme";
import type { StreamItem } from "@/types/stream";
import type { PaseoMemoryState } from "@getpaseo/protocol/messages";
import {
  collectAssistantTurnContentForStreamRenderStrategy,
  type StreamStrategy,
} from "./strategy";
import { resolveAssistantTurnForkBoundary, type AssistantTurnForkBoundary } from "./turn-boundary";
import {
  AssistantTurnFooter,
  LiveElapsed,
  STREAM_METADATA_FONT_SIZE,
  type AssistantForkTarget,
} from "@/components/message";
import type { TurnFooterHost } from "./layout";
import { AssistantForkMenu } from "@/components/assistant-fork-menu";
import { SyncedLoader } from "@/components/synced-loader";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { collectAssistantTurnItems } from "./turn-items";
import { TurnHookSummary } from "./turn-hook-summary";
import { TurnChanges } from "./turn-changes";
import { TurnMemorySources } from "./turn-memory-sources";
import type { ToastApi } from "@/components/toast-host";

const ThemedSyncedLoader = withUnistyles(SyncedLoader);
const workingIndicatorColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });

export type TurnContentStrategy = StreamStrategy;
export type AssistantTurnForkHandler = (input: {
  target: AssistantForkTarget;
  boundary: AssistantTurnForkBoundary;
}) => Promise<void> | void;
/**
 * Fork handler for the turn that is still streaming. It deliberately takes no
 * boundary: `selectForkContextRows` projects the entire timeline when neither
 * boundary field is given, which is what captures the partially streamed text
 * the user is watching. Pinning a boundary here would silently drop the live
 * response — the opposite of what a fork button next to the loader promises.
 *
 * Kept separate from `AssistantTurnForkHandler` (whose `boundary` stays
 * required) so the compiler keeps enforcing that completed turns always pin one.
 */
export type InFlightTurnForkHandler = (target: AssistantForkTarget) => Promise<void> | void;

export interface TurnChangesContext {
  serverId: string;
  cwd: string;
  isGit: boolean;
  readOnly: boolean;
  toast: ToastApi | null;
  onOpen: (path: string) => void;
  onReview: (path?: string) => void;
}

export interface TurnMemoryContext {
  agentId: string;
  state: PaseoMemoryState | null;
  isMutating: boolean;
  error: string | null;
  onFeedback: (
    id: string,
    value: "helpful" | "unhelpful" | "outdated" | "incorrect",
  ) => Promise<void>;
}

export const TurnFooter = memo(function TurnFooter({
  isRunning,
  inFlightTurnStartedAt,
  host,
  strategy,
  supportsTimelineCursor,
  onForkAssistantTurn,
  onForkInFlightTurn,
  changes,
  memory,
}: {
  isRunning: boolean;
  inFlightTurnStartedAt: Date | null;
  host: TurnFooterHost | null;
  strategy: TurnContentStrategy;
  supportsTimelineCursor: boolean;
  onForkAssistantTurn?: AssistantTurnForkHandler;
  onForkInFlightTurn?: InFlightTurnForkHandler;
  changes?: TurnChangesContext;
  memory?: TurnMemoryContext;
}) {
  if (isRunning) {
    return (
      <TurnFooterRow>
        <RunningTurnFooter
          inFlightTurnStartedAt={inFlightTurnStartedAt}
          onForkInFlightTurn={onForkInFlightTurn}
        />
      </TurnFooterRow>
    );
  }
  if (!host) {
    return null;
  }
  return (
    <CompletedTurnFooterRow
      strategy={strategy}
      items={host.items}
      startIndex={host.startIndex}
      supportsTimelineCursor={supportsTimelineCursor}
      onForkAssistantTurn={onForkAssistantTurn}
      changes={changes}
      memory={memory}
    />
  );
});

export const CompletedTurnFooterRow = memo(function CompletedTurnFooterRow({
  strategy,
  items,
  startIndex,
  supportsTimelineCursor,
  onForkAssistantTurn,
  changes,
  memory,
}: {
  strategy: TurnContentStrategy;
  items: StreamItem[];
  startIndex: number;
  supportsTimelineCursor: boolean;
  onForkAssistantTurn?: AssistantTurnForkHandler;
  changes?: TurnChangesContext;
  memory?: TurnMemoryContext;
}) {
  const turnItems = useMemo(
    () =>
      collectAssistantTurnItems({
        strategy,
        items,
        assistantIndex: startIndex,
      }),
    [items, startIndex, strategy],
  );
  return (
    <TurnFooterRow>
      <CompletedTurnFooter
        strategy={strategy}
        items={items}
        startIndex={startIndex}
        supportsTimelineCursor={supportsTimelineCursor}
        onForkAssistantTurn={onForkAssistantTurn}
        turnItems={turnItems}
      />
      {changes ? <TurnChanges {...changes} items={turnItems} /> : null}
      {memory ? (
        <TurnMemorySources
          agentId={memory.agentId}
          assistantMessageId={resolveAssistantMessageId(items, startIndex)}
          memory={memory.state}
          isMutating={memory.isMutating}
          error={memory.error}
          onFeedback={memory.onFeedback}
        />
      ) : null}
    </TurnFooterRow>
  );
});

function resolveAssistantMessageId(items: StreamItem[], startIndex: number): string | undefined {
  const item = items[startIndex];
  return item?.kind === "assistant_message" ? item.messageId : undefined;
}

const WorkingIndicator = memo(function WorkingIndicator({
  inFlightTurnStartedAt = null,
  onForkInFlightTurn,
}: {
  inFlightTurnStartedAt?: Date | null;
  onForkInFlightTurn?: InFlightTurnForkHandler;
}) {
  const active = useRetainedPanelActive();
  return (
    <View style={stylesheet.turnFooterContent}>
      <View style={stylesheet.workingLoader}>
        <ThemedSyncedLoader size={14} uniProps={workingIndicatorColorMapping} />
      </View>
      {/* Match the completed-turn footer: actions precede timing metadata. */}
      {onForkInFlightTurn ? <AssistantForkMenu onFork={onForkInFlightTurn} /> : null}
      {inFlightTurnStartedAt ? (
        <LiveElapsed
          startedAt={inFlightTurnStartedAt}
          active={active}
          style={stylesheet.workingElapsed}
          testID="turn-working-elapsed"
        />
      ) : null}
    </View>
  );
});

function RunningTurnFooter({
  inFlightTurnStartedAt,
  onForkInFlightTurn,
}: {
  inFlightTurnStartedAt: Date | null;
  onForkInFlightTurn?: InFlightTurnForkHandler;
}) {
  return (
    <View style={stylesheet.turnFooterSlot} testID="turn-working-indicator">
      <WorkingIndicator
        inFlightTurnStartedAt={inFlightTurnStartedAt}
        onForkInFlightTurn={onForkInFlightTurn}
      />
    </View>
  );
}

function CompletedTurnFooter({
  strategy,
  items,
  startIndex,
  supportsTimelineCursor,
  onForkAssistantTurn,
  turnItems,
}: {
  strategy: TurnContentStrategy;
  items: StreamItem[];
  startIndex: number;
  supportsTimelineCursor: boolean;
  onForkAssistantTurn?: AssistantTurnForkHandler;
  turnItems: StreamItem[];
}) {
  const hookSummary = useMemo(() => <TurnHookSummary items={turnItems} />, [turnItems]);
  const getContent = useCallback(
    () =>
      collectAssistantTurnContentForStreamRenderStrategy({
        strategy,
        items,
        startIndex,
      }),
    [strategy, items, startIndex],
  );
  const boundary = resolveAssistantTurnForkBoundary({
    items,
    startIndex,
    supportsTimelineCursor,
  });
  const handleFork = useCallback(
    (target: AssistantForkTarget) => {
      if (!boundary) {
        return;
      }
      return onForkAssistantTurn?.({ target, boundary });
    },
    [boundary, onForkAssistantTurn],
  );
  const assistantMessage = items[startIndex];
  if (!assistantMessage || assistantMessage.kind !== "assistant_message") {
    return null;
  }
  return (
    <View style={stylesheet.turnFooterSlot}>
      <AssistantTurnFooter
        getContent={getContent}
        onFork={boundary && onForkAssistantTurn ? handleFork : undefined}
        trailing={hookSummary}
        timestamp={assistantMessage.timestamp}
      />
    </View>
  );
}

function TurnFooterRow({ children }: { children: ReactNode }) {
  const rowStyle = useMemo(() => [stylesheet.streamItemWrapper, stylesheet.turnFooterRow], []);
  return <View style={rowStyle}>{children}</View>;
}

const stylesheet = StyleSheet.create((theme) => ({
  streamItemWrapper: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    paddingHorizontal: theme.spacing[2],
  },
  turnFooterRow: {
    marginTop: theme.spacing[4],
    gap: theme.spacing[3],
  },
  turnFooterSlot: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: 24,
    paddingBottom: theme.spacing[2],
  },
  turnFooterContent: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing[3],
  },
  workingElapsed: {
    color: theme.colors.foregroundMuted,
    fontSize: STREAM_METADATA_FONT_SIZE,
    fontVariant: ["tabular-nums"],
  },
  workingLoader: {
    marginLeft: -2,
  },
}));
