import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess, ChildProcessWithoutNullStreams } from "node:child_process";
import type { Options, Query, SpawnOptions } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, describe, expect, test, vi } from "vitest";

import * as spawnUtils from "../../../../utils/spawn.js";
import { claudeQuery, type ClaudeQueryInput } from "./query.js";

function childProcessStub(): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

function queryStub(): Query {
  return {
    next: vi.fn(async () => ({ done: true, value: undefined })),
    return: vi.fn(async () => ({ done: true, value: undefined })),
    interrupt: vi.fn(async () => undefined),
    close: vi.fn(() => undefined),
    setPermissionMode: vi.fn(async () => undefined),
    setModel: vi.fn(async () => undefined),
    supportedModels: vi.fn(async () => []),
    supportedCommands: vi.fn(async () => []),
    rewindFiles: vi.fn(async () => ({ canRewind: true })),
    [Symbol.asyncIterator]() {
      return this;
    },
  } as Query;
}

describe("Aiden Claude query launch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("adapts Claude SDK arguments and injects the Aiden model fallback preload", () => {
    let capturedOptions: Options | undefined;
    const queryFactory = vi.fn((input: ClaudeQueryInput) => {
      capturedOptions = input.options;
      return queryStub();
    });
    const spawnedChild = childProcessStub();
    const spawnSpy = vi.spyOn(spawnUtils, "spawnProcess").mockReturnValue(spawnedChild);

    claudeQuery(
      {
        prompt: [] as unknown as AsyncIterable<never>,
        options: {},
      },
      {
        runtimeSettings: {
          command: {
            mode: "replace",
            argv: ["aiden", "x", "claude"],
          },
        },
        customProviderId: "aiden-claude",
        queryFactory,
      },
    );

    capturedOptions?.spawnClaudeCodeProcess?.({
      command: "/native/claude",
      args: [
        "--output-format",
        "stream-json",
        "--model",
        "[custom]gpt-5.6",
        "--settings",
        "{}",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--strict-mcp-config",
      ],
      cwd: "/workspace",
      env: { NODE_OPTIONS: "--trace-warnings" },
      signal: new AbortController().signal,
    } satisfies SpawnOptions);

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnSpy.mock.calls[0] as [
      string,
      string[],
      Parameters<typeof spawnUtils.spawnProcess>[2],
    ];
    expect(command).toBe("aiden");
    expect(args).toEqual([
      "x",
      "claude",
      "--model",
      "[custom]gpt-5.6",
      "--output-format",
      "stream-json",
    ]);
    expect(options.envOverlay?.NODE_OPTIONS).toContain("--trace-warnings");
    expect(options.envOverlay?.NODE_OPTIONS).toContain("paseo-aiden-model-fallback-v1.cjs");
    expect(options.envOverlay?.PASEO_AIDEN_RUNTIME_TARGET).toBe("claudecode");
  });

  test("does not alter normal Claude launch arguments", () => {
    let capturedOptions: Options | undefined;
    const queryFactory = vi.fn((input: ClaudeQueryInput) => {
      capturedOptions = input.options;
      return queryStub();
    });
    const spawnSpy = vi
      .spyOn(spawnUtils, "spawnProcess")
      .mockReturnValue(childProcessStub() as ChildProcess);

    claudeQuery(
      {
        prompt: [] as unknown as AsyncIterable<never>,
        options: {},
      },
      {
        runtimeSettings: {
          command: {
            mode: "replace",
            argv: ["/custom/claude"],
          },
        },
        queryFactory,
      },
    );

    capturedOptions?.spawnClaudeCodeProcess?.({
      command: "/native/claude",
      args: ["--model", "sonnet", "--settings", "{}"],
      cwd: "/workspace",
      env: {},
      signal: new AbortController().signal,
    } satisfies SpawnOptions);

    expect(spawnSpy.mock.calls[0]?.[1]).toEqual(["--model", "sonnet", "--settings", "{}"]);
  });
});
