import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createExtendedDesktopSettingsStore } from "./desktop-settings-extensions";
async function createTempUserDataDir(): Promise<string> {
  return await mkdtemp(path.join(os.tmpdir(), "paseo-desktop-settings-"));
}
function settingsFilePath(userDataPath: string): string {
  return path.join(userDataPath, "desktop-settings.json");
}
describe("desktop-settings", () => {
  const directories = new Set<string>();
  afterEach(async () => {
    await Promise.all(
      [...directories].map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      }),
    );
    directories.clear();
  });
  it("coerces invalid persisted values back to safe defaults", async () => {
    const userDataPath = await createTempUserDataDir();
    directories.add(userDataPath);
    await writeFile(
      settingsFilePath(userDataPath),
      JSON.stringify({
        version: 1,
        settings: {
          releaseChannel: "nightly",
          daemon: {
            manageBuiltInDaemon: "sometimes",
            keepRunningAfterQuit: false,
          },
        },
      }),
    );
    const store = createExtendedDesktopSettingsStore({ userDataPath });
    const settings = await store.get();
    expect(settings).toEqual({
      releaseChannel: "stable",
      notifications: { enabled: true, playSound: true },
      daemon: {
        manageBuiltInDaemon: true,
        keepRunningAfterQuit: false,
      },
      attention: {
        soundVolume: 0.5,
      },
      island: {
        enabled: true,
        showWhenFocused: true,
      },
    });
  });
  it("patches nested settings and leaves no temp files behind", async () => {
    const userDataPath = await createTempUserDataDir();
    directories.add(userDataPath);
    const store = createExtendedDesktopSettingsStore({ userDataPath });
    await store.get();
    const next = await store.patch({
      releaseChannel: "beta",
      daemon: { keepRunningAfterQuit: false },
      attention: { soundVolume: 0.75 },
    });
    const files = await readdir(userDataPath);
    expect(next).toEqual({
      releaseChannel: "beta",
      notifications: { enabled: true, playSound: true },
      daemon: {
        manageBuiltInDaemon: true,
        keepRunningAfterQuit: false,
      },
      attention: {
        soundVolume: 0.75,
      },
      island: {
        enabled: true,
        showWhenFocused: true,
      },
    });
    expect(files.sort()).toEqual(["desktop-settings-extensions.json", "desktop-settings.json"]);
  });
  it("defaults notification sounds on for existing settings documents", async () => {
    const userDataPath = await createTempUserDataDir();
    directories.add(userDataPath);
    await writeFile(
      settingsFilePath(userDataPath),
      JSON.stringify({
        version: 1,
        settings: {
          releaseChannel: "stable",
          daemon: {
            manageBuiltInDaemon: true,
            keepRunningAfterQuit: false,
          },
        },
        migrations: {
          legacyRendererSettingsImported: true,
          daemonStopOnQuitDefaultApplied: true,
        },
      }),
    );
    const settings = await createExtendedDesktopSettingsStore({ userDataPath }).get();
    expect(settings.notifications.enabled).toBe(true);
    expect(settings.notifications.playSound).toBe(true);
  });
  it("keeps explicit notification choices across restarts", async () => {
    const userDataPath = await createTempUserDataDir();
    directories.add(userDataPath);
    await createExtendedDesktopSettingsStore({ userDataPath }).patch({
      notifications: { enabled: false, playSound: false },
    });
    const settings = await createExtendedDesktopSettingsStore({ userDataPath }).get();
    expect(settings.notifications.enabled).toBe(false);
    expect(settings.notifications.playSound).toBe(false);
  });
  it("patches notification fields independently", async () => {
    const userDataPath = await createTempUserDataDir();
    directories.add(userDataPath);
    const store = createExtendedDesktopSettingsStore({ userDataPath });
    await store.patch({ notifications: { playSound: false } });
    const settings = await store.patch({ notifications: { enabled: false } });
    expect(settings.notifications).toEqual({
      enabled: false,
      playSound: false,
    });
  });
  it("migrates desktop-owned values from legacy renderer settings once", async () => {
    const userDataPath = await createTempUserDataDir();
    directories.add(userDataPath);
    const store = createExtendedDesktopSettingsStore({ userDataPath });
    await store.patch({
      daemon: {
        keepRunningAfterQuit: false,
      },
    });
    const migrated = await store.migrateLegacyRendererSettings({
      releaseChannel: "beta",
      manageBuiltInDaemon: false,
      theme: "dark",
    });
    const ignoredSecondMigration = await store.migrateLegacyRendererSettings({
      releaseChannel: "stable",
      manageBuiltInDaemon: true,
    });
    expect(migrated).toEqual({
      releaseChannel: "beta",
      notifications: { enabled: true, playSound: true },
      daemon: {
        manageBuiltInDaemon: false,
        keepRunningAfterQuit: false,
      },
      attention: {
        soundVolume: 0.5,
      },
      island: {
        enabled: true,
        showWhenFocused: true,
      },
    });
    expect(ignoredSecondMigration).toEqual(migrated);
  });
  it("clamps attention sound volume to the supported range", async () => {
    const userDataPath = await createTempUserDataDir();
    directories.add(userDataPath);
    const store = createExtendedDesktopSettingsStore({ userDataPath });
    expect((await store.patch({ attention: { soundVolume: 2 } })).attention.soundVolume).toBe(1);
    expect((await store.patch({ attention: { soundVolume: -1 } })).attention.soundVolume).toBe(0);
  });
  it("persists Dynamic Island reminder preferences", async () => {
    const userDataPath = await createTempUserDataDir();
    directories.add(userDataPath);
    const store = createExtendedDesktopSettingsStore({ userDataPath });
    const settings = await store.patch({
      island: { enabled: false, showWhenFocused: false },
    });
    expect(settings.island).toEqual({
      enabled: false,
      showWhenFocused: false,
    });
  });
  it("keeps keys written by another build across a patch", async () => {
    const userDataPath = await createTempUserDataDir();
    directories.add(userDataPath);
    await writeFile(
      settingsFilePath(userDataPath),
      JSON.stringify({
        version: 1,
        futureDocumentKey: "kept",
        settings: {
          releaseChannel: "beta",
          tray: { enabled: true },
          notifications: { enabled: true, playSound: true, futureFlag: "notification" },
          daemon: { manageBuiltInDaemon: true, keepRunningAfterQuit: false, futureFlag: 7 },
          attention: { soundVolume: 0.5, futureFlag: "attention" },
          island: { enabled: true, showWhenFocused: true, futureFlag: "island" },
        },
        migrations: {
          legacyRendererSettingsImported: true,
          daemonStopOnQuitDefaultApplied: true,
          futureMigrationApplied: true,
        },
      }),
    );
    const store = createExtendedDesktopSettingsStore({ userDataPath });
    const next = await store.patch({ notifications: { playSound: false } });
    const persisted = JSON.parse(await readFile(settingsFilePath(userDataPath), "utf8")) as {
      futureDocumentKey: string;
      settings: Record<string, unknown> & {
        notifications: Record<string, unknown>;
        daemon: Record<string, unknown>;
        attention: Record<string, unknown>;
        island: Record<string, unknown>;
      };
      migrations: Record<string, unknown>;
    };
    expect(persisted.futureDocumentKey).toBe("kept");
    expect(persisted.settings.tray).toEqual({ enabled: true });
    expect(persisted.settings.notifications.futureFlag).toBe("notification");
    expect(persisted.settings.daemon.futureFlag).toBe(7);
    expect(persisted.settings.attention.futureFlag).toBe("attention");
    expect(persisted.settings.island.futureFlag).toBe("island");
    expect(persisted.migrations.futureMigrationApplied).toBe(true);
    expect(next.notifications.playSound).toBe(false);
  });
  it("keeps keys written by another build across the legacy renderer migration", async () => {
    const userDataPath = await createTempUserDataDir();
    directories.add(userDataPath);
    await writeFile(
      settingsFilePath(userDataPath),
      JSON.stringify({
        version: 1,
        settings: { tray: { enabled: true } },
        migrations: {
          legacyRendererSettingsImported: false,
          daemonStopOnQuitDefaultApplied: true,
        },
      }),
    );
    const store = createExtendedDesktopSettingsStore({ userDataPath });
    await store.migrateLegacyRendererSettings({ releaseChannel: "beta" });
    const persisted = JSON.parse(await readFile(settingsFilePath(userDataPath), "utf8")) as {
      settings: {
        releaseChannel: string;
        tray: unknown;
      };
    };
    expect(persisted.settings.tray).toEqual({ enabled: true });
    expect(persisted.settings.releaseChannel).toBe("beta");
  });
  it("replaces an unusable modelled value without dropping unknown keys", async () => {
    const userDataPath = await createTempUserDataDir();
    directories.add(userDataPath);
    await writeFile(
      settingsFilePath(userDataPath),
      JSON.stringify({
        version: 1,
        settings: { releaseChannel: "nightly", tray: { enabled: true } },
        migrations: {
          legacyRendererSettingsImported: true,
          daemonStopOnQuitDefaultApplied: true,
        },
      }),
    );
    const store = createExtendedDesktopSettingsStore({ userDataPath });
    await store.patch({ notifications: { playSound: false } });
    const persisted = JSON.parse(await readFile(settingsFilePath(userDataPath), "utf8")) as {
      settings: {
        releaseChannel: string;
        tray: unknown;
      };
    };
    expect(persisted.settings.releaseChannel).toBe("stable");
    expect(persisted.settings.tray).toEqual({ enabled: true });
  });
});
