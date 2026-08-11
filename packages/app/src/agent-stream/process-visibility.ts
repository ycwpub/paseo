import type { StreamItem } from "@/types/stream";

export interface ProcessDisclosure {
  processItemCount: number;
  turnId: string;
  isActive: boolean;
  expanded: boolean;
  assistantId?: string;
}

export interface ProcessVisibilityProjection {
  tail: StreamItem[];
  head: StreamItem[];
  disclosureByHostId: Map<string, ProcessDisclosure>;
  auxiliaryDisclosure: ProcessDisclosure | null;
}

interface TurnProjection {
  visibleIds: Set<string>;
  disclosureByHostId: Map<string, ProcessDisclosure>;
  auxiliaryDisclosure: ProcessDisclosure | null;
}

function isResultFallback(item: StreamItem): item is Extract<StreamItem, { kind: "activity_log" }> {
  return item.kind === "activity_log" && item.activityType === "error";
}

function findCompletedResultItems(items: StreamItem[]): StreamItem[] {
  const finalAssistantIndex = items.findLastIndex((item) => item.kind === "assistant_message");
  if (finalAssistantIndex >= 0) {
    let firstAssistantIndex = finalAssistantIndex;
    while (
      firstAssistantIndex > 0 &&
      items[firstAssistantIndex - 1]?.kind === "assistant_message"
    ) {
      firstAssistantIndex -= 1;
    }
    return items.slice(firstAssistantIndex, finalAssistantIndex + 1);
  }

  const fallbackResult = items.findLast((item) => isResultFallback(item));
  return fallbackResult ? [fallbackResult] : [];
}

function filterVisibleItems(items: StreamItem[], visibleIds: ReadonlySet<string>): StreamItem[] {
  if (items.every((item) => visibleIds.has(item.id))) {
    return items;
  }
  return items.filter((item) => visibleIds.has(item.id));
}

function projectTurn(input: {
  items: StreamItem[];
  turnId: string | null;
  isActive: boolean;
  isTurnExpanded: (turnId: string, isActive: boolean) => boolean;
}): TurnProjection {
  const visibleIds = new Set<string>();
  const disclosureByHostId = new Map<string, ProcessDisclosure>();
  if (input.items.length === 0) {
    return { visibleIds, disclosureByHostId, auxiliaryDisclosure: null };
  }

  const turnId = input.turnId ?? input.items[0].id;
  const expanded = input.isTurnExpanded(turnId, input.isActive);
  const resultItems = input.isActive ? [] : findCompletedResultItems(input.items);
  const resultIds = new Set(resultItems.map((item) => item.id));
  const processItems =
    resultItems.length > 0 ? input.items.filter((item) => !resultIds.has(item.id)) : input.items;
  const hasProcess = processItems.length > 0;
  const finalAssistant = resultItems.findLast((item) => item.kind === "assistant_message");
  const disclosure: ProcessDisclosure = {
    processItemCount: processItems.length,
    turnId,
    isActive: input.isActive,
    expanded,
    ...(finalAssistant ? { assistantId: finalAssistant.id } : {}),
  };

  if (expanded) {
    for (const item of input.items) {
      visibleIds.add(item.id);
    }
    const host = input.items[0];
    if (hasProcess && host) {
      disclosureByHostId.set(host.id, disclosure);
    }
    return { visibleIds, disclosureByHostId, auxiliaryDisclosure: null };
  }

  if (resultItems.length > 0) {
    for (const item of resultItems) {
      visibleIds.add(item.id);
    }
    if (hasProcess) {
      const resultHost = resultItems[0];
      if (resultHost) {
        disclosureByHostId.set(resultHost.id, disclosure);
      }
    }
    return { visibleIds, disclosureByHostId, auxiliaryDisclosure: null };
  }

  return {
    visibleIds,
    disclosureByHostId,
    auxiliaryDisclosure: input.isActive && hasProcess ? disclosure : null,
  };
}

export function projectProcessVisibility(input: {
  isTurnActive: boolean;
  isTurnExpanded: (turnId: string, isActive: boolean) => boolean;
  tail: StreamItem[];
  head: StreamItem[];
}): ProcessVisibilityProjection {
  const allItems = [...input.tail, ...input.head];
  const visibleIds = new Set<string>();
  const disclosureByHostId = new Map<string, ProcessDisclosure>();
  let auxiliaryDisclosure: ProcessDisclosure | null = null;
  let turnItems: StreamItem[] = [];
  let turnId: string | null = null;

  const flushTurn = (isActive: boolean) => {
    const projected = projectTurn({
      items: turnItems,
      turnId,
      isActive,
      isTurnExpanded: input.isTurnExpanded,
    });
    for (const id of projected.visibleIds) {
      visibleIds.add(id);
    }
    for (const [id, disclosure] of projected.disclosureByHostId) {
      disclosureByHostId.set(id, disclosure);
    }
    auxiliaryDisclosure = projected.auxiliaryDisclosure ?? auxiliaryDisclosure;
    turnItems = [];
    turnId = null;
  };

  for (const item of allItems) {
    if (item.kind === "user_message") {
      flushTurn(false);
      visibleIds.add(item.id);
      turnId = item.id;
      continue;
    }
    turnItems.push(item);
  }
  flushTurn(input.isTurnActive);

  return {
    tail: filterVisibleItems(input.tail, visibleIds),
    head: filterVisibleItems(input.head, visibleIds),
    disclosureByHostId,
    auxiliaryDisclosure,
  };
}
