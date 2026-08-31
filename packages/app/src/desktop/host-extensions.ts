export interface DesktopAttentionBridge {
  signal?: (
    reason: "finished" | "intervention",
    options?: { allowWhenFocused?: boolean },
  ) => Promise<boolean>;
  test?: () => Promise<boolean>;
  clear?: () => Promise<void>;
}

export type DesktopIslandKind = "running" | "finished" | "error" | "permission" | "info";

export interface DesktopIslandPayload {
  id?: string;
  kind: DesktopIslandKind;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  durationMs?: number;
}

export interface DesktopIslandBridge {
  show?: (payload: DesktopIslandPayload) => Promise<boolean>;
  dismiss?: (id?: string) => Promise<boolean>;
  clear?: () => Promise<boolean>;
}

declare module "./host" {
  interface DesktopWindowBridge {
    getName?: () => Promise<string>;
    setName?: (name: string) => Promise<string>;
    resetName?: () => Promise<string>;
  }

  interface DesktopHostBridge {
    deviceName?: string;
    attention?: DesktopAttentionBridge;
    island?: DesktopIslandBridge;
  }
}
