import { getDesktopHost, type DesktopIslandPayload } from "@/desktop/host";

export async function requestDesktopIsland(payload: DesktopIslandPayload): Promise<boolean> {
  const show = getDesktopHost()?.island?.show;
  if (typeof show !== "function") {
    return false;
  }
  try {
    return (await show(payload)) === true;
  } catch (error) {
    console.warn("[DesktopIsland] Failed to show reminder", { payload, error });
    return false;
  }
}

export function showDesktopIsland(payload: DesktopIslandPayload): void {
  void requestDesktopIsland(payload);
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
