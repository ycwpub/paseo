import { randomUUID } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Logger } from "pino";
import {
  WorkflowPayloadSchema,
  WorkflowScriptSchema,
  type WorkflowAgentStep,
  type WorkflowBashStep,
  type WorkflowForStep,
  type WorkflowNodeRun,
  type WorkflowPayload,
  type WorkflowPythonStep,
  type WorkflowTemplateVariables,
  type WorkflowRetryPolicy,
  type WorkflowRun,
  type WorkflowScript,
  type WorkflowScriptFile,
  type WorkflowScriptSummary,
  type WorkflowStep,
  type WorkflowSwitchStep,
} from "@getpaseo/protocol/workflow/types";
import {
  WorkflowNodeResultEnvelopeSchema,
  type WorkflowArtifact,
  type WorkflowData,
  type WorkflowNodeResultEnvelope,
} from "@getpaseo/protocol/workflow/data-contract";
import type { AgentSessionConfig } from "../agent/agent-sdk-types.js";
import type { AgentManager } from "../agent/agent-manager.js";
import { curateAgentActivity } from "../agent/activity-curator.js";
import { resolveCreateAgentTitles } from "../agent/create-agent-title.js";
import { type BoundCreateAgentCommand, formatProviderModel } from "../agent/create-agent/create.js";
import { buildAssistantInitialPrompt } from "../assistants/assistant-prompt.js";
import type { AssistantStore } from "../assistants/assistant-store.js";
import type { PersistedWorkspaceRecord } from "../workspace-registry.js";
import type { CreatePaseoWorktreeWorkflowResult } from "../worktree-session.js";
import { expandUserPath } from "../path-utils.js";
import { writeJsonFileAtomic } from "../atomic-file.js";
import {
  clearTeamIdentityLabels,
  resolveTeamLeaderCreateContext,
} from "../team/team-agent-context.js";
import type { TeamStore } from "../team/team-store.js";
import { runPythonNode } from "./python-node.js";
import {
  resolveWorkflowCommandEnvironment,
  type ResolvedWorkflowCommandEnvironment,
} from "./command-environment.js";
import {
  formatCommandProcessOutput,
  runBashWorkflowNode,
  serializeWorkflowNodeInput,
  WorkflowCommandExecutionError,
  type WorkflowCommandOutput,
} from "./command-node.js";
import { parseCommandNodeResult, WorkflowNodeBusinessError } from "./command-result.js";
import { WorkflowAgentLifecycleScope } from "./agent-lifecycle-scope.js";
import { executeForIterations } from "./for-step-execution.js";
import {
  resolveWorkflowForExecutionConfig,
  WorkflowForExecutionModeError,
} from "./for-step-execution-mode.js";
import { createWorkflowForIterationPlan, WorkflowForPlanError } from "./for-step-plan.js";
import { WorkflowRunStore } from "./store.js";
import { resolveWorkflowExpression, resolveWorkflowNodeInput } from "./workflow-data-mapping.js";
import { validateWorkflowNodeData, validateWorkflowNodeSchema } from "./workflow-node-contract.js";
import { type WorkflowLoopContext, WorkflowVariableState } from "./workflow-variable-state.js";
import { findWorkflowStep } from "./workflow-step-search.js";
import { resolveNextWorkflowStep, validateWorkflowSequenceLinks } from "./workflow-sequence.js";

const DEFAULT_SHELL = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
const DEFAULT_PYTHON_PATH = process.platform === "win32" ? "python" : "python3";
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_OUTPUT_CHARS = 200_000;
const MAX_WORKFLOW_STEPS = 1_000;
const MAX_WORKFLOW_DEPTH = 20;
const PROMPT_VARIABLE_PATTERN = /{{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*}}/g;

type WorkflowAgentManager = Pick<AgentManager, "runAgent" | "waitForAgentEvent" | "cancelAgentRun">;

interface WorkflowWorkspaceCreateInput {
  cwd: string;
  firstAgentContext: { prompt: string };
}

export interface WorkflowServiceOptions {
  paseoHome: string;
  logger: Logger;
  agentManager: WorkflowAgentManager;
  createAgent: BoundCreateAgentCommand;
  createDirectoryWorkspace: (
    input: WorkflowWorkspaceCreateInput,
  ) => Promise<PersistedWorkspaceRecord>;
  createPaseoWorktreeWorkspace: (
    input: WorkflowWorkspaceCreateInput,
  ) => Promise<CreatePaseoWorktreeWorkflowResult>;
  archiveWorkspace: (workspaceId: string) => Promise<void>;
  assistantStore?: Pick<AssistantStore, "get">;
  teamStore?: Pick<TeamStore, "get">;
  now?: () => Date;
}

interface ExecutionState {
  payload: WorkflowPayload;
  workflowInputs: WorkflowData;
  nodeOutputs: Record<string, WorkflowData>;
  variableState: WorkflowVariableState;
  artifacts: WorkflowArtifact[];
  filePath: string;
  hasFileOutput: boolean;
  iterationPath: number[];
  loopContext: WorkflowLoopContext | null;
  workflowAgentScope: WorkflowAgentLifecycleScope<WorkflowAgentResource>;
  forAgentScope: WorkflowAgentLifecycleScope<WorkflowAgentResource> | null;
}

interface WorkflowAgentResource {
  agentId: string;
  workspace: PersistedWorkspaceRecord;
  archiveOnLifecycleEnd: boolean;
}

interface StepExecutionResult extends ExecutionState {
  agentId: string | null;
  nodeArtifacts?: WorkflowArtifact[];
  agentPrompt?: string | null;
  agentResponse?: string | null;
  output: string | null;
  diagnostics?: WorkflowNodeDiagnostics;
}

type WorkflowNodeDiagnostics = Partial<
  Pick<
    WorkflowNodeRun,
    | "expandedInstruction"
    | "cwd"
    | "stdout"
    | "stderr"
    | "exitCode"
    | "signal"
    | "environmentSource"
    | "environmentPath"
    | "skippedReason"
  >
>;

type WorkflowTerminalStatus = Extract<WorkflowRun["status"], "failed" | "cancelled" | "timed_out">;

class WorkflowExecutionError extends Error {
  constructor(
    message: string,
    readonly state: ExecutionState,
    readonly code = "TASK_FAILED",
    readonly terminalStatus: WorkflowTerminalStatus = "failed",
    readonly diagnostics: WorkflowNodeDiagnostics = {},
    readonly forbidRetry = false,
  ) {
    super(message);
    this.name = "WorkflowExecutionError";
  }
}

export class WorkflowService {
  private readonly logger: Logger;
  private readonly workflowsDir: string;
  private readonly runArtifactsDir: string;
  private readonly store: WorkflowRunStore;
  private readonly agentManager: WorkflowAgentManager;
  private readonly createAgent: BoundCreateAgentCommand;
  private readonly createDirectoryWorkspace: WorkflowServiceOptions["createDirectoryWorkspace"];
  private readonly createPaseoWorktreeWorkspace: WorkflowServiceOptions["createPaseoWorktreeWorkspace"];
  private readonly archiveWorkspace: WorkflowServiceOptions["archiveWorkspace"];
  private readonly assistantStore: WorkflowServiceOptions["assistantStore"];
  private readonly teamStore: WorkflowServiceOptions["teamStore"];
  private readonly now: () => Date;
  private readonly activeRuns = new Map<string, Promise<void>>();
  private readonly activeCommandProcesses = new Map<ChildProcess, string>();
  private readonly activeAgentIds = new Map<string, Set<string>>();
  private readonly terminationRequests = new Map<
    string,
    { status: Extract<WorkflowTerminalStatus, "cancelled" | "timed_out">; message: string }
  >();
  private readonly terminationWaiters = new Map<string, Set<() => void>>();
  private acceptingRuns = true;

  constructor(options: WorkflowServiceOptions) {
    this.logger = options.logger.child({ module: "workflow-service" });
    this.workflowsDir = join(options.paseoHome, "workflows");
    this.runArtifactsDir = join(options.paseoHome, "workflow-run-artifacts");
    this.store = new WorkflowRunStore(join(options.paseoHome, "workflow-runs"), (invalidRun) => {
      this.logger.warn(
        { err: invalidRun.error, path: invalidRun.filePath },
        "Skipping incompatible Workflow run history",
      );
    });
    this.agentManager = options.agentManager;
    this.createAgent = options.createAgent;
    this.createDirectoryWorkspace = options.createDirectoryWorkspace;
    this.createPaseoWorktreeWorkspace = options.createPaseoWorktreeWorkspace;
    this.archiveWorkspace = options.archiveWorkspace;
    this.assistantStore = options.assistantStore;
    this.teamStore = options.teamStore;
    this.now = options.now ?? (() => new Date());
  }

  async start(): Promise<void> {
    await mkdir(this.workflowsDir, { recursive: true });
    await mkdir(this.runArtifactsDir, { recursive: true });
    const now = this.now().toISOString();
    const runs = await this.store.list();
    await Promise.all(
      runs
        .filter((run) => run.status === "running")
        .map((run) =>
          this.store.update(run.id, (current) => ({
            ...current,
            status: "failed",
            error: "Daemon restarted before the workflow completed",
            errorCode: "DAEMON_RESTARTED",
            endedAt: now,
            nodeRuns: current.nodeRuns.map((nodeRun) =>
              nodeRun.status === "running"
                ? {
                    ...nodeRun,
                    status: "failed",
                    endedAt: now,
                    error: "Daemon restarted before the workflow node completed",
                    errorCode: "DAEMON_RESTARTED",
                  }
                : nodeRun,
            ),
          })),
        ),
    );
  }

  async stop(): Promise<void> {
    this.acceptingRuns = false;
    for (const child of this.activeCommandProcesses.keys()) {
      child.kill("SIGTERM");
    }
    await Promise.allSettled(this.activeRuns.values());
  }

  async listScripts(): Promise<WorkflowScriptSummary[]> {
    const paths = await this.discoverScriptPaths(this.workflowsDir);
    const summaries = await Promise.all(
      paths.map(async (path) => {
        try {
          const inspected = await this.inspectScript(path);
          const stats = await stat(path);
          return {
            path,
            name: inspected.script.name,
            description: inspected.script.description ?? null,
            stepCount: countSteps(inspected.script.steps),
            modifiedAt: stats.mtime.toISOString(),
          } satisfies WorkflowScriptSummary;
        } catch (error) {
          this.logger.warn({ err: error, path }, "Skipping invalid workflow script");
          return null;
        }
      }),
    );
    return summaries
      .filter((summary): summary is WorkflowScriptSummary => summary !== null)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async inspectScript(scriptPath: string): Promise<WorkflowScriptFile> {
    const path = resolveWorkflowPath(scriptPath);
    const content = await readFile(path, "utf8");
    const script = WorkflowScriptSchema.parse(JSON.parse(content));
    validateWorkflowScript(script);
    return { path, script };
  }

  async saveScript(input: {
    scriptPath?: string;
    fileName?: string;
    script: WorkflowScript;
  }): Promise<WorkflowScriptFile> {
    const script = WorkflowScriptSchema.parse(input.script);
    validateWorkflowScript(script);
    await mkdir(this.workflowsDir, { recursive: true });

    let path: string;
    if (input.scriptPath) {
      path = this.resolveManagedScriptPath(input.scriptPath);
    } else {
      const requestedName = normalizeWorkflowFileName(
        input.fileName ?? `${slugifyWorkflowName(script.name)}.json`,
      );
      path = await this.findAvailableScriptPath(requestedName);
    }

    await writeJsonFileAtomic(path, script);
    return { path, script };
  }

  async deleteScript(scriptPath: string): Promise<void> {
    const path = this.resolveManagedScriptPath(scriptPath);
    await rm(path, { force: true });
  }

  async listRuns(): Promise<WorkflowRun[]> {
    return this.store.list();
  }

  async getLatestRunForScript(scriptPath: string): Promise<WorkflowRun | null> {
    const path = resolveWorkflowPath(scriptPath);
    const runs = await this.store.list();
    return runs.find((run) => resolveWorkflowPath(run.scriptPath) === path) ?? null;
  }

  async getRun(runId: string): Promise<WorkflowRun> {
    const run = await this.store.get(runId);
    if (!run) {
      throw new Error(`Workflow run not found: ${runId}`);
    }
    return run;
  }

  async cancelRun(runId: string): Promise<WorkflowRun> {
    const run = await this.getRun(runId);
    if (run.status !== "running") {
      return run;
    }
    await this.requestTermination(runId, "cancelled", "Workflow run was cancelled");
    await this.activeRuns.get(runId);
    return this.getRun(runId);
  }

  async runScript(input: {
    scriptPath: string;
    inputPayload?: string;
    inputFilePath?: string;
    inputPresetId?: string;
    targetNodeId?: string;
  }): Promise<WorkflowRun> {
    return this.startScriptRun(input);
  }

  private async startScriptRun(input: {
    scriptPath: string;
    inputPayload?: string;
    inputFilePath?: string;
    inputPresetId?: string;
    targetNodeId?: string;
  }): Promise<WorkflowRun> {
    if (!this.acceptingRuns) {
      throw new Error("Workflow service is shutting down");
    }
    const scriptFile = await this.inspectScript(input.scriptPath);
    const targetNodeId = input.targetNodeId?.trim() || null;
    if (targetNodeId && !findWorkflowStep(scriptFile.script.steps, targetNodeId)) {
      throw new Error(`Workflow node not found: ${targetNodeId}`);
    }
    let inputPayload: WorkflowPayload;
    let inputFilePath: string;
    if (input.inputPresetId) {
      const preset = scriptFile.script.inputPresets?.find(
        (candidate) => candidate.id === input.inputPresetId,
      );
      if (!preset) {
        throw new Error(`Workflow input preset not found: ${input.inputPresetId}`);
      }
      const presetPayload = parseInitialPayload(
        JSON.stringify(preset.payload),
        dirname(scriptFile.path),
      );
      const overridePayload = input.inputPayload
        ? parseInitialPayload(input.inputPayload, dirname(scriptFile.path))
        : null;
      inputPayload = WorkflowPayloadSchema.parse({
        ...presetPayload,
        ...overridePayload,
      });
      inputFilePath = getPayloadString(inputPayload, "filePath") ?? "";
    } else if (input.inputPayload !== undefined) {
      inputPayload = parseInitialPayload(input.inputPayload, dirname(scriptFile.path));
      inputFilePath = getPayloadString(inputPayload, "filePath") ?? "";
    } else if (input.inputFilePath !== undefined) {
      inputFilePath = resolveWorkflowPath(input.inputFilePath);
      await assertExistingPath(inputFilePath, "Workflow input");
      inputPayload = createInitialPayload(inputFilePath);
    } else {
      throw new Error("Workflow input JSON is required");
    }
    inputPayload = validateInitialWorkflowInput(scriptFile.script, inputPayload);
    inputFilePath = getPayloadString(inputPayload, "filePath") ?? "";
    const startedAt = this.now().toISOString();
    const run = await this.store.create({
      scriptPath: scriptFile.path,
      scriptSnapshot: scriptFile.script,
      targetNodeId,
      status: "running",
      inputPayload: serializePayload(inputPayload),
      outputPayload: null,
      inputFilePath,
      outputFilePath: null,
      control: "",
      error: null,
      errorCode: null,
      startedAt,
      endedAt: null,
      nodeRuns: [],
    });
    const task = this.executeRun(run).finally(() => {
      this.activeRuns.delete(run.id);
    });
    this.activeRuns.set(run.id, task);
    void task.catch((error) => {
      this.logger.error({ err: error, runId: run.id }, "Workflow execution failed");
    });
    return run;
  }

  async runScriptAndWait(input: {
    scriptPath: string;
    inputPayload?: string;
    inputFilePath?: string;
    inputPresetId?: string;
    targetNodeId?: string;
  }): Promise<WorkflowRun> {
    const run = await this.runScript(input);
    await this.activeRuns.get(run.id);
    return this.getRun(run.id);
  }

  private async executeRun(run: WorkflowRun): Promise<void> {
    const initialPayload =
      parseStoredPayload(run.inputPayload) ?? createInitialPayload(run.inputFilePath);
    const workflowAgentScope = new WorkflowAgentLifecycleScope<WorkflowAgentResource>();
    let state: ExecutionState = {
      payload: initialPayload,
      workflowInputs: { ...initialPayload },
      nodeOutputs: {},
      variableState: new WorkflowVariableState(
        run.scriptSnapshot.variables,
        run.scriptSnapshot.steps,
      ),
      artifacts: [],
      filePath: run.inputFilePath || run.scriptPath,
      hasFileOutput: false,
      iterationPath: [],
      loopContext: null,
      workflowAgentScope,
      forAgentScope: null,
    };
    let workflowTimeout: NodeJS.Timeout | null = null;
    if (run.scriptSnapshot.timeoutMs) {
      workflowTimeout = setTimeout(() => {
        void this.requestTermination(
          run.id,
          "timed_out",
          `Workflow timed out after ${run.scriptSnapshot.timeoutMs}ms`,
        );
      }, run.scriptSnapshot.timeoutMs);
      workflowTimeout.unref?.();
    }
    try {
      this.assertRunActive(run.id, state);
      if (run.targetNodeId) {
        const targetStep = findWorkflowStep(run.scriptSnapshot.steps, run.targetNodeId);
        if (!targetStep) {
          throw new WorkflowExecutionError(
            `Workflow node not found: ${run.targetNodeId}`,
            state,
            "WORKFLOW_NODE_NOT_FOUND",
          );
        }
        state = await this.executeStep(run, targetStep, state);
      } else {
        state = await this.executeSteps(run, run.scriptSnapshot.steps, state);
      }
      this.assertRunActive(run.id, state);
      validateWorkflowNodeData(run.scriptSnapshot.outputSchema, state.payload, "Workflow output");
      await this.finishRun(run.id, {
        status: "succeeded",
        outputPayload: serializePayload(state.payload),
        outputFilePath: state.hasFileOutput ? state.filePath : null,
        control: "",
        error: null,
        errorCode: null,
        artifacts: state.artifacts,
      });
    } catch (error) {
      await this.finishRun(run.id, buildFailedRunResult(run.scriptSnapshot, error, state));
    } finally {
      await this.closeAgentLifecycleScope(run, workflowAgentScope, "workflow");
      if (workflowTimeout) {
        clearTimeout(workflowTimeout);
      }
      this.terminationRequests.delete(run.id);
      this.terminationWaiters.delete(run.id);
    }
  }

  private async executeSteps(
    run: WorkflowRun,
    steps: WorkflowStep[],
    initialState: ExecutionState,
  ): Promise<ExecutionState> {
    let state = initialState;
    const linkError = validateWorkflowSequenceLinks(steps);
    if (linkError) {
      throw new WorkflowExecutionError(linkError, state, "WORKFLOW_INVALID_GRAPH");
    }
    const visited = new Set<number>();
    let index: number | null = steps.length > 0 ? 0 : null;
    while (index !== null) {
      if (visited.has(index)) {
        throw new WorkflowExecutionError(
          `Workflow sequence contains a cycle at step ${steps[index]?.id ?? index}`,
          state,
          "WORKFLOW_INVALID_GRAPH",
        );
      }
      visited.add(index);
      const step = steps[index];
      if (!step) {
        break;
      }
      this.assertRunActive(run.id, state);
      state = await this.executeStep(run, step, state);
      index = resolveNextWorkflowStep(steps, index)?.index ?? null;
    }
    return state;
  }

  // oxlint-disable-next-line complexity -- Step dispatch centralizes retries, node-run persistence, and terminal error normalization.
  private async executeStep(
    run: WorkflowRun,
    step: WorkflowStep,
    state: ExecutionState,
  ): Promise<ExecutionState> {
    const stepInputState = prepareWorkflowStepInput(run.scriptSnapshot, step, state);
    const retry = resolveStepRetryPolicy(run.scriptSnapshot, step);
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      this.assertRunActive(run.id, stepInputState);
      const nodeRunId = randomUUID();
      await this.appendNodeRun(run.id, {
        id: nodeRunId,
        stepId: step.id,
        stepName: step.name ?? null,
        stepType: step.type === "python" ? "bash" : step.type,
        ...(step.type === "python" ? { executor: "python" as const } : {}),
        iterationPath: stepInputState.iterationPath,
        startedAt: this.now().toISOString(),
        endedAt: null,
        status: "running",
        attempt,
        maxAttempts: retry.maxAttempts,
        retryDelayMs: null,
        inputPayload: serializeNodeInput(run, step, stepInputState),
        outputPayload: null,
        inputFilePath: getPayloadString(stepInputState.payload, "filePath") ?? "",
        outputFilePath: null,
        inputControl: "",
        outputControl: null,
        error: null,
        errorCode: null,
        agentId: null,
        agentPrompt: null,
        agentResponse: null,
        workflowPath: null,
        workflowRunId: null,
        output: null,
        expandedInstruction: null,
        cwd: null,
        stdout: null,
        stderr: null,
        exitCode: null,
        signal: null,
        environmentSource: null,
        environmentPath: null,
        skippedReason: null,
        artifacts: [],
      });
      try {
        let result: StepExecutionResult;
        switch (step.type) {
          case "bash":
            result = await this.executeBashStep(run, step, stepInputState, attempt);
            break;
          case "python":
            result = await this.executePythonStep(run, step, stepInputState, attempt);
            break;
          case "agent":
            result = await this.executeAgentStep(run, step, stepInputState, attempt);
            break;
          case "switch":
            result = await this.executeSwitchStep(run, step, stepInputState);
            break;
          case "for":
            result = await this.executeForStep(run, step, stepInputState);
            break;
          default: {
            const unsupportedStep: never = step;
            throw new Error(
              `Unsupported workflow step type: ${String(
                (unsupportedStep as { type?: unknown }).type,
              )}`,
            );
          }
        }
        const completedState: StepExecutionResult = {
          ...result,
          nodeOutputs: {
            ...result.nodeOutputs,
            [step.id]: { ...result.payload },
          },
        };
        this.assertRunActive(run.id, completedState);
        await this.completeNodeRun(run.id, nodeRunId, {
          status: "succeeded",
          outputPayload: serializePayload(completedState.payload),
          outputFilePath: completedState.hasFileOutput ? completedState.filePath : null,
          outputControl: "",
          error: null,
          errorCode: null,
          agentId: completedState.agentId,
          agentPrompt: completedState.agentPrompt ?? null,
          agentResponse: completedState.agentResponse ?? null,
          output: completedState.output,
          retryDelayMs: null,
          artifacts: completedState.nodeArtifacts ?? [],
          ...completedState.diagnostics,
        });
        return completedState;
      } catch (error) {
        const executionError = this.normalizeExecutionError(error, run.id, stepInputState);
        const canRetry =
          attempt < retry.maxAttempts &&
          executionError.terminalStatus === "failed" &&
          !executionError.forbidRetry &&
          (step.type === "bash" || step.type === "python" || step.type === "agent");
        const retryDelayMs = canRetry ? calculateRetryDelay(retry, attempt) : null;
        await this.completeNodeRun(run.id, nodeRunId, {
          status:
            executionError.code === "TASK_TIMEOUT" ? "timed_out" : executionError.terminalStatus,
          outputPayload: serializePayload(executionError.state.payload),
          outputFilePath: executionError.state.hasFileOutput ? executionError.state.filePath : null,
          outputControl: "",
          error: executionError.message,
          errorCode: executionError.code,
          agentId: null,
          agentPrompt: null,
          agentResponse: null,
          output: null,
          retryDelayMs,
          artifacts: [],
          ...executionError.diagnostics,
        });
        if (!canRetry) {
          throw executionError;
        }
        await this.waitForRetryDelay(run.id, retryDelayMs ?? 0);
      }
    }
    throw new WorkflowExecutionError(
      `Workflow step ${step.id} exhausted its retry policy`,
      stepInputState,
    );
  }

  private async executeBashStep(
    run: WorkflowRun,
    step: WorkflowBashStep,
    state: ExecutionState,
    attempt: number,
  ): Promise<StepExecutionResult> {
    const renderedInstruction = await renderWorkflowInstruction({
      template: step.initialCommand,
      variables: step.templateVariables,
      state,
      runId: run.id,
      stepId: step.id,
      stepName: step.name,
      attempt,
    });
    const cwd = await resolveStepCwd(step.cwd, state.filePath);
    const environment = await resolveWorkflowCommandEnvironment(run.scriptSnapshot.environment);
    let output: WorkflowCommandOutput;
    try {
      output = await runBashWorkflowNode({
        instruction: renderedInstruction,
        inputVariable: step.inputVariable ?? "input",
        outputVariable: step.outputVariable ?? "output",
        inputJson: serializeWorkflowNodeInput(
          state.variableState.createNodeInput(step.id, state.payload, state.loopContext),
        ),
        iterationPath: state.iterationPath,
        cwd,
        shell: step.shell ?? DEFAULT_SHELL,
        env: environment.env,
        timeoutMs:
          step.timeoutMs ?? run.scriptSnapshot.taskDefaults?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        runId: run.id,
        stepId: step.id,
        attempt,
        onSpawn: (child) => this.activeCommandProcesses.set(child, run.id),
        onClose: (child) => this.activeCommandProcesses.delete(child),
      });
    } catch (error) {
      throwCommandFailure({ error, state, instruction: renderedInstruction, cwd, environment });
    }
    const diagnostics = createCommandDiagnostics({
      instruction: renderedInstruction,
      cwd,
      output,
      environment,
    });
    return this.parseAndValidateNodeEnvelope({
      parse: () =>
        parseCommandNodeResult({
          resultJson: output.resultJson,
          resultExceededLimit: output.resultExceededLimit,
          commandType: "Bash",
        }),
      step,
      state,
      agentId: null,
      output: formatCommandProcessOutput(output),
      diagnostics,
    });
  }

  private async executePythonStep(
    run: WorkflowRun,
    step: WorkflowPythonStep,
    state: ExecutionState,
    attempt: number,
  ): Promise<StepExecutionResult> {
    const code = await renderWorkflowInstruction({
      template: step.code,
      variables: step.templateVariables,
      state,
      runId: run.id,
      stepId: step.id,
      stepName: step.name,
      attempt,
    });
    const cwd = await resolveStepCwd(step.cwd, state.filePath);
    const environment = await resolveWorkflowCommandEnvironment(run.scriptSnapshot.environment);
    let output: WorkflowCommandOutput;
    try {
      output = await runPythonNode({
        code,
        inputVariable: step.inputVariable ?? "input",
        outputVariable: step.outputVariable ?? "output",
        pythonPath: step.pythonPath ?? DEFAULT_PYTHON_PATH,
        inputJson: serializeWorkflowNodeInput(
          state.variableState.createNodeInput(step.id, state.payload, state.loopContext),
        ),
        iterationPath: state.iterationPath,
        cwd,
        env: environment.env,
        timeoutMs:
          step.timeoutMs ?? run.scriptSnapshot.taskDefaults?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        runId: run.id,
        stepId: step.id,
        attempt,
        onSpawn: (child) => this.activeCommandProcesses.set(child, run.id),
        onClose: (child) => this.activeCommandProcesses.delete(child),
      });
    } catch (error) {
      throwCommandFailure({ error, state, instruction: code, cwd, environment });
    }
    const diagnostics = createCommandDiagnostics({
      instruction: code,
      cwd,
      output,
      environment,
    });
    return this.parseAndValidateNodeEnvelope({
      parse: () =>
        parseCommandNodeResult({
          resultJson: output.resultJson,
          resultExceededLimit: output.resultExceededLimit,
          commandType: "Python",
        }),
      step,
      state,
      agentId: null,
      output: formatCommandProcessOutput(output),
      diagnostics,
    });
  }

  // oxlint-disable-next-line complexity -- Agent task execution centralizes prompt rendering, lifecycle reuse, timeout cancellation, and provider result validation.
  private async executeAgentStep(
    run: WorkflowRun,
    step: WorkflowAgentStep,
    state: ExecutionState,
    attempt: number,
  ): Promise<StepExecutionResult> {
    const cwd = await resolveStepCwd(step.config.cwd, state.filePath);
    const renderedInstruction = await renderWorkflowInstruction({
      template: step.initialPrompt,
      variables: step.templateVariables,
      state,
      runId: run.id,
      stepId: step.id,
      stepName: step.name,
      attempt,
    });
    const renderedSystemPrompt = step.config.systemPrompt
      ? await renderWorkflowInstruction({
          template: step.config.systemPrompt,
          variables: step.templateVariables,
          state,
          runId: run.id,
          stepId: step.id,
          stepName: step.name,
          attempt,
        })
      : undefined;
    const baseLabels = {
      "paseo.workflow-run": run.id,
      "paseo.workflow-step": step.id,
      "paseo.workflow-attempt": String(attempt),
    };
    const { prompt, labels } = this.resolveAgentIdentityContext(
      step,
      renderedInstruction,
      baseLabels,
    );
    const lifecycle = step.lifecycle ?? "single";
    let inheritedScope: WorkflowAgentLifecycleScope<WorkflowAgentResource> | null = null;
    if (lifecycle === "workflow") {
      inheritedScope = state.workflowAgentScope;
    } else if (lifecycle === "for") {
      inheritedScope = state.forAgentScope;
    }
    const scope = inheritedScope ?? new WorkflowAgentLifecycleScope<WorkflowAgentResource>();
    const ownsScope = inheritedScope === null;
    try {
      return await scope.withResource({
        key: step.id,
        create: () =>
          this.createWorkflowAgentResource({
            run,
            step,
            cwd,
            prompt,
            renderedInstruction,
            renderedSystemPrompt,
            labels,
          }),
        run: async (resource) => {
          const activeAgentId = resource.agentId;
          this.trackActiveAgent(run.id, activeAgentId);
          try {
            return await this.runWorkflowAgentResource({
              run,
              step,
              state,
              prompt,
              cwd: resource.workspace.cwd,
              agentId: activeAgentId,
            });
          } finally {
            this.untrackActiveAgent(run.id, activeAgentId);
          }
        },
      });
    } finally {
      if (ownsScope) {
        await this.closeAgentLifecycleScope(run, scope, lifecycle);
      }
    }
  }

  private async createWorkflowAgentResource(input: {
    run: WorkflowRun;
    step: WorkflowAgentStep;
    cwd: string;
    prompt: string;
    renderedInstruction: string;
    renderedSystemPrompt: string | undefined;
    labels: Record<string, string>;
  }): Promise<WorkflowAgentResource> {
    const workspace =
      (input.step.config.isolation ?? "local") === "worktree"
        ? (
            await this.createPaseoWorktreeWorkspace({
              cwd: input.cwd,
              firstAgentContext: { prompt: input.prompt },
            })
          ).workspace
        : await this.createDirectoryWorkspace({
            cwd: input.cwd,
            firstAgentContext: { prompt: input.prompt },
          });
    const archiveOnLifecycleEnd = input.step.config.archiveOnFinish ?? true;
    try {
      const config = buildWorkflowAgentConfig(
        input.step,
        workspace.cwd,
        input.renderedSystemPrompt,
      );
      const created = await this.createAgent({
        kind: "mcp",
        provider: formatProviderModel(config.provider, config.model),
        config,
        cwd: workspace.cwd,
        workspaceId: workspace.workspaceId,
        title:
          resolveCreateAgentTitles({
            configTitle: input.step.config.title,
            initialPrompt: input.renderedInstruction,
          }).provisionalTitle ?? `Workflow: ${input.step.name ?? input.step.id}`,
        labels: input.labels,
        mode: config.modeId,
        thinking: config.thinkingOptionId,
        features: config.featureValues,
        unattended: true,
        promptFailure: "return-error",
        background: true,
        notifyOnFinish: false,
      });
      if (created.initialPromptError) {
        throw created.initialPromptError;
      }
      return {
        agentId: created.snapshot.id,
        workspace,
        archiveOnLifecycleEnd,
      };
    } catch (error) {
      if (archiveOnLifecycleEnd) {
        await this.archiveWorkspace(workspace.workspaceId).catch((archiveError) => {
          this.logger.warn(
            {
              err: archiveError,
              runId: input.run.id,
              stepId: input.step.id,
              workspaceId: workspace.workspaceId,
            },
            "Failed to archive uninitialized workflow Agent workspace",
          );
        });
      }
      throw error;
    }
  }

  private async runWorkflowAgentResource(input: {
    run: WorkflowRun;
    step: WorkflowAgentStep;
    state: ExecutionState;
    prompt: string;
    cwd: string;
    agentId: string;
  }): Promise<StepExecutionResult> {
    const timeoutMs =
      input.step.timeoutMs ??
      input.run.scriptSnapshot.taskDefaults?.timeoutMs ??
      DEFAULT_TIMEOUT_MS;
    const { result, waitResult } = await withTimeout(
      (async () => {
        const agentResult = await this.agentManager.runAgent(input.agentId, input.prompt);
        const agentWaitResult = await this.agentManager.waitForAgentEvent(input.agentId, {
          waitForActive: true,
        });
        return { result: agentResult, waitResult: agentWaitResult };
      })(),
      timeoutMs,
      async () => {
        await this.agentManager.cancelAgentRun(input.agentId).catch((error) => {
          this.logger.warn(
            {
              err: error,
              runId: input.run.id,
              stepId: input.step.id,
              agentId: input.agentId,
            },
            "Failed to cancel timed out workflow agent",
          );
        });
      },
      `Agent workflow node timed out after ${timeoutMs}ms`,
    );
    if (result.canceled) {
      throw new Error(`Workflow agent ${input.agentId} was canceled`);
    }
    if (waitResult.permission) {
      throw new Error(`Workflow agent ${input.agentId} is waiting for permission`);
    }
    if (waitResult.status === "error") {
      throw new Error(waitResult.lastMessage ?? `Workflow agent ${input.agentId} failed`);
    }
    const responseText = result.finalText ?? waitResult.lastMessage ?? "";
    if (!responseText.trim()) {
      throw new Error(`Workflow agent ${input.agentId} did not return a final answer`);
    }
    const parsed = createAgentNodeResultEnvelope(input.step, responseText);
    const timelineText = curateAgentActivity(result.timeline, {
      includeKinds: ["reasoning", "tool_call", "todo", "error", "compaction"],
    });
    const processOutput =
      timelineText === "No activity to display." ? null : trimOutput(timelineText);
    const diagnostics = {
      expandedInstruction: trimOutput(input.prompt),
      cwd: input.cwd,
    };
    return this.validateNodeResultEnvelope(
      parsed,
      input.step,
      input.state,
      input.agentId,
      processOutput,
      trimOutput(input.prompt),
      trimOutput(responseText),
      diagnostics,
    );
  }

  private async closeAgentLifecycleScope(
    run: WorkflowRun,
    scope: WorkflowAgentLifecycleScope<WorkflowAgentResource>,
    lifecycle: string,
  ): Promise<void> {
    await scope.close(async (resource) => {
      if (!resource.archiveOnLifecycleEnd) {
        return;
      }
      await this.archiveWorkspace(resource.workspace.workspaceId).catch((error) => {
        this.logger.warn(
          {
            err: error,
            runId: run.id,
            agentId: resource.agentId,
            workspaceId: resource.workspace.workspaceId,
            lifecycle,
          },
          "Failed to archive workflow Agent workspace at lifecycle end",
        );
      });
    });
  }

  private resolveAgentIdentityContext(
    step: WorkflowAgentStep,
    prompt: string,
    labels: Record<string, string>,
  ): { prompt: string; labels: Record<string, string> } {
    const cleanLabels = clearTeamIdentityLabels(labels);
    if (step.config.teamId) {
      if (!this.assistantStore || !this.teamStore) {
        throw new Error("Workflow team support is unavailable");
      }
      const context = resolveTeamLeaderCreateContext(
        {
          assistantStore: this.assistantStore,
          teamStore: this.teamStore,
        },
        {
          teamId: step.config.teamId,
          assistantId: step.config.assistantId,
          userPrompt: prompt,
          labels: cleanLabels,
        },
      );
      return { prompt: context.prompt, labels: context.labels };
    }
    if (!step.config.assistantId) {
      return { prompt, labels: cleanLabels };
    }
    if (!this.assistantStore) {
      throw new Error("Workflow assistant support is unavailable");
    }
    const assistant = this.assistantStore.get(step.config.assistantId);
    if (!assistant) {
      throw new Error(`Assistant ${step.config.assistantId} not found`);
    }
    return {
      prompt: buildAssistantInitialPrompt(assistant, prompt),
      labels: {
        ...cleanLabels,
        assistantId: assistant.id,
        assistantName: assistant.name,
      },
    };
  }

  private async executeSwitchStep(
    run: WorkflowRun,
    step: WorkflowSwitchStep,
    state: ExecutionState,
  ): Promise<StepExecutionResult> {
    const switchValue = resolveWorkflowExpression(
      step.switchVar ?? "{{data.control}}",
      createDataMappingContext(state, step.id),
    );
    const selected = step.cases.find((candidate) =>
      workflowValuesEqual(candidate.equals, switchValue, step.caseSensitive ?? false),
    );
    const branch = selected?.steps ?? step.defaultSteps ?? [];
    const next = branch.length > 0 ? await this.executeSteps(run, branch, state) : state;
    return {
      ...next,
      agentId: null,
      output: selected
        ? `Matched ${formatWorkflowValue(switchValue)} to ${JSON.stringify(selected.equals)}`
        : `Used default branch for ${formatWorkflowValue(switchValue)}`,
    };
  }

  private async executeForStep(
    run: WorkflowRun,
    step: WorkflowForStep,
    state: ExecutionState,
  ): Promise<StepExecutionResult> {
    let executionConfig;
    try {
      executionConfig = resolveWorkflowForExecutionConfig(step);
    } catch (error) {
      if (error instanceof WorkflowForExecutionModeError) {
        throw new WorkflowExecutionError(error.message, state, "WORKFLOW_INVALID_GRAPH");
      }
      throw error;
    }
    const { concurrency } = executionConfig;
    let plan;
    try {
      plan = createWorkflowForIterationPlan({
        step,
        resolveExpression: (expression) =>
          resolveWorkflowExpression(expression, createDataMappingContext(state, step.id)),
      });
    } catch (error) {
      if (error instanceof WorkflowForPlanError) {
        throw new WorkflowExecutionError(error.message, state, error.code);
      }
      throw error;
    }
    const parentLoopContext = state.loopContext;
    const parentForAgentScope = state.forAgentScope;
    const forAgentScope = new WorkflowAgentLifecycleScope<WorkflowAgentResource>();
    const loopScope = state.variableState.createLoopScope(step.loopVariables);
    const loopInputData = structuredClone(state.payload);
    const loopInputNodeOutputs = structuredClone(state.nodeOutputs);
    let execution;
    try {
      execution = await executeForIterations({
        iterationCount: plan.iterationCount,
        concurrency,
        initialState: state,
        runIteration: async (index) => {
          const loopContext: WorkflowLoopContext = {
            scope: loopScope,
            item: plan.itemAt(index),
            index,
            count: plan.count,
            modificationAllowed: executionConfig.loopVariableModificationAllowed,
          };
          let iterationState: ExecutionState = {
            ...state,
            payload: structuredClone(loopInputData),
            nodeOutputs: structuredClone(loopInputNodeOutputs),
            iterationPath: [...state.iterationPath, index],
            loopContext,
            forAgentScope,
          };
          const linkError = validateWorkflowSequenceLinks(step.steps);
          if (linkError) {
            throw new WorkflowExecutionError(linkError, iterationState, "WORKFLOW_INVALID_GRAPH");
          }
          const visited = new Set<number>();
          let childIndex: number | null = step.steps.length > 0 ? 0 : null;
          while (childIndex !== null) {
            if (visited.has(childIndex)) {
              throw new WorkflowExecutionError(
                `Workflow sequence contains a cycle at step ${step.steps[childIndex]?.id ?? childIndex}`,
                iterationState,
                "WORKFLOW_INVALID_GRAPH",
              );
            }
            visited.add(childIndex);
            const childStep = step.steps[childIndex];
            if (!childStep) {
              break;
            }
            iterationState = await this.executeStep(run, childStep, iterationState);
            const control = resolveForControl(step, iterationState);
            const shouldBreak = control === "break";
            if (shouldBreak) {
              return { state: iterationState, signal: "break" };
            }
            const shouldContinue = control === "continue";
            if (shouldContinue) {
              return { state: iterationState, signal: "continue" };
            }
            childIndex = resolveNextWorkflowStep(step.steps, childIndex)?.index ?? null;
          }
          return { state: iterationState, signal: "complete" };
        },
      });
    } finally {
      await this.closeAgentLifecycleScope(run, forAgentScope, "for");
    }
    let output = `Completed ${execution.completedIterations} iteration${execution.completedIterations === 1 ? "" : "s"}`;
    if (plan.iterationCount === 0) {
      output = "Skipped loop: 0 items";
    } else if (execution.brokeEarly) {
      output =
        plan.iterationCount === null
          ? `Stopped after ${execution.completedIterations} iterations`
          : `Stopped after ${execution.completedIterations} of ${plan.iterationCount} iterations`;
    }
    if (executionConfig.mode === "parallel" && plan.iterationCount !== 0) {
      output += ` in parallel with concurrency ${concurrency}`;
    }
    return {
      ...execution.state,
      iterationPath: state.iterationPath,
      loopContext: parentLoopContext,
      forAgentScope: parentForAgentScope,
      agentId: null,
      output,
      diagnostics: {
        skippedReason: plan.iterationCount === 0 ? "No loop items were produced" : null,
      },
    };
  }

  private async parseAndValidateNodeEnvelope(input: {
    parse: () => WorkflowNodeResultEnvelope;
    step: WorkflowBashStep | WorkflowPythonStep;
    state: ExecutionState;
    agentId: string | null;
    output: string | null;
    diagnostics: WorkflowNodeDiagnostics;
  }): Promise<StepExecutionResult> {
    try {
      return await this.validateNodeResultEnvelope(
        input.parse(),
        input.step,
        input.state,
        input.agentId,
        input.output,
        null,
        null,
        input.diagnostics,
      );
    } catch (error) {
      if (error instanceof WorkflowExecutionError) {
        throw error;
      }
      throw new WorkflowExecutionError(
        error instanceof Error ? error.message : String(error),
        input.state,
        "TASK_FAILED",
        "failed",
        input.diagnostics,
        error instanceof WorkflowNodeBusinessError && error.forbidRetry,
      );
    }
  }

  private async validateNodeResultEnvelope(
    result: WorkflowNodeResultEnvelope,
    step: WorkflowBashStep | WorkflowPythonStep | WorkflowAgentStep,
    state: ExecutionState,
    agentId: string | null,
    output: string | null,
    agentPrompt: string | null = null,
    agentResponse: string | null = null,
    diagnostics: WorkflowNodeDiagnostics = {},
  ): Promise<StepExecutionResult> {
    validateWorkflowNodeData(step.outputSchema, result.data, `Workflow node ${step.id} output`);
    await state.variableState.apply(result.modify, state.loopContext);
    const payload = normalizePayloadPaths(
      WorkflowPayloadSchema.parse(result.data),
      dirname(state.filePath),
    );
    const hasFileOutput = getPayloadString(payload, "filePath") !== null;
    return {
      ...state,
      payload,
      artifacts: [...state.artifacts, ...result.artifacts],
      nodeArtifacts: result.artifacts,
      filePath: resolvePayloadFilePath(payload, state.filePath),
      hasFileOutput,
      agentId,
      agentPrompt,
      agentResponse,
      output,
      diagnostics,
    };
  }

  private assertRunActive(runId: string, state: ExecutionState): void {
    const request = this.terminationRequests.get(runId);
    if (request) {
      throw new WorkflowExecutionError(
        request.message,
        state,
        request.status === "timed_out" ? "WORKFLOW_TIMEOUT" : "WORKFLOW_CANCELLED",
        request.status,
      );
    }
  }

  private normalizeExecutionError(
    error: unknown,
    runId: string,
    state: ExecutionState,
  ): WorkflowExecutionError {
    const request = this.terminationRequests.get(runId);
    if (request) {
      return new WorkflowExecutionError(
        request.message,
        error instanceof WorkflowExecutionError ? error.state : state,
        request.status === "timed_out" ? "WORKFLOW_TIMEOUT" : "WORKFLOW_CANCELLED",
        request.status,
      );
    }
    if (error instanceof WorkflowExecutionError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /timed out after \d+ms/i.test(message);
    return new WorkflowExecutionError(
      message,
      state,
      timedOut ? "TASK_TIMEOUT" : "TASK_FAILED",
      "failed",
      {},
      error instanceof WorkflowNodeBusinessError && error.forbidRetry,
    );
  }

  private async requestTermination(
    runId: string,
    status: Extract<WorkflowTerminalStatus, "cancelled" | "timed_out">,
    message: string,
  ): Promise<void> {
    if (this.terminationRequests.has(runId)) {
      return;
    }
    this.terminationRequests.set(runId, { status, message });
    for (const waiter of this.terminationWaiters.get(runId) ?? []) {
      waiter();
    }
    for (const [child, childRunId] of this.activeCommandProcesses) {
      if (childRunId === runId) {
        child.kill("SIGTERM");
      }
    }
    await Promise.allSettled(
      [...(this.activeAgentIds.get(runId) ?? [])].map((agentId) =>
        this.agentManager.cancelAgentRun(agentId),
      ),
    );
  }

  private trackActiveAgent(runId: string, agentId: string): void {
    const agents = this.activeAgentIds.get(runId) ?? new Set<string>();
    agents.add(agentId);
    this.activeAgentIds.set(runId, agents);
  }

  private untrackActiveAgent(runId: string, agentId: string): void {
    const agents = this.activeAgentIds.get(runId);
    agents?.delete(agentId);
    if (agents?.size === 0) {
      this.activeAgentIds.delete(runId);
    }
  }

  private async waitForRetryDelay(runId: string, delayMs: number): Promise<void> {
    if (delayMs <= 0) {
      return;
    }
    await new Promise<void>((resolvePromise) => {
      const waiters = this.terminationWaiters.get(runId) ?? new Set<() => void>();
      let timer: NodeJS.Timeout;
      let finished = false;
      const finish = () => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timer);
        waiters.delete(finish);
        if (waiters.size === 0) {
          this.terminationWaiters.delete(runId);
        }
        // oxlint-disable-next-line promise/no-multiple-resolved -- The finished guard makes timer and cancellation callbacks mutually exclusive.
        resolvePromise();
      };
      waiters.add(finish);
      this.terminationWaiters.set(runId, waiters);
      timer = setTimeout(finish, delayMs);
      timer.unref?.();
    });
    const run = await this.getRun(runId);
    const storedInput =
      parseStoredPayload(run.inputPayload) ?? createInitialPayload(run.inputFilePath);
    this.assertRunActive(runId, {
      payload: parseStoredPayload(run.outputPayload) ?? storedInput,
      workflowInputs: storedInput,
      nodeOutputs: {},
      variableState: new WorkflowVariableState(
        run.scriptSnapshot.variables,
        run.scriptSnapshot.steps,
      ),
      artifacts: run.artifacts ?? [],
      filePath: run.outputFilePath ?? (run.inputFilePath || run.scriptPath),
      hasFileOutput:
        getPayloadString(
          parseStoredPayload(run.outputPayload) ??
            parseStoredPayload(run.inputPayload) ??
            createInitialPayload(run.inputFilePath),
          "filePath",
        ) !== null || run.outputFilePath !== null,
      iterationPath: [],
      loopContext: null,
      workflowAgentScope: new WorkflowAgentLifecycleScope<WorkflowAgentResource>(),
      forAgentScope: null,
    });
  }

  private async appendNodeRun(runId: string, nodeRun: WorkflowNodeRun): Promise<void> {
    const updated = await this.store.update(runId, (run) => ({
      ...run,
      outputPayload: nodeRun.outputPayload ?? run.outputPayload,
      outputFilePath: nodeRun.outputFilePath ?? run.outputFilePath,
      control: nodeRun.outputControl ?? run.control,
      nodeRuns: [...run.nodeRuns, nodeRun],
    }));
    if (!updated) {
      throw new Error(`Workflow run not found: ${runId}`);
    }
  }

  private async completeNodeRun(
    runId: string,
    nodeRunId: string,
    result: Pick<
      WorkflowNodeRun,
      | "status"
      | "outputPayload"
      | "outputFilePath"
      | "outputControl"
      | "error"
      | "errorCode"
      | "agentId"
      | "agentPrompt"
      | "agentResponse"
      | "output"
      | "retryDelayMs"
      | "expandedInstruction"
      | "cwd"
      | "stdout"
      | "stderr"
      | "exitCode"
      | "signal"
      | "environmentSource"
      | "environmentPath"
      | "skippedReason"
      | "artifacts"
    >,
  ): Promise<void> {
    const updated = await this.store.update(runId, (run) => ({
      ...run,
      outputPayload: result.outputPayload ?? run.outputPayload,
      outputFilePath: result.outputFilePath ?? run.outputFilePath,
      control: result.outputControl ?? run.control,
      artifacts: [...(run.artifacts ?? []), ...(result.artifacts ?? [])],
      nodeRuns: run.nodeRuns.map((nodeRun) =>
        nodeRun.id === nodeRunId
          ? {
              ...nodeRun,
              ...result,
              endedAt: this.now().toISOString(),
            }
          : nodeRun,
      ),
    }));
    if (!updated) {
      throw new Error(`Workflow run not found: ${runId}`);
    }
  }

  private async finishRun(
    runId: string,
    result: Pick<
      WorkflowRun,
      | "status"
      | "outputPayload"
      | "outputFilePath"
      | "control"
      | "error"
      | "errorCode"
      | "artifacts"
    >,
  ): Promise<void> {
    const updated = await this.store.update(runId, (run) => ({
      ...run,
      ...result,
      endedAt: this.now().toISOString(),
    }));
    if (!updated) {
      throw new Error(`Workflow run not found: ${runId}`);
    }
  }

  private async discoverScriptPaths(root: string): Promise<string[]> {
    const entries = await readdir(root, { withFileTypes: true });
    const paths: string[] = [];
    for (const entry of entries) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        paths.push(...(await this.discoverScriptPaths(path)));
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".json") || entry.name.endsWith(".paseo-workflow"))
      ) {
        paths.push(path);
      }
    }
    return paths;
  }

  private resolveManagedScriptPath(scriptPath: string): string {
    const path = resolveWorkflowPath(scriptPath);
    const relativePath = relative(this.workflowsDir, path);
    if (
      relativePath.length === 0 ||
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error(`Workflow scripts can only be edited under ${this.workflowsDir}`);
    }
    assertWorkflowExtension(path);
    return path;
  }

  private async findAvailableScriptPath(fileName: string): Promise<string> {
    const initialPath = this.resolveManagedScriptPath(join(this.workflowsDir, fileName));
    const extension = extname(initialPath);
    const stem = basename(initialPath, extension);
    const parent = dirname(initialPath);
    for (let index = 1; index <= 10_000; index += 1) {
      const candidate = index === 1 ? initialPath : join(parent, `${stem}-${index}${extension}`);
      try {
        await stat(candidate);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return candidate;
        }
        throw error;
      }
    }
    throw new Error(`Unable to allocate a workflow file for ${fileName}`);
  }
}

function normalizeWorkflowFileName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || basename(trimmed) !== trimmed) {
    throw new Error("Workflow file name must be a single file name");
  }
  const withExtension = extname(trimmed) ? trimmed : `${trimmed}.json`;
  assertWorkflowExtension(withExtension);
  return withExtension;
}

function assertWorkflowExtension(path: string): void {
  if (!path.endsWith(".json") && !path.endsWith(".paseo-workflow")) {
    throw new Error("Workflow file must end with .json or .paseo-workflow");
  }
}

function slugifyWorkflowName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "workflow";
}

function resolveWorkflowPath(path: string): string {
  return resolve(expandUserPath(path.trim()));
}

function createInitialPayload(inputFilePath: string): WorkflowPayload {
  return inputFilePath ? { filePath: inputFilePath } : {};
}

function parseInitialPayload(inputPayload: string, baseDirectory: string): WorkflowPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(inputPayload);
  } catch (error) {
    throw new Error("Workflow input must be a valid JSON object", { cause: error });
  }
  const result = WorkflowPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Workflow input must be a JSON object", { cause: result.error });
  }
  return normalizePayloadPaths(result.data, baseDirectory);
}

function validateInitialWorkflowInput(
  script: WorkflowScript,
  payload: WorkflowPayload,
): WorkflowPayload {
  const firstStep = script.steps[0];
  if (firstStep) {
    validateWorkflowNodeData(firstStep.inputSchema, payload, "Workflow input");
  }
  return payload;
}

function buildFailedRunResult(
  _script: WorkflowScript,
  error: unknown,
  fallbackState: ExecutionState,
): Pick<
  WorkflowRun,
  "status" | "outputPayload" | "outputFilePath" | "control" | "error" | "errorCode" | "artifacts"
> {
  const executionError = error instanceof WorkflowExecutionError ? error : null;
  const state = executionError?.state ?? fallbackState;
  return {
    status: executionError?.terminalStatus ?? "failed",
    outputPayload: serializePayload(state.payload),
    outputFilePath: state.hasFileOutput ? state.filePath : null,
    control: "",
    error: error instanceof Error ? error.message : String(error),
    errorCode: executionError?.code ?? "WORKFLOW_FAILED",
    artifacts: state.artifacts,
  };
}

function serializePayload(payload: WorkflowPayload): string {
  return JSON.stringify(payload);
}

function serializeNodeInput(_run: WorkflowRun, step: WorkflowStep, state: ExecutionState): string {
  return JSON.stringify(
    state.variableState.createNodeInput(step.id, state.payload, state.loopContext),
  );
}

function prepareWorkflowStepInput(
  _script: WorkflowScript,
  step: WorkflowStep,
  state: ExecutionState,
): ExecutionState {
  const inputs =
    step.type === "bash" || step.type === "python" || step.type === "agent"
      ? step.inputs
      : undefined;
  const input = resolveWorkflowNodeInput(inputs, createDataMappingContext(state, step.id));
  validateWorkflowNodeData(step.inputSchema, input, `Workflow node ${step.id} input`);
  const payload = normalizePayloadPaths(
    WorkflowPayloadSchema.parse(input),
    dirname(state.filePath),
  );
  return {
    ...state,
    payload,
    filePath: resolvePayloadFilePath(payload, state.filePath),
    hasFileOutput: getPayloadString(payload, "filePath") !== null,
  };
}

function createDataMappingContext(state: ExecutionState, stepId: string) {
  return {
    workflowInputs: state.workflowInputs,
    currentInput: state.payload,
    nodeOutputs: state.nodeOutputs,
    workflowVariables: state.variableState.snapshotWorkflow(),
    loopVariables: state.variableState.snapshotLoop(state.loopContext),
    nodeVariables: state.variableState.snapshotNode(stepId),
  };
}

function parseStoredPayload(value: string | null): WorkflowPayload | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = WorkflowPayloadSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function getPayloadString(payload: WorkflowPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizePayloadPaths(payload: WorkflowPayload, baseDirectory: string): WorkflowPayload {
  const filePath = getPayloadString(payload, "filePath");
  if (!filePath || isAbsolute(filePath)) {
    return payload;
  }
  return {
    ...payload,
    filePath: resolve(baseDirectory, filePath),
  };
}

function resolvePayloadFilePath(payload: WorkflowPayload, fallback: string): string {
  return getPayloadString(payload, "filePath") ?? fallback;
}

async function assertExistingPath(path: string, label: string): Promise<void> {
  try {
    await stat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${label} does not exist: ${path}`, { cause: error });
    }
    throw error;
  }
}

async function resolveStepCwd(
  configuredCwd: string | undefined,
  inputPath: string,
): Promise<string> {
  if (configuredCwd) {
    const cwd = resolveWorkflowPath(configuredCwd);
    const stats = await stat(cwd);
    if (!stats.isDirectory()) {
      throw new Error(`Workflow node cwd is not a directory: ${cwd}`);
    }
    return cwd;
  }
  const inputStats = await stat(inputPath);
  return inputStats.isDirectory() ? inputPath : dirname(inputPath);
}

async function renderWorkflowInstruction(input: {
  template: string;
  variables: WorkflowTemplateVariables | undefined;
  state: ExecutionState;
  runId: string;
  stepId: string;
  stepName: string | undefined;
  attempt: number;
}): Promise<string> {
  const nodeInputPayload = input.state.variableState.createNodeInput(
    input.stepId,
    input.state.payload,
    input.state.loopContext,
  );
  const customVariables = input.variables ?? {};
  const templates = [input.template, ...Object.values(customVariables)];
  const needsInputContent = templates.some((template) =>
    /{{\s*inputFileContent\s*}}/.test(template),
  );
  const inputFilePath = getPayloadString(input.state.payload, "filePath") ?? "";
  const builtInVariables: Record<string, string> = {
    inputFilePath,
    inputDirectory: inputFilePath ? dirname(inputFilePath) : "",
    inputFileName: inputFilePath ? basename(inputFilePath) : "",
    inputFileContent:
      needsInputContent && inputFilePath ? await readFile(inputFilePath, "utf8") : "",
    inputJson: JSON.stringify(nodeInputPayload),
    payload: JSON.stringify(nodeInputPayload),
    data: JSON.stringify(nodeInputPayload.data),
    iterationPath: JSON.stringify(input.state.iterationPath),
    runId: input.runId,
    stepId: input.stepId,
    stepName: input.stepName ?? input.stepId,
    attempt: String(input.attempt),
  };
  const resolvedCustomVariables: Record<string, string> = {};
  for (const [name, value] of Object.entries(customVariables)) {
    resolvedCustomVariables[name] = renderPromptTemplate(value, (variableName) =>
      resolvePromptVariable(variableName, nodeInputPayload, {}, builtInVariables),
    );
  }
  return renderPromptTemplate(input.template, (variableName) =>
    resolvePromptVariable(
      variableName,
      nodeInputPayload,
      resolvedCustomVariables,
      builtInVariables,
    ),
  );
}

function renderPromptTemplate(
  template: string,
  resolveVariable: (name: string) => string | undefined,
): string {
  const missing = new Set<string>();
  const rendered = template.replace(PROMPT_VARIABLE_PATTERN, (_match, name: string) => {
    const value = resolveVariable(name);
    if (value === undefined) {
      missing.add(name);
      return "";
    }
    return value;
  });
  if (missing.size > 0) {
    throw new Error(
      `Unknown workflow template variable${missing.size === 1 ? "" : "s"}: ${[...missing].join(", ")}`,
    );
  }
  return rendered;
}

function resolvePromptVariable(
  name: string,
  payload: Record<string, unknown>,
  customVariables: Record<string, string>,
  builtInVariables: Record<string, string>,
): string | undefined {
  const payloadValue = getPayloadPath(payload, name);
  if (payloadValue.found) {
    return stringifyPromptValue(payloadValue.value);
  }
  return customVariables[name] ?? builtInVariables[name];
}

function getPayloadPath(
  payload: Record<string, unknown>,
  requestedPath: string,
): { found: boolean; value: unknown } {
  const path = requestedPath === "payload" ? "" : requestedPath.replace(/^payload\./, "");
  if (!path) {
    return { found: true, value: payload };
  }
  let current: unknown = payload;
  for (const segment of path.split(".")) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      const index = Number(segment);
      if (index >= current.length) {
        return { found: false, value: undefined };
      }
      current = current[index];
      continue;
    }
    if (
      typeof current !== "object" ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return { found: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return { found: true, value: current };
}

function stringifyPromptValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined) {
    return "";
  }
  return JSON.stringify(value) ?? "";
}

interface ResolvedWorkflowRetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
}

function resolveStepRetryPolicy(
  script: WorkflowScript,
  step: WorkflowStep,
): ResolvedWorkflowRetryPolicy {
  const defaultRetry = script.taskDefaults?.retry;
  const stepRetry =
    step.type === "bash" || step.type === "python" || step.type === "agent"
      ? step.retry
      : undefined;
  const configured =
    defaultRetry || stepRetry
      ? {
          ...defaultRetry,
          ...stepRetry,
        }
      : undefined;
  return {
    maxAttempts: configured?.maxAttempts ?? 1,
    initialDelayMs: configured?.initialDelayMs ?? 1_000,
    maxDelayMs: configured?.maxDelayMs ?? 30_000,
    backoffMultiplier: configured?.backoffMultiplier ?? 2,
    jitter: configured?.jitter ?? true,
  };
}

function calculateRetryDelay(policy: ResolvedWorkflowRetryPolicy, failedAttempt: number): number {
  const exponentialDelay = Math.min(
    policy.maxDelayMs,
    policy.initialDelayMs * policy.backoffMultiplier ** Math.max(0, failedAttempt - 1),
  );
  if (!policy.jitter || exponentialDelay === 0) {
    return Math.round(exponentialDelay);
  }
  return Math.round(exponentialDelay * (0.5 + Math.random() * 0.5));
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Promise<void>,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      void onTimeout().finally(() => reject(new Error(message)));
    }, timeoutMs);
    timer.unref?.();
  });
  operation.catch(() => undefined);
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function validateRetryPolicy(
  policy: Partial<WorkflowRetryPolicy> | undefined,
  label: string,
): void {
  if (
    policy?.maxDelayMs !== undefined &&
    policy.initialDelayMs !== undefined &&
    policy.maxDelayMs < policy.initialDelayMs
  ) {
    throw new Error(`${label} retry maxDelayMs cannot be less than initialDelayMs`);
  }
}

function validateWorkflowScript(script: WorkflowScript): void {
  if (script.apiVersion !== "paseo.sh/workflow/v1" || script.kind !== "Workflow") {
    throw new Error(
      'Workflow version 1 requires apiVersion "paseo.sh/workflow/v1" and kind "Workflow"',
    );
  }
  let count = 0;
  const ids = new Set<string>();
  validateWorkflowNodeSchema(script.outputSchema, "Workflow outputSchema");
  const workflowInputSchema = script.steps[0]?.inputSchema;
  const presetIds = new Set<string>();
  for (const preset of script.inputPresets ?? []) {
    if (presetIds.has(preset.id)) {
      throw new Error(`Duplicate workflow input preset id: ${preset.id}`);
    }
    presetIds.add(preset.id);
    validateWorkflowNodeData(
      workflowInputSchema,
      preset.payload,
      `Workflow input preset "${preset.name}"`,
    );
  }
  validateRetryPolicy(script.taskDefaults?.retry, "Workflow default");
  // oxlint-disable-next-line complexity -- Recursive validation keeps graph, retry, schema, branch, and loop checks deterministic.
  const visit = (steps: WorkflowStep[], depth: number, insideFor = false): void => {
    if (depth > MAX_WORKFLOW_DEPTH) {
      throw new Error(`Workflow nesting exceeds ${MAX_WORKFLOW_DEPTH} levels`);
    }
    const linkError = validateWorkflowSequenceLinks(steps);
    if (linkError) {
      throw new Error(linkError);
    }
    for (const step of steps) {
      count += 1;
      if (count > MAX_WORKFLOW_STEPS) {
        throw new Error(`Workflow exceeds ${MAX_WORKFLOW_STEPS} steps`);
      }
      if (ids.has(step.id)) {
        throw new Error(`Duplicate workflow step id: ${step.id}`);
      }
      ids.add(step.id);
      validateWorkflowNodeSchema(step.inputSchema, `Workflow step ${step.id} inputSchema`);
      if (step.type === "bash" || step.type === "python" || step.type === "agent") {
        validateRetryPolicy(
          script.taskDefaults?.retry || step.retry
            ? { ...script.taskDefaults?.retry, ...step.retry }
            : undefined,
          `Workflow step ${step.id}`,
        );
        validateWorkflowNodeSchema(step.outputSchema, `Workflow step ${step.id} outputSchema`);
        if (step.type === "agent" && (step.lifecycle ?? "single") === "for" && !insideFor) {
          throw new Error(`Agent step ${step.id} with For lifecycle must be inside a For loop`);
        }
      }
      if (step.type === "switch") {
        const normalizedCases = new Set<string>();
        for (const candidate of step.cases) {
          const normalized =
            typeof candidate.equals === "string" && !step.caseSensitive
              ? candidate.equals.toLowerCase()
              : JSON.stringify(candidate.equals);
          if (normalizedCases.has(normalized)) {
            throw new Error(`Switch step ${step.id} has duplicate case: ${candidate.equals}`);
          }
          normalizedCases.add(normalized);
          visit(candidate.steps, depth + 1, insideFor);
        }
        visit(step.defaultSteps ?? [], depth + 1, insideFor);
      } else if (step.type === "for") {
        const mode = step.mode ?? "array";
        if (mode !== "true" && !step.items) {
          throw new Error(`For step ${step.id} in ${mode} mode requires items`);
        }
        try {
          resolveWorkflowForExecutionConfig(step);
        } catch (error) {
          if (error instanceof WorkflowForExecutionModeError) {
            throw new Error(error.message, { cause: error });
          }
          throw error;
        }
        visit(step.steps, depth + 1, true);
      }
    }
  };
  visit(script.steps, 1);
}

function createCommandDiagnostics(input: {
  instruction: string;
  cwd: string;
  output: WorkflowCommandOutput;
  environment: ResolvedWorkflowCommandEnvironment;
}): WorkflowNodeDiagnostics {
  return {
    expandedInstruction: trimOutput(input.instruction),
    cwd: input.cwd,
    stdout: input.output.stdout || null,
    stderr: input.output.stderr || null,
    exitCode: input.output.exitCode,
    signal: input.output.signal,
    environmentSource: input.environment.source,
    environmentPath: input.environment.path,
  };
}

function throwCommandFailure(input: {
  error: unknown;
  state: ExecutionState;
  instruction: string;
  cwd: string;
  environment: ResolvedWorkflowCommandEnvironment;
}): never {
  if (!(input.error instanceof WorkflowCommandExecutionError)) {
    throw input.error;
  }
  const message = input.error.message;
  throw new WorkflowExecutionError(
    message,
    input.state,
    input.error.timedOut ? "TASK_TIMEOUT" : "TASK_FAILED",
    "failed",
    createCommandDiagnostics({
      instruction: input.instruction,
      cwd: input.cwd,
      output: input.error.output,
      environment: input.environment,
    }),
  );
}

function countSteps(steps: WorkflowStep[]): number {
  return steps.reduce((count, step) => {
    if (step.type === "switch") {
      return (
        count +
        1 +
        step.cases.reduce((sum, candidate) => sum + countSteps(candidate.steps), 0) +
        countSteps(step.defaultSteps ?? [])
      );
    }
    if (step.type === "for") {
      return count + 1 + countSteps(step.steps);
    }
    return count + 1;
  }, 0);
}

function trimOutput(value: string): string {
  return value.length <= MAX_OUTPUT_CHARS ? value : value.slice(value.length - MAX_OUTPUT_CHARS);
}

function buildWorkflowAgentConfig(
  step: WorkflowAgentStep,
  cwd: string,
  systemPrompt: string | undefined,
): AgentSessionConfig {
  return {
    provider: step.config.provider,
    cwd,
    modeId: step.config.modeId,
    model: step.config.model,
    thinkingOptionId: step.config.thinkingOptionId,
    title: step.config.title,
    providerOptions: step.config.providerOptions,
    featureValues: step.config.featureValues,
    systemPrompt,
    mcpServers: step.config.mcpServers as AgentSessionConfig["mcpServers"],
  };
}

function createAgentNodeResultEnvelope(
  step: WorkflowAgentStep,
  responseText: string,
): WorkflowNodeResultEnvelope {
  const response = responseText.trim();
  if ((step.outputMode ?? "normal") === "custom") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response);
    } catch (error) {
      throw new Error("Custom Agent output must be a JSON result envelope", { cause: error });
    }
    const result = WorkflowNodeResultEnvelopeSchema.parse(parsed);
    if (result.base_resp.status_code !== 0) {
      throw new WorkflowNodeBusinessError(
        result.base_resp.status_msg ||
          `Workflow Agent returned status_code ${result.base_resp.status_code}`,
        result.base_resp.forbid_retry !== 0,
      );
    }
    return result;
  }
  return {
    data: { answer: response },
    modify: {
      workflow: { var: {} },
      loop: { var: {} },
    },
    base_resp: {
      status_code: 0,
      status_msg: "",
      forbid_retry: 0,
    },
    artifacts: [],
  };
}

function resolveForControl(step: WorkflowForStep, state: ExecutionState): string {
  if (!step.forControl) {
    return "";
  }
  const value = resolveWorkflowExpression(
    step.forControl,
    createDataMappingContext(state, step.id),
  );
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (value !== "break" && value !== "continue") {
    throw new WorkflowExecutionError(
      `For step ${step.id} control must resolve to "break", "continue", or an empty value`,
      state,
      "WORKFLOW_INVALID_INPUT",
    );
  }
  return value;
}

function workflowValuesEqual(left: unknown, right: unknown, caseSensitive: boolean): boolean {
  if (typeof left === "string" && typeof right === "string" && !caseSensitive) {
    return left.toLowerCase() === right.toLowerCase();
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatWorkflowValue(value: unknown): string {
  return typeof value === "string"
    ? JSON.stringify(value)
    : (JSON.stringify(value) ?? String(value));
}
