export type ForIterationSignal = "complete" | "continue" | "break";

export interface ForIterationResult<State> {
  state: State;
  signal: ForIterationSignal;
}

interface ForIterationExecutionInput<State> {
  iterationCount: number | null;
  concurrency: number;
  initialState: State;
  runIteration: (index: number, state: State) => Promise<ForIterationResult<State>>;
}

export interface ForIterationExecutionResult<State> {
  state: State;
  completedIterations: number;
  brokeEarly: boolean;
  breakIndex: number | null;
}

interface IndexedIterationResult<State> extends ForIterationResult<State> {
  index: number;
}

interface IndexedIterationFailure {
  index: number;
  error: unknown;
}

export async function executeForIterations<State>(
  input: ForIterationExecutionInput<State>,
): Promise<ForIterationExecutionResult<State>> {
  if (input.iterationCount === 0) {
    return {
      state: input.initialState,
      completedIterations: 0,
      brokeEarly: false,
      breakIndex: null,
    };
  }
  if (input.concurrency === 1) {
    return executeSerialIterations(input);
  }
  if (input.iterationCount === null) {
    throw new Error("Unlimited For execution requires concurrency 1");
  }
  return executeConcurrentIterations({
    ...input,
    iterationCount: input.iterationCount,
  });
}

async function executeSerialIterations<State>(
  input: ForIterationExecutionInput<State>,
): Promise<ForIterationExecutionResult<State>> {
  let state = input.initialState;
  let completedIterations = 0;
  let index = 0;
  while (input.iterationCount === null || index < input.iterationCount) {
    const iteration = await input.runIteration(index, input.initialState);
    state = iteration.state;
    completedIterations += 1;
    if (iteration.signal === "break") {
      return {
        state,
        completedIterations,
        brokeEarly: true,
        breakIndex: index,
      };
    }
    index += 1;
  }
  return {
    state,
    completedIterations,
    brokeEarly: false,
    breakIndex: null,
  };
}

async function executeConcurrentIterations<State>(
  input: ForIterationExecutionInput<State> & { iterationCount: number },
): Promise<ForIterationExecutionResult<State>> {
  const results: IndexedIterationResult<State>[] = [];
  const failures: IndexedIterationFailure[] = [];
  const workerCount = Math.min(input.concurrency, input.iterationCount);
  let nextIndex = 0;
  let stopScheduling = false;
  let breakIndex: number | null = null;

  function claimIteration(): number | null {
    if (stopScheduling || nextIndex >= input.iterationCount) {
      return null;
    }
    const claimedIndex = nextIndex;
    nextIndex += 1;
    return claimedIndex;
  }

  async function runWorker(): Promise<void> {
    while (true) {
      const index = claimIteration();
      if (index === null) {
        return;
      }
      try {
        const iteration = await input.runIteration(index, input.initialState);
        results.push({ ...iteration, index });
        if (iteration.signal === "break") {
          breakIndex = breakIndex === null ? index : Math.min(breakIndex, index);
          stopScheduling = true;
        }
      } catch (error) {
        failures.push({ index, error });
        stopScheduling = true;
      }
    }
  }

  const workers = Array.from({ length: workerCount }, () => runWorker());
  await Promise.all(workers);

  failures.sort((left, right) => left.index - right.index);
  const firstFailure = failures[0];
  if (firstFailure) {
    throw firstFailure.error;
  }

  const finalResult = selectFinalResult(results, breakIndex);
  return {
    state: finalResult.state,
    completedIterations: results.length,
    brokeEarly: breakIndex !== null,
    breakIndex,
  };
}

function selectFinalResult<State>(
  results: IndexedIterationResult<State>[],
  breakIndex: number | null,
): IndexedIterationResult<State> {
  if (breakIndex !== null) {
    const breakResult = results.find((result) => result.index === breakIndex);
    if (!breakResult) {
      throw new Error(`For iteration ${breakIndex} returned break without a result`);
    }
    return breakResult;
  }
  const firstResult = results[0];
  if (!firstResult) {
    throw new Error("Concurrent For execution completed without a result");
  }
  let finalResult = firstResult;
  for (const result of results.slice(1)) {
    if (result.index > finalResult.index) {
      finalResult = result;
    }
  }
  return finalResult;
}
