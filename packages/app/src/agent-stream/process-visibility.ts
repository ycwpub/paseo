import type { StreamItem } from "@/types/stream";

export interface ProcessDisclosure {
  processItemCount: number;
}

export interface ProcessVisibilityProjection {
  tail: StreamItem[];
  head: StreamItem[];
  disclosureByHostId: Map<string, ProcessDisclosure>;
  needsAuxiliaryDisclosure: boolean;
}

interface TurnProjection {
  visibleIds: Set<string>;
  disclosureByHostId: Map<string, ProcessDisclosure>;
  needsAuxiliaryDisclosure: boolean;
}

function isResultFallback(item: StreamItem): item is Extract<StreamItem, { kind: "activity_log" }> {
  return item.kind === "activity_log" && item.activityType === "error";
}

function projectTurn(items: StreamItem[], expanded: boolean, isActive: boolean): TurnProjection {
  const visibleIds = new Set<string>();
  const disclosureByHostId = new Map<string, ProcessDisclosure>();
  if (items.length === 0) {
    return { visibleIds, disclosureByHostId, needsAuxiliaryDisclosure: false };
  }

  const finalAssistant = isActive
    ? undefined
    : items.findLast((item) => item.kind === "assistant_message");
  const fallbackResult = finalAssistant
    ? undefined
    : items.findLast((item) => isResultFallback(item));
  const result = finalAssistant ?? fallbackResult;
  const processItems = result ? items.filter((item) => item.id !== result.id) : items;
  const hasProcess = processItems.length > 0;

  if (expanded) {
    for (const item of items) {
      visibleIds.add(item.id);
    }
    const host = items[0];
    if (hasProcess && host) {
      disclosureByHostId.set(host.id, { processItemCount: processItems.length });
    }
    return { visibleIds, disclosureByHostId, needsAuxiliaryDisclosure: false };
  }

  if (result) {
    visibleIds.add(result.id);
    if (hasProcess) {
      disclosureByHostId.set(result.id, { processItemCount: processItems.length });
    }
    return { visibleIds, disclosureByHostId, needsAuxiliaryDisclosure: false };
  }

  return {
    visibleIds,
    disclosureByHostId,
    needsAuxiliaryDisclosure: isActive && hasProcess,
  };
}

export function projectProcessVisibility(input: {
  expanded: boolean;
  isTurnActive: boolean;
  tail: StreamItem[];
  head: StreamItem[];
}): ProcessVisibilityProjection {
  const allItems = [...input.tail, ...input.head];
  const visibleIds = new Set<string>();
  const disclosureByHostId = new Map<string, ProcessDisclosure>();
  let needsAuxiliaryDisclosure = false;
  let turnItems: StreamItem[] = [];

  const flushTurn = (isActive: boolean) => {
    const projected = projectTurn(turnItems, input.expanded, isActive);
    for (const id of projected.visibleIds) {
      visibleIds.add(id);
    }
    for (const [id, disclosure] of projected.disclosureByHostId) {
      disclosureByHostId.set(id, disclosure);
    }
    needsAuxiliaryDisclosure ||= projected.needsAuxiliaryDisclosure;
    turnItems = [];
  };

  for (const item of allItems) {
    if (item.kind === "user_message") {
      flushTurn(false);
      visibleIds.add(item.id);
      continue;
    }
    turnItems.push(item);
  }
  flushTurn(input.isTurnActive);

  if (input.expanded) {
    return {
      tail: input.tail,
      head: input.head,
      disclosureByHostId,
      needsAuxiliaryDisclosure: false,
    };
  }

  return {
    tail: input.tail.filter((item) => visibleIds.has(item.id)),
    head: input.head.filter((item) => visibleIds.has(item.id)),
    disclosureByHostId,
    needsAuxiliaryDisclosure,
  };
}
