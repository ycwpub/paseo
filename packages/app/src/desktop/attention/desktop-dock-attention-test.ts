import { getDesktopHost } from "@/desktop/host";

export async function requestDesktopDockAttentionTest(): Promise<boolean> {
  const test = getDesktopHost()?.attention?.test;
  if (typeof test !== "function") {
    return false;
  }
  try {
    return await test();
  } catch (error) {
    console.warn("[DesktopAttention] Failed to test Dock attention", { error });
    return false;
  }
}
