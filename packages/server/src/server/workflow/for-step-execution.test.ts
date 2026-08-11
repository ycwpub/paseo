import { describe, expect, it } from "vitest";
import { executeForIterations, type ForIterationResult } from "./for-step-execution.js";

interface CounterState {
  value: number;
}

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
  reject: (error: unknown) => void;
}

function createDeferred<Value>(): Deferred<Value> {
  let resolvePromise: ((value: Value) => void) | null = null;
  let rejectPromise: ((error: unknown) => void) | null = null;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  if (!resolvePromise || !rejectPromise) {
    throw new Error("Deferred promise callbacks were not initialized");
  }
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
}

async function waitForCount(values: readonly unknown[], count: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (values.length === count) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error(`Expected ${count} values, received ${values.length}`);
}

describe("executeForIterations", () => {
  it("starts every serial iteration from the initial state", async () => {
    const receivedValues: number[] = [];

    const execution = await executeForIterations({
      iterationCount: 3,
      concurrency: 1,
      initialState: { value: 0 },
      runIteration: async (_index, state) => {
        receivedValues.push(state.value);
        return {
          state: { value: state.value + 1 },
          signal: "complete",
        };
      },
    });

    expect(receivedValues).toEqual([0, 0, 0]);
    expect(execution).toEqual({
      state: { value: 1 },
      completedIterations: 3,
      brokeEarly: false,
      breakIndex: null,
    });
  });

  it("runs an unlimited serial loop until break", async () => {
    const execution = await executeForIterations({
      iterationCount: null,
      concurrency: 1,
      initialState: { value: 0 },
      runIteration: async (index) => ({
        state: { value: index + 1 },
        signal: index === 2 ? "break" : "complete",
      }),
    });

    expect(execution).toEqual({
      state: { value: 3 },
      completedIterations: 3,
      brokeEarly: true,
      breakIndex: 2,
    });
  });

  it("bounds concurrent iterations and selects the highest-index output", async () => {
    const started: number[] = [];
    const gates = new Map<number, Deferred<ForIterationResult<CounterState>>>();
    let active = 0;
    let maximumActive = 0;

    const executionPromise = executeForIterations({
      iterationCount: 4,
      concurrency: 2,
      initialState: { value: -1 },
      runIteration: async (index) => {
        started.push(index);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        const gate = createDeferred<ForIterationResult<CounterState>>();
        gates.set(index, gate);
        try {
          return await gate.promise;
        } finally {
          active -= 1;
        }
      },
    });

    expect(started).toEqual([0, 1]);
    gates.get(0)?.resolve({ state: { value: 0 }, signal: "complete" });
    await waitForCount(started, 3);
    expect(started).toEqual([0, 1, 2]);
    gates.get(1)?.resolve({ state: { value: 1 }, signal: "complete" });
    await waitForCount(started, 4);
    expect(started).toEqual([0, 1, 2, 3]);
    gates.get(3)?.resolve({ state: { value: 3 }, signal: "complete" });
    gates.get(2)?.resolve({ state: { value: 2 }, signal: "complete" });

    await expect(executionPromise).resolves.toEqual({
      state: { value: 3 },
      completedIterations: 4,
      brokeEarly: false,
      breakIndex: null,
    });
    expect(maximumActive).toBe(2);
  });

  it("stops scheduling new iterations after a concurrent break", async () => {
    const started: number[] = [];
    const gates = new Map<number, Deferred<ForIterationResult<CounterState>>>();

    const executionPromise = executeForIterations({
      iterationCount: 5,
      concurrency: 2,
      initialState: { value: -1 },
      runIteration: async (index) => {
        started.push(index);
        const gate = createDeferred<ForIterationResult<CounterState>>();
        gates.set(index, gate);
        return gate.promise;
      },
    });

    expect(started).toEqual([0, 1]);
    gates.get(0)?.resolve({ state: { value: 0 }, signal: "break" });
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    gates.get(1)?.resolve({ state: { value: 1 }, signal: "complete" });

    await expect(executionPromise).resolves.toEqual({
      state: { value: 0 },
      completedIterations: 2,
      brokeEarly: true,
      breakIndex: 0,
    });
  });
});
