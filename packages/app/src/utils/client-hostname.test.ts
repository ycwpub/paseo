import { describe, expect, it } from "vitest";
import { createClientHostnameStore } from "./client-hostname";

function createStorage(initial?: string) {
  let stored = initial ?? null;
  return {
    getItem: async () => stored,
    setItem: async (_key: string, value: string) => {
      stored = value;
    },
    read: () => stored,
  };
}

describe("client hostname store", () => {
  it("loads and trims a persisted hostname", async () => {
    const store = createClientHostnameStore({
      storage: createStorage("  development-mac  "),
    });

    await expect(store.initialize()).resolves.toBe("development-mac");
    expect(store.getOverride()).toBe("development-mac");
  });

  it("persists a changed hostname", async () => {
    const storage = createStorage();
    const store = createClientHostnameStore({ storage });

    await expect(store.setOverride("  mac-studio  ")).resolves.toBe("mac-studio");
    expect(storage.read()).toBe("mac-studio");
    expect(store.getOverride()).toBe("mac-studio");
  });

  it("rejects an empty hostname", async () => {
    const store = createClientHostnameStore({ storage: createStorage() });

    await expect(store.setOverride("   ")).rejects.toThrow("Client hostname is required");
  });
});
