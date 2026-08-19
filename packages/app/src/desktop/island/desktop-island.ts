import { getDesktopHost, type DesktopIslandPayload } from "@/desktop/host";

export function showDesktopIsland(payload: DesktopIslandPayload): void {
  const show = getDesktopHost()?.island?.show;
  if (typeof show !== "function") {
    return;
  }
  void show(payload).catch((error) => {
    console.warn("[DesktopIsland] Failed to show reminder", { payload, error });
  });
}

export function dismissDesktopIsland(id?: string): void {
  const dismiss = getDesktopHost()?.island?.dismiss;
  if (typeof dismiss !== "function") {
    return;
  }
  void dismiss(id).catch((error) => {
    console.warn("[DesktopIsland] Failed to dismiss reminder", { id, error });
  });
}

export function clearDesktopIsland(): void {
  const clear = getDesktopHost()?.island?.clear;
  if (typeof clear !== "function") {
    return;
  }
  void clear().catch((error) => {
    console.warn("[DesktopIsland] Failed to clear reminders", { error });
  });
}
