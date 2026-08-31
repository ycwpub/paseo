import { beforeEach, describe, expect, it, vi } from "vitest";

const { electronMock, settingsGet } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const notificationOptions: unknown[] = [];

  class NotificationMock {
    static isSupported = vi.fn(() => true);

    constructor(options: unknown) {
      notificationOptions.push(options);
    }

    on = vi.fn();
    show = vi.fn();
    close = vi.fn();
  }

  return {
    electronMock: {
      handlers,
      notificationOptions,
      NotificationMock,
    },
    settingsGet: vi.fn(),
  };
});

vi.mock("electron", () => ({
  app: { name: "Paseo" },
  BrowserWindow: {
    fromWebContents: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
  Notification: electronMock.NotificationMock,
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      electronMock.handlers.set(channel, handler);
    }),
  },
  nativeImage: {
    createFromPath: vi.fn(() => ({ isEmpty: () => true })),
  },
}));

vi.mock("../settings/desktop-settings-extensions-electron.js", () => ({
  getExtendedDesktopSettingsStore: () => ({
    get: settingsGet,
  }),
}));

import { registerNotificationHandlers } from "./notifications";

describe("desktop notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMock.handlers.clear();
    electronMock.notificationOptions.length = 0;
    registerNotificationHandlers();
  });

  it("does not create a system notification when notifications are disabled", async () => {
    settingsGet.mockResolvedValue({
      notifications: { enabled: false, playSound: true },
    });

    const handler = electronMock.handlers.get("paseo:notification:send");
    const sent = await handler?.({ sender: {} }, { title: "Task completed" });

    expect(sent).toBe(false);
    expect(electronMock.notificationOptions).toHaveLength(0);
  });

  it("creates a system notification using the configured sound preference", async () => {
    settingsGet.mockResolvedValue({
      notifications: { enabled: true, playSound: false },
    });

    const handler = electronMock.handlers.get("paseo:notification:send");
    const sent = await handler?.({ sender: {} }, { title: "Task completed" });

    expect(sent).toBe(true);
    expect(electronMock.notificationOptions).toEqual([
      {
        title: "Task completed",
        silent: true,
      },
    ]);
  });
});
