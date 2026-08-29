import { getDesktopHost } from "@/desktop/host";

export function signalDesktopAttention(
  reason: "finished" | "intervention",
  options?: { allowWhenFocused?: boolean },
): void {
  const signal = getDesktopHost()?.attention?.signal;
  if (typeof signal !== "function") {
    return;
  }
  void signal(reason, options).catch((error) => {
    console.warn("[DesktopAttention] Failed to signal desktop attention", { reason, error });
  });
}

export function clearDesktopAttention(): void {
  const clear = getDesktopHost()?.attention?.clear;
  if (typeof clear !== "function") {
    return;
  }
  void clear().catch((error) => {
    console.warn("[DesktopAttention] Failed to clear desktop attention", { error });
  });
}
