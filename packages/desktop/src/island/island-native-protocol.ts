export type NativeIslandHostEvent =
  | { type: "ready" }
  | { type: "setExpanded"; expanded: boolean }
  | { type: "action"; action: "open" | "dismiss" | "clear"; id?: string }
  | {
      type: "positioned";
      displayId?: number;
      x?: number;
      top?: number;
      width?: number;
      height?: number;
    };

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseNativeIslandHostMessage(line: string): NativeIslandHostEvent | null {
  let message: Record<string, unknown>;
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    message = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  if (message.type === "ready") {
    return { type: "ready" };
  }
  if (message.type === "setExpanded") {
    return { type: "setExpanded", expanded: message.expanded === true };
  }
  if (
    message.type === "action" &&
    (message.action === "open" || message.action === "dismiss" || message.action === "clear")
  ) {
    return {
      type: "action",
      action: message.action,
      ...(typeof message.id === "string" ? { id: message.id } : {}),
    };
  }
  if (message.type === "positioned") {
    return {
      type: "positioned",
      displayId: finiteNumber(message.displayId),
      x: finiteNumber(message.x),
      top: finiteNumber(message.top),
      width: finiteNumber(message.width),
      height: finiteNumber(message.height),
    };
  }
  return null;
}
