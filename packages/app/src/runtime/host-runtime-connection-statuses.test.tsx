/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterAll, describe, expect, it } from "vitest";
import {
  HostRuntimeStore,
  useHostRuntimeConnectionStatuses,
  type HostRuntimeConnectionStatus,
} from "./host-runtime";

const HOST_RUNTIME_STORE_GLOBAL_KEY = "__paseoHostRuntimeStore";

describe("useHostRuntimeConnectionStatuses", () => {
  afterAll(() => {
    Reflect.deleteProperty(globalThis, HOST_RUNTIME_STORE_GLOBAL_KEY);
  });

  it("recomputes statuses when the aggregate runtime version changes", async () => {
    const store = new HostRuntimeStore();
    let connectionStatus: HostRuntimeConnectionStatus = "connecting";
    const controllers = Reflect.get(store, "controllers") as Map<
      string,
      { getSnapshot: () => { connectionStatus: HostRuntimeConnectionStatus } }
    >;
    controllers.set("local", {
      getSnapshot: () => ({ connectionStatus }),
    });
    Reflect.set(globalThis, HOST_RUNTIME_STORE_GLOBAL_KEY, store);

    const { result } = renderHook(() => useHostRuntimeConnectionStatuses(["local"]));
    expect(result.current.get("local")).toBe("connecting");

    connectionStatus = "online";
    act(() => {
      const emit = Reflect.get(store, "emit") as (serverId: string) => void;
      Reflect.apply(emit, store, ["local"]);
    });

    await waitFor(() => expect(result.current.get("local")).toBe("online"));
  });
});
