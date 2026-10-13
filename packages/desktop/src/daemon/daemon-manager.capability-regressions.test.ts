import { EventEmitter } from "node:events";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_DESKTOP_SETTINGS } from "../settings/desktop-settings";
import { createDaemonCommandHandlers } from "./daemon-manager";

const originalExecPath = process.execPath;
const originalResourcesPath = process.resourcesPath;

const mocks = vi.hoisted(() => ({
  paseoHome: "/tmp/paseo-desktop-daemon-manager-capability-test-home",
  settings: {
    releaseChannel: "stable",
    daemon: {
      manageBuiltInDaemon: true,
      keepRunningAfterQuit: true,
    },
  },
  runExternalCliJsonCommand: vi.fn(),
  runExternalCliTextCommand: vi.fn(),
  createNodeEntrypointInvocation: vi.fn(() => ({
    command: "node",
    args: [],
    env: {},
  })),
  spawnProcess: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
  appLogPath: "/tmp/paseo-desktop-daemon-manager-capability-test-main.log",
  getElectronLogFile: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/paseo-user-data"),
    getVersion: vi.fn(() => "1.2.3"),
    isPackaged: true,
  },
  ipcMain: { handle: vi.fn() },
  powerMonitor: { getSystemIdleTime: vi.fn(() => 0) },
}));

vi.mock("electron-log/main", () => ({
  default: {
    info: mocks.logInfo,
    error: mocks.logError,
    transports: {
      file: {
        getFile: mocks.getElectronLogFile,
      },
    },
  },
}));

vi.mock("@getpaseo/server", () => ({
  resolvePaseoHome: vi.fn(() => mocks.paseoHome),
  spawnProcess: mocks.spawnProcess,
}));

vi.mock("../settings/desktop-settings-electron.js", () => ({
  getDesktopSettingsStore: () => ({
    get: async () => mocks.settings,
    patch: vi.fn(),
    migrateLegacyRendererSettings: vi.fn(),
  }),
}));

vi.mock("./runtime-paths.js", () => ({
  createNodeEntrypointInvocation: mocks.createNodeEntrypointInvocation,
  resolveDaemonRunnerEntrypoint: vi.fn(() => ({
    entryPath: "/tmp/daemon.js",
    execArgv: [],
  })),
}));

vi.mock("./cli/external.js", () => ({
  runExternalCliJsonCommand: mocks.runExternalCliJsonCommand,
  runExternalCliTextCommand: mocks.runExternalCliTextCommand,
}));

type MockChildProcess = EventEmitter & {
  pid: number;
  spawnfile: string;
  spawnargs: string[];
  unref: ReturnType<typeof vi.fn>;
};

function createMockChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.pid = 1234;
  child.spawnfile = "node";
  child.spawnargs = ["node", "daemon.js"];
  child.unref = vi.fn();
  return child;
}

function setProcessRuntime(input: { execPath: string; resourcesPath: string }): void {
  Object.defineProperty(process, "execPath", {
    configurable: true,
    value: input.execPath,
  });
  Object.defineProperty(process, "resourcesPath", {
    configurable: true,
    value: input.resourcesPath,
  });
}

function writeDesktopBuildMarker(desktopBuildId: string): void {
  mkdirSync(mocks.paseoHome, { recursive: true });
  writeFileSync(`${mocks.paseoHome}/desktop-daemon-build-id`, `${desktopBuildId}\n`);
}

function runningStatus(input: {
  serverId?: string;
  pid?: number;
  desktopManaged?: boolean;
  localDaemon?: "running" | "unresponsive";
}) {
  return {
    localDaemon: input.localDaemon ?? "running",
    connectedDaemon: input.localDaemon === "unresponsive" ? "unreachable" : "reachable",
    serverId: input.serverId ?? "server-1",
    pid: input.pid ?? 7675,
    listen: "127.0.0.1:6767",
    hostname: "dev-host",
    daemonVersion: input.localDaemon === "unresponsive" ? null : "1.2.3",
    desktopManaged: input.desktopManaged ?? true,
  };
}

function mockRestartedDaemon(): void {
  mocks.runExternalCliJsonCommand
    .mockResolvedValueOnce({ action: "stopped" })
    .mockResolvedValueOnce({
      localDaemon: "stopped",
      connectedDaemon: "unreachable",
      serverId: "",
    })
    .mockResolvedValueOnce(
      runningStatus({
        serverId: "server-2",
        pid: 8888,
        desktopManaged: true,
      }),
    );
  mocks.spawnProcess.mockReturnValue(createMockChildProcess());
}

describe("daemon-manager capability regressions", () => {
  beforeEach(() => {
    mocks.settings = DEFAULT_DESKTOP_SETTINGS;
    mocks.runExternalCliJsonCommand.mockReset();
    mocks.runExternalCliTextCommand.mockReset();
    mocks.createNodeEntrypointInvocation.mockReset();
    mocks.createNodeEntrypointInvocation.mockReturnValue({ command: "node", args: [], env: {} });
    mocks.spawnProcess.mockReset();
    mocks.logInfo.mockReset();
    mocks.logError.mockReset();
    mocks.getElectronLogFile.mockReset();
    mocks.getElectronLogFile.mockReturnValue({ path: mocks.appLogPath });
    rmSync(mocks.paseoHome, { recursive: true, force: true });
    rmSync(mocks.appLogPath, { force: true });
  });

  afterEach(() => {
    rmSync(mocks.paseoHome, { recursive: true, force: true });
    rmSync(mocks.appLogPath, { force: true });
    Object.defineProperty(process, "execPath", {
      configurable: true,
      value: originalExecPath,
    });
    Object.defineProperty(process, "resourcesPath", {
      configurable: true,
      value: originalResourcesPath,
    });
  });

  it("returns pairing offers from the running daemon", async () => {
    mocks.runExternalCliJsonCommand.mockResolvedValueOnce(runningStatus({})).mockResolvedValueOnce({
      relayEnabled: true,
      url: "http://10.71.95.148:6769/#offer=all",
      qr: null,
      offers: [
        {
          endpoint: "10.71.95.148:6769",
          useTls: false,
          pairingBaseUrl: "http://10.71.95.148:6769",
          url: "http://10.71.95.148:6769/#offer=relay",
          qr: null,
        },
      ],
    });

    await expect(createDaemonCommandHandlers().desktop_daemon_pairing()).resolves.toMatchObject({
      relayEnabled: true,
      offers: [
        {
          endpoint: "10.71.95.148:6769",
          useTls: false,
          pairingBaseUrl: "http://10.71.95.148:6769",
        },
      ],
    });
  });

  it("reports pairing command failures instead of claiming Relay is disabled", async () => {
    mocks.runExternalCliJsonCommand
      .mockResolvedValueOnce(runningStatus({}))
      .mockRejectedValueOnce(new Error("Invalid Relay HTTP connection address"));

    await expect(createDaemonCommandHandlers().desktop_daemon_pairing()).rejects.toThrow(
      "Invalid Relay HTTP connection address",
    );
  });

  it("restarts a desktop-managed daemon when a regular packaged build id differs", async () => {
    setProcessRuntime({
      execPath: "/tmp/Paseo.app/Contents/MacOS/Paseo",
      resourcesPath: "/tmp/Paseo.app/Contents/Resources",
    });
    writeDesktopBuildMarker("1.2.3|/Applications/Old-Paseo.app/Contents/MacOS/Paseo");
    mocks.runExternalCliJsonCommand.mockResolvedValueOnce(runningStatus({}));
    mockRestartedDaemon();

    await expect(createDaemonCommandHandlers().start_desktop_daemon()).resolves.toMatchObject({
      serverId: "server-2",
      status: "running",
    });
    expect(mocks.spawnProcess).toHaveBeenCalledWith(
      "node",
      [],
      expect.objectContaining({
        envOverlay: expect.objectContaining({
          PASEO_DESKTOP_MANAGED: "1",
        }),
      }),
    );
  });

  it("does not replace a running test-build daemon from a regular desktop app", async () => {
    setProcessRuntime({
      execPath: "/Applications/Paseo.app/Contents/MacOS/Paseo",
      resourcesPath: "/Applications/Paseo.app/Contents/Resources",
    });
    writeDesktopBuildMarker(
      "1.2.3|/Applications/Paseo-Feishu-Test.app/Contents/MacOS/Paseo-Feishu-Test",
    );
    mocks.runExternalCliJsonCommand.mockResolvedValueOnce(runningStatus({}));

    await expect(createDaemonCommandHandlers().start_desktop_daemon()).resolves.toMatchObject({
      serverId: "server-1",
      status: "running",
    });
    expect(mocks.spawnProcess).not.toHaveBeenCalled();
  });

  it("does not replace an unmarked daemon for regular packaged builds", async () => {
    setProcessRuntime({
      execPath: "/tmp/Paseo.app/Contents/MacOS/Paseo",
      resourcesPath: "/tmp/Paseo.app/Contents/Resources",
    });
    mocks.runExternalCliJsonCommand.mockResolvedValue(runningStatus({ desktopManaged: false }));

    await expect(createDaemonCommandHandlers().start_desktop_daemon()).resolves.toMatchObject({
      serverId: "server-1",
      status: "running",
    });
    expect(mocks.runExternalCliJsonCommand).toHaveBeenCalledTimes(1);
    expect(mocks.spawnProcess).not.toHaveBeenCalled();
  });

  it("restarts an unmarked daemon for test builds when the build id is missing", async () => {
    setProcessRuntime({
      execPath: "/Applications/Paseo-Feishu-Test.app/Contents/MacOS/Paseo-Feishu-Test",
      resourcesPath: "/Applications/Paseo-Feishu-Test.app/Contents/Resources",
    });
    mocks.runExternalCliJsonCommand.mockResolvedValueOnce(runningStatus({ desktopManaged: false }));
    mockRestartedDaemon();

    await expect(createDaemonCommandHandlers().start_desktop_daemon()).resolves.toMatchObject({
      serverId: "server-2",
      status: "running",
    });
    expect(mocks.spawnProcess).toHaveBeenCalledWith(
      "node",
      [],
      expect.objectContaining({
        envOverlay: expect.objectContaining({
          PASEO_DESKTOP_MANAGED: "1",
        }),
      }),
    );
  });

  it("force-stops an unmarked unresponsive daemon for test builds before starting", async () => {
    setProcessRuntime({
      execPath: "/Applications/Paseo-Feishu-Test.app/Contents/MacOS/Paseo-Feishu-Test",
      resourcesPath: "/Applications/Paseo-Feishu-Test.app/Contents/Resources",
    });
    mocks.runExternalCliJsonCommand.mockResolvedValueOnce(
      runningStatus({
        desktopManaged: false,
        localDaemon: "unresponsive",
      }),
    );
    mockRestartedDaemon();

    await expect(createDaemonCommandHandlers().start_desktop_daemon()).resolves.toMatchObject({
      serverId: "server-2",
      status: "running",
    });
    expect(mocks.createNodeEntrypointInvocation).toHaveBeenCalledWith(
      expect.objectContaining({ args: [] }),
    );
  });
});
