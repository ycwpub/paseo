import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ToastApi } from "@/components/toast-host";
import { i18n } from "@/i18n/i18next";
import {
  selectAgentTimelineState,
  useSessionStore,
  type AgentTimelineCursorState,
} from "@/stores/session-store";
import { planTimelineOlderFetch } from "@/timeline/timeline-sync-plan";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { TIMELINE_OLDEST_FETCH_PAGE_SIZE } from "@/timeline/timeline-fetch-policy";

export interface LoadOlderAgentHistoryClient {
  fetchAgentTimeline: (
    agentId: string,
    request: {
      direction: "before";
      cursor: { epoch: string; seq: number };
      limit: number;
      projection: "projected";
    },
  ) => Promise<unknown>;
}

export interface LoadOlderAgentHistoryLogger {
  warn: (...args: unknown[]) => void;
}

export interface LoadOlderAgentHistoryDeps {
  client: LoadOlderAgentHistoryClient | null;
  cursor: AgentTimelineCursorState | undefined;
  hasOlder: boolean;
  isLoadingOlder: boolean;
  setInFlight: (value: boolean) => void;
  toast?: ToastApi | null;
  logger?: LoadOlderAgentHistoryLogger;
  failedMessage?: string;
}

export async function loadOlderAgentHistory(
  agentId: string,
  deps: LoadOlderAgentHistoryDeps,
): Promise<boolean> {
  const { client, cursor, hasOlder, isLoadingOlder, setInFlight, toast, logger, failedMessage } =
    deps;
  if (isLoadingOlder) {
    return true;
  }
  if (!client || !cursor || !hasOlder) {
    return false;
  }

  setInFlight(true);
  try {
    await client.fetchAgentTimeline(
      agentId,
      planTimelineOlderFetch({ epoch: cursor.epoch, seq: cursor.startSeq }),
    );
    return true;
  } catch (error) {
    (logger ?? console).warn("[Timeline] failed to load older agent history", agentId, error);
    toast?.show(failedMessage ?? i18n.t("loadOlderHistory.failed"), {
      durationMs: 2200,
      testID: "agent-load-older-history-toast",
    });
    return false;
  } finally {
    setInFlight(false);
  }
}

function yieldToHistoryRender(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function useLoadOlderAgentHistory({
  serverId,
  agentId,
  toast,
}: {
  serverId: string;
  agentId: string;
  toast?: ToastApi | null;
}) {
  const { t } = useTranslation();
  const hasOlder = useSessionStore((state) => {
    const timeline = selectAgentTimelineState(state.sessions[serverId], agentId);
    return timeline.status === "synced" && timeline.older === "available";
  });
  const isLoadingOlder =
    useSessionStore((state) =>
      state.sessions[serverId]?.agentTimelineOlderFetchInFlight.get(agentId),
    ) === true;
  const progressKey = useSessionStore((state) => {
    const timeline = selectAgentTimelineState(state.sessions[serverId], agentId);
    const cursor = timeline.status === "synced" ? timeline.range : null;
    return cursor ? `${cursor.epoch}:${cursor.startSeq}` : null;
  });
  const setOlderFetchInFlight = useSessionStore(
    (state) => state.setAgentTimelineOlderFetchInFlight,
  );
  const [isLoadingOldest, setIsLoadingOldest] = useState(false);
  const loadingOldestRef = useRef(false);

  const setInFlight = useCallback(
    (value: boolean) => {
      setOlderFetchInFlight(serverId, (prev) => {
        if (prev.get(agentId) === value) {
          return prev;
        }
        const next = new Map(prev);
        next.set(agentId, value);
        return next;
      });
    },
    [agentId, serverId, setOlderFetchInFlight],
  );

  const loadOlder = useCallback(async (): Promise<boolean> => {
    const session = useSessionStore.getState().sessions[serverId];
    const timeline = selectAgentTimelineState(session, agentId);
    return await loadOlderAgentHistory(agentId, {
      client: session?.client
        ? {
            fetchAgentTimeline: (timelineAgentId, request) =>
              getHostRuntimeStore().fetchAgentTimeline(serverId, timelineAgentId, request),
          }
        : null,
      cursor: timeline.status === "synced" ? (timeline.range ?? undefined) : undefined,
      hasOlder: timeline.status === "synced" && timeline.older === "available",
      isLoadingOlder: session?.agentTimelineOlderFetchInFlight.get(agentId) === true,
      setInFlight,
      toast,
      failedMessage: t("loadOlderHistory.failed"),
    });
  }, [agentId, serverId, setInFlight, toast, t]);

  const loadUntilOldest = useCallback(async (): Promise<boolean> => {
    if (loadingOldestRef.current) {
      return false;
    }
    const initialSession = useSessionStore.getState().sessions[serverId];
    if (
      !initialSession?.client ||
      !initialSession.agentTimelineCursor.get(agentId) ||
      initialSession.agentTimelineHasOlder.get(agentId) !== true ||
      initialSession.agentTimelineOlderFetchInFlight.get(agentId) === true
    ) {
      return initialSession?.agentTimelineHasOlder.get(agentId) !== true;
    }

    loadingOldestRef.current = true;
    setIsLoadingOldest(true);
    setInFlight(true);
    try {
      while (true) {
        const session = useSessionStore.getState().sessions[serverId];
        if (!session?.client) {
          throw new Error("Agent host disconnected while loading older history");
        }
        if (session.agentTimelineHasOlder.get(agentId) !== true) {
          return true;
        }
        const cursor = session.agentTimelineCursor.get(agentId);
        if (!cursor) {
          throw new Error("Timeline cursor unavailable while loading older history");
        }

        const previousCursorKey = `${cursor.epoch}:${cursor.startSeq}`;
        await getHostRuntimeStore().fetchAgentTimeline(
          serverId,
          agentId,
          planTimelineOlderFetch(
            { epoch: cursor.epoch, seq: cursor.startSeq },
            TIMELINE_OLDEST_FETCH_PAGE_SIZE,
          ),
        );

        const nextSession = useSessionStore.getState().sessions[serverId];
        const nextCursor = nextSession?.agentTimelineCursor.get(agentId);
        if (
          nextSession?.agentTimelineHasOlder.get(agentId) === true &&
          (!nextCursor || `${nextCursor.epoch}:${nextCursor.startSeq}` === previousCursorKey)
        ) {
          throw new Error("Timeline cursor did not advance while loading older history");
        }
        await yieldToHistoryRender();
      }
    } catch (error) {
      console.warn("[Timeline] failed to locate oldest agent history", agentId, error);
      toast?.show(t("loadOlderHistory.failed"), {
        durationMs: 2200,
        testID: "agent-load-older-history-toast",
      });
      return false;
    } finally {
      setInFlight(false);
      loadingOldestRef.current = false;
      setIsLoadingOldest(false);
    }
  }, [agentId, serverId, setInFlight, t, toast]);

  return {
    isLoadingOlder,
    isLoadingOldest,
    hasOlder,
    progressKey,
    loadOlder,
    loadUntilOldest,
  };
}
