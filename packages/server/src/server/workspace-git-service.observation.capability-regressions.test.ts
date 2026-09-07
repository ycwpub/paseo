import path from "node:path";
import type pino from "pino";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { CheckoutSnapshotFacts, CheckoutStatusGit } from "../utils/checkout-git.js";
import type { FileObserver } from "./file-observer/index.js";
import { WorkspaceGitServiceImpl } from "./workspace-git-service.js";
const REPO_CWD = path.resolve("/tmp/paseo-observation-repo");
const GIT_DIR = path.join(REPO_CWD, ".git");
interface WatchEvent {
  path: string;
  type: "create" | "update" | "delete";
}
interface WatchRecord {
  directory: string;
  callback: (error: Error | null, events: WatchEvent[]) => void;
  ignore: Array<string | RegExp>;
  updateIgnore: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
}
function createWatcherHarness(harnessOptions?: { failDirectories?: Set<string> }) {
  const records: WatchRecord[] = [];
  const subscribe = vi.fn(
    async (
      directory: string,
      callback: WatchRecord["callback"],
      options?: {
        ignore?: Array<string | RegExp>;
      },
    ) => {
      if (harnessOptions?.failDirectories?.has(directory)) {
        throw new Error(`watch failed: ${directory}`);
      }
      const updateIgnore = vi.fn(async (paths: string[]) => {
        const record = records.find((candidate) => candidate.updateIgnore === updateIgnore);
        if (record) record.ignore = paths;
      });
      const unsubscribe = vi.fn(async () => {});
      records.push({
        directory,
        callback,
        ignore: options?.ignore ?? [],
        updateIgnore,
        unsubscribe,
      });
      return { updateIgnore, unsubscribe };
    },
  );
  return { records, subscribe };
}
function createCheckoutFacts(cwd: string): CheckoutSnapshotFacts {
  return {
    isGit: true,
    worktreeRoot: cwd,
    currentBranch: "main",
    remoteUrl: null,
    absoluteGitDir: path.join(cwd, ".git"),
    gitCommonDir: path.join(cwd, ".git"),
    paseoWorktree: { isPaseoOwnedWorktree: false },
    storedBaseRef: null,
    resolvedBaseRef: "main",
    mainRepoRoot: null,
    comparisonBaseRef: null,
    branchRemoteName: null,
    branchMergeRef: null,
    pullRequestLookupTarget: { headRef: "main" },
  };
}
function createCheckoutStatus(
  cwd: string,
  overrides?: Partial<CheckoutStatusGit>,
): CheckoutStatusGit {
  return {
    isGit: true,
    repoRoot: cwd,
    mainRepoRoot: null,
    currentBranch: "main",
    isDirty: false,
    baseRef: "main",
    aheadBehind: { ahead: 0, behind: 0 },
    aheadOfOrigin: null,
    behindOfOrigin: null,
    hasRemote: false,
    remoteUrl: null,
    isPaseoOwnedWorktree: false,
    ...overrides,
  };
}
function createLogger(): pino.Logger {
  const logger = {
    child: () => logger,
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  return logger as unknown as pino.Logger;
}
function getWatcherSubscribeCallCount(
  watcher: ReturnType<typeof createWatcherHarness>,
  directory: string,
): number {
  return watcher.subscribe.mock.calls.filter(([calledDirectory]) => calledDirectory === directory)
    .length;
}
function createService(
  watcher: ReturnType<typeof createWatcherHarness>,
  overrides?: Record<string, unknown>,
  logger: pino.Logger = createLogger(),
  fileObserver?: FileObserver,
) {
  const defaultGetCheckoutStatus = vi.fn(async (cwd: string) => createCheckoutStatus(cwd));
  const defaultGetCheckoutShortstat = vi.fn(async () => null);
  const getCheckoutStatus =
    (overrides?.getCheckoutStatus as typeof defaultGetCheckoutStatus | undefined) ??
    defaultGetCheckoutStatus;
  const getCheckoutShortstat =
    (overrides?.getCheckoutShortstat as typeof defaultGetCheckoutShortstat | undefined) ??
    defaultGetCheckoutShortstat;
  return new WorkspaceGitServiceImpl({
    logger,
    paseoHome: "/tmp/paseo-home",
    fileObserver,
    deps: {
      subscribe: watcher.subscribe,
      getCheckoutSnapshotFacts: vi.fn(async (cwd: string) => createCheckoutFacts(cwd)),
      getCheckoutRefDerivedState: vi.fn(async (_cwd, facts, current) => ({
        ...current,
        upstreamStatus: facts.upstreamStatus,
      })),
      getCheckoutStatus,
      getCheckoutShortstat,
      getCheckoutWorktreeState: vi.fn(async (cwd: string) => {
        const status = await getCheckoutStatus(cwd);
        if (!status.isGit) {
          throw new Error("Expected a git checkout");
        }
        return {
          isDirty: status.isDirty,
          diffStat: await getCheckoutShortstat(),
        };
      }),
      resolveAbsoluteGitDir: vi.fn(async () => GIT_DIR),
      hasOriginRemote: vi.fn(async () => false),
      runGitCommand: vi.fn(async () => ({
        stdout: `${REPO_CWD}\n`,
        stderr: "",
        truncated: false,
        exitCode: 0,
        signal: null,
      })),
      createWatcherLivenessCanary: vi.fn(() => ({
        path: "",
        filterEvents: (events) => events,
        verify: vi.fn(async () => {}),
      })),
      ...overrides,
    } as never,
  });
}
async function flushPromises(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}
describe("WorkspaceGitService checkout observation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  test("origin/main refreshes a main checkout without configured upstream", async () => {
    const watcher = createWatcherHarness();
    const getCheckoutSnapshotFacts = vi.fn(async (cwd: string) => ({
      ...createCheckoutFacts(cwd),
      currentBranch: "main",
      remoteUrl: "https://example.com/repo.git",
      resolvedBaseRef: "main",
      comparisonBaseRef: null,
      branchRemoteName: null,
      branchMergeRef: null,
      upstreamStatus: null,
    }));
    const service = createService(watcher, { getCheckoutSnapshotFacts });
    const listener = vi.fn();
    const subscription = service.registerWorkspace({ cwd: REPO_CWD }, listener);
    await vi.waitFor(() => {
      expect(getCheckoutSnapshotFacts).toHaveBeenCalledTimes(1);
      expect(getWatcherSubscribeCallCount(watcher, GIT_DIR)).toBeGreaterThan(0);
      expect(service.getMetrics().workspaceObservationSetupInFlightCount).toBe(0);
      expect(service.getMetrics().workspaceRefreshInFlightCount).toBe(0);
    });
    listener.mockClear();
    watcher.records
      .find((record) => record.directory === GIT_DIR)!
      .callback(null, [
        { path: path.join(GIT_DIR, "refs", "remotes", "origin", "main"), type: "update" },
      ]);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    await vi.waitFor(
      () => {
        expect(listener).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 },
    );
    subscription.unsubscribe();
    service.dispose();
  });
});
