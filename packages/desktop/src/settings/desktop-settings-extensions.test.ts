import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createExtendedDesktopSettingsStore } from "./desktop-settings-extensions";

describe("extended desktop settings", () => {
  const directories = new Set<string>();
  afterEach(async () => {
    await Promise.all([...directories].map((directory) => rm(directory, { recursive: true })));
    directories.clear();
  });

  async function createStore() {
    const userDataPath = await mkdtemp(
      path.join(os.tmpdir(), "paseo-desktop-settings-extensions-"),
    );
    directories.add(userDataPath);
    return { userDataPath, store: createExtendedDesktopSettingsStore({ userDataPath }) };
  }

  it("persists branch-owned settings separately from the upstream settings document", async () => {
    const { userDataPath, store } = await createStore();
    await store.patch({
      notifications: { enabled: false, playSound: false },
      attention: { soundVolume: 0.75 },
      island: { enabled: false, showWhenFocused: false },
    });

    expect(await store.get()).toMatchObject({
      notifications: { enabled: false, playSound: false },
      attention: { soundVolume: 0.75 },
      island: { enabled: false, showWhenFocused: false },
    });
    expect((await readdir(userDataPath)).sort()).toEqual([
      "desktop-settings-extensions.json",
      "desktop-settings.json",
    ]);
  });

  it("migrates extension values from the former combined settings document", async () => {
    const { userDataPath, store } = await createStore();
    await writeFile(
      path.join(userDataPath, "desktop-settings.json"),
      JSON.stringify({
        version: 1,
        settings: {
          notifications: { enabled: false, playSound: true },
          attention: { soundVolume: 0.25 },
          island: { enabled: false, showWhenFocused: false },
        },
        migrations: {},
      }),
    );

    expect(await store.get()).toMatchObject({
      notifications: { enabled: false, playSound: true },
      attention: { soundVolume: 0.25 },
      island: { enabled: false, showWhenFocused: false },
    });
    expect(
      JSON.parse(
        await readFile(path.join(userDataPath, "desktop-settings-extensions.json"), "utf8"),
      ),
    ).toMatchObject({
      settings: {
        notifications: { enabled: false },
        attention: { soundVolume: 0.25 },
        island: { enabled: false, showWhenFocused: false },
      },
    });
  });

  it("preserves sibling island settings when applying a nested partial patch", async () => {
    const { store } = await createStore();
    await store.patch({ island: { enabled: false, showWhenFocused: false } });

    await store.patch({ island: { enabled: true } });
    expect((await store.get()).island).toEqual({
      enabled: true,
      showWhenFocused: false,
    });

    await store.patch({ island: { showWhenFocused: true } });
    expect((await store.get()).island).toEqual({
      enabled: true,
      showWhenFocused: true,
    });
  });
});
