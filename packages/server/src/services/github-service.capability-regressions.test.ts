import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGitHubService,
  type GitHubCommandRunner,
  type GitHubCommandRunnerOptions,
} from "./github-service.js";
const EXPECTED_GITHUB_FAST_POLL_MS = 20000;
const EXPECTED_GITHUB_SLOW_POLL_MS = 120000;
interface RunnerCall {
  args: string[];
  cwd: string;
  envOverlay?: Record<string, string>;
}
interface TestRunner {
  calls: RunnerCall[];
  runner: GitHubCommandRunner;
  resolveNext: (stdout: string) => void;
}
type RunnerStep =
  | string
  | {
      stdout?: string;
      stderr?: string;
      error?: Error;
    };
function createRunner(stdoutByCall: string[]): TestRunner {
  const calls: RunnerCall[] = [];
  return {
    calls,
    runner: async (args: string[], options: GitHubCommandRunnerOptions) => {
      calls.push({ args, cwd: options.cwd, envOverlay: options.envOverlay });
      const stdout = stdoutByCall.shift() ?? "[]";
      return { stdout, stderr: "" };
    },
    resolveNext: () => {},
  };
}
function createScriptedRunner(steps: RunnerStep[]): TestRunner {
  const calls: RunnerCall[] = [];
  return {
    calls,
    runner: async (args: string[], options: GitHubCommandRunnerOptions) => {
      calls.push({ args, cwd: options.cwd, envOverlay: options.envOverlay });
      const step = steps.shift() ?? "";
      if (typeof step === "string") {
        return { stdout: step, stderr: "" };
      }
      if (step.error) {
        throw step.error;
      }
      return { stdout: step.stdout ?? "", stderr: step.stderr ?? "" };
    },
    resolveNext: () => {},
  };
}
function createPollCompletionSignal(): {
  onPollCompleted: () => void;
  waitForNextPoll: () => Promise<void>;
} {
  let completedPolls = 0;
  const waiters: Array<() => void> = [];
  return {
    onPollCompleted: () => {
      const waiter = waiters.shift();
      if (waiter) {
        waiter();
        return;
      }
      completedPolls += 1;
    },
    waitForNextPoll: () => {
      if (completedPolls > 0) {
        completedPolls -= 1;
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
  };
}
function currentPullRequestJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    number: 42,
    url: "https://github.com/parentOwner/parentRepo/pull/42",
    title: "Fork PR",
    state: "OPEN",
    isDraft: false,
    baseRefName: "main",
    headRefName: "feature/fork",
    headRefOid: "1111111111111111111111111111111111111111",
    mergedAt: null,
    statusCheckRollup: [],
    reviewDecision: "REVIEW_REQUIRED",
    ...overrides,
  });
}
function currentPullRequestGithubFactsJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    data: {
      repository: {
        autoMergeAllowed: true,
        mergeCommitAllowed: false,
        squashMergeAllowed: true,
        rebaseMergeAllowed: false,
        viewerDefaultMergeMethod: "SQUASH",
        pullRequest: {
          mergeStateStatus: "BLOCKED",
          autoMergeRequest: null,
          viewerCanEnableAutoMerge: true,
          viewerCanDisableAutoMerge: false,
          viewerCanMergeAsAdmin: false,
          viewerCanUpdateBranch: true,
          isMergeQueueEnabled: false,
          isInMergeQueue: false,
        },
        ...overrides,
      },
    },
  });
}
function recordCurrentPullRequestStatusReads(service: ReturnType<typeof createGitHubService>) {
  const reads: Parameters<typeof service.getCurrentPullRequestStatus>[0][] = [];
  const getCurrentPullRequestStatus = service.getCurrentPullRequestStatus.bind(service);
  service.getCurrentPullRequestStatus = vi.fn(async (options) => {
    reads.push(options);
    return getCurrentPullRequestStatus(options);
  });
  return reads;
}
function currentPullRequestStatusCalls(calls: RunnerCall[]): RunnerCall[] {
  return calls.filter(
    (call) => call.args[0] === "pr" && (call.args[1] === "view" || call.args[1] === "list"),
  );
}
describe("ForgeService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it("polls PR status at fast cadence while checks are pending", async () => {
    let now = 0;
    const runner = createRunner([
      currentPullRequestJson({
        statusCheckRollup: [{ __typename: "StatusContext", context: "ci", state: "PENDING" }],
      }),
      currentPullRequestJson({
        statusCheckRollup: [{ __typename: "StatusContext", context: "ci", state: "PENDING" }],
      }),
    ]);
    const service = createGitHubService({
      ttlMs: 0,
      runner: runner.runner,
      resolveGhPath: async () => "/usr/bin/gh",
      now: () => now,
    });
    const reads = recordCurrentPullRequestStatusReads(service);
    const pollCompletion = createPollCompletionSignal();
    const subscription = service.retainCurrentPullRequestStatusPoll?.({
      cwd: "/repo",
      headRef: "feature/fork",
      onStatus: pollCompletion.onPollCompleted,
      onError: pollCompletion.onPollCompleted,
    });
    await service.getCurrentPullRequestStatus({ cwd: "/repo", headRef: "feature/fork" });
    now = EXPECTED_GITHUB_FAST_POLL_MS;
    const nextPoll = pollCompletion.waitForNextPoll();
    await vi.advanceTimersByTimeAsync(EXPECTED_GITHUB_FAST_POLL_MS);
    await nextPoll;
    expect(currentPullRequestStatusCalls(runner.calls)).toHaveLength(2);
    expect(reads.map((read) => read.reason)).toEqual([undefined, "self-heal-github"]);
    subscription?.unsubscribe();
    service.dispose?.();
  });
  it("retained fork PR status polls keep the head repository owner", async () => {
    const runner = createRunner([
      currentPullRequestJson({
        headRefName: "open-button-targets-active-file",
        headRepositoryOwner: { login: "fork-owner" },
      }),
    ]);
    const service = createGitHubService({
      ttlMs: 0,
      runner: runner.runner,
      resolveGhPath: async () => "/usr/bin/gh",
      resolveRepoHost: async () => null,
    });
    const reads = recordCurrentPullRequestStatusReads(service);
    const pollCompletion = createPollCompletionSignal();
    const subscription = service.retainCurrentPullRequestStatusPoll?.({
      cwd: "/repo",
      headRef: "open-button-targets-active-file",
      headRepositoryOwner: "fork-owner",
      onStatus: pollCompletion.onPollCompleted,
      onError: pollCompletion.onPollCompleted,
    });
    const nextPoll = pollCompletion.waitForNextPoll();
    await vi.advanceTimersByTimeAsync(0);
    await nextPoll;
    expect(reads).toEqual([
      expect.objectContaining({
        cwd: "/repo",
        headRef: "open-button-targets-active-file",
        headRepositoryOwner: "fork-owner",
        reason: "self-heal-github",
      }),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(currentPullRequestStatusCalls(runner.calls)).toHaveLength(1);
    subscription?.unsubscribe();
    service.dispose?.();
  });
  it("polls PR status at slow cadence after stable checks", async () => {
    let now = 0;
    const runner = createRunner([
      currentPullRequestJson({
        statusCheckRollup: [{ __typename: "StatusContext", context: "ci", state: "SUCCESS" }],
      }),
      currentPullRequestJson({
        statusCheckRollup: [{ __typename: "StatusContext", context: "ci", state: "SUCCESS" }],
      }),
    ]);
    const service = createGitHubService({
      ttlMs: 0,
      runner: runner.runner,
      resolveGhPath: async () => "/usr/bin/gh",
      now: () => now,
    });
    const reads = recordCurrentPullRequestStatusReads(service);
    const pollCompletion = createPollCompletionSignal();
    const subscription = service.retainCurrentPullRequestStatusPoll?.({
      cwd: "/repo",
      headRef: "feature/fork",
      onStatus: pollCompletion.onPollCompleted,
      onError: pollCompletion.onPollCompleted,
    });
    await service.getCurrentPullRequestStatus({ cwd: "/repo", headRef: "feature/fork" });
    now = EXPECTED_GITHUB_FAST_POLL_MS;
    await vi.advanceTimersByTimeAsync(EXPECTED_GITHUB_FAST_POLL_MS);
    expect(currentPullRequestStatusCalls(runner.calls)).toHaveLength(1);
    now = EXPECTED_GITHUB_SLOW_POLL_MS;
    const nextPoll = pollCompletion.waitForNextPoll();
    await vi.advanceTimersByTimeAsync(EXPECTED_GITHUB_SLOW_POLL_MS - EXPECTED_GITHUB_FAST_POLL_MS);
    await nextPoll;
    expect(currentPullRequestStatusCalls(runner.calls)).toHaveLength(2);
    expect(reads.map((read) => read.reason)).toEqual([undefined, "self-heal-github"]);
    subscription?.unsubscribe();
    service.dispose?.();
  });
  it("backs off consecutive poll errors and resets cadence after recovery", async () => {
    let now = 0;
    const runner = createScriptedRunner([
      currentPullRequestJson({
        statusCheckRollup: [{ __typename: "StatusContext", context: "ci", state: "PENDING" }],
      }),
      currentPullRequestGithubFactsJson(),
      { error: new Error("network down") },
      { error: new Error("network still down") },
      currentPullRequestJson({
        statusCheckRollup: [{ __typename: "StatusContext", context: "ci", state: "SUCCESS" }],
      }),
      currentPullRequestGithubFactsJson(),
      currentPullRequestJson({
        statusCheckRollup: [{ __typename: "StatusContext", context: "ci", state: "SUCCESS" }],
      }),
      currentPullRequestGithubFactsJson(),
    ]);
    const service = createGitHubService({
      ttlMs: 0,
      runner: runner.runner,
      resolveGhPath: async () => "/usr/bin/gh",
      now: () => now,
    });
    const reads = recordCurrentPullRequestStatusReads(service);
    const pollCompletion = createPollCompletionSignal();
    const subscription = service.retainCurrentPullRequestStatusPoll?.({
      cwd: "/repo",
      headRef: "feature/fork",
      onStatus: pollCompletion.onPollCompleted,
      onError: pollCompletion.onPollCompleted,
    });
    await service.getCurrentPullRequestStatus({ cwd: "/repo", headRef: "feature/fork" });
    now = EXPECTED_GITHUB_FAST_POLL_MS;
    let nextPoll = pollCompletion.waitForNextPoll();
    await vi.advanceTimersByTimeAsync(EXPECTED_GITHUB_FAST_POLL_MS);
    await nextPoll;
    now += EXPECTED_GITHUB_FAST_POLL_MS;
    nextPoll = pollCompletion.waitForNextPoll();
    await vi.advanceTimersByTimeAsync(EXPECTED_GITHUB_FAST_POLL_MS);
    await nextPoll;
    now += EXPECTED_GITHUB_FAST_POLL_MS * 2;
    nextPoll = pollCompletion.waitForNextPoll();
    await vi.advanceTimersByTimeAsync(EXPECTED_GITHUB_FAST_POLL_MS * 2);
    await nextPoll;
    now += EXPECTED_GITHUB_SLOW_POLL_MS;
    nextPoll = pollCompletion.waitForNextPoll();
    await vi.advanceTimersByTimeAsync(EXPECTED_GITHUB_SLOW_POLL_MS);
    await nextPoll;
    expect(currentPullRequestStatusCalls(runner.calls)).toHaveLength(5);
    expect(reads.map((read) => read.reason)).toEqual([
      undefined,
      "self-heal-github",
      "self-heal-github",
      "self-heal-github",
      "self-heal-github",
    ]);
    subscription?.unsubscribe();
    service.dispose?.();
  });
});
