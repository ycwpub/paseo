import { getDesktopHost } from "@/desktop/host";

export function signalDesktopAttention(reason: "finished" | "intervention"): void {
  const signal = getDesktopHost()?.attention?.signal;
  if (typeof signal !== "function") {
    return;
  }
  void signal(reason).catch((error) => {
    console.warn("[DesktopAttention] Failed to signal desktop attention", { reason, error });
  });
}
