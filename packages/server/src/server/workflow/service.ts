import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Logger } from "pino";
import {
  WorkflowNodeResultSchema,
  WorkflowPayloadSchema,
  WorkflowScriptSchema,
  type WorkflowAgentStep,
  type WorkflowBashStep,
  type WorkflowForStep,
  type WorkflowNodeResult,
  type WorkflowNodeRun,
  type WorkflowPayload,
  type WorkflowPromptVariables,
  type WorkflowRetryPolicy,
  type WorkflowRun,
  type WorkflowScript,
  type WorkflowScriptFile,
  type WorkflowScriptSummary,
  type WorkflowStep,
  type WorkflowSwitchStep,
} from "@getpaseo/protocol/workflow/types";
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
import { WorkflowRunStore } from "./store.js";

const DEFAULT_SHELL = process.platform === "win32" ? "cmd.exe" : "/bin/bash";
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_MAX_ITERATIONS = 100;
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
  filePath: string;
  hasFileOutput: boolean;
  iterationPath: number[];
}

interface StepExecutionResult extends ExecutionState {
  agentId: string | null;
  output: string | null;
}

type WorkflowTerminalStatus = Extract<WorkflowRun["status"], "failed" | "cancelled" | "timed_out">;

class WorkflowExecutionError extends Error {
  constructor(
    message: string,
    readonly state: ExecutionState,
    readonly code = "TASK_FAILED",
    readonly terminalStatus: WorkflowTerminalStatus = "failed",
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
  private readonly activeBashProcesses = new Map<ChildProcess, string>();
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
    this.store = new WorkflowRunStore(join(options.paseoHome, "workflow-runs"));
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
    for (const child of this.activeBashProcesses.keys()) {
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
  }): Promise<WorkflowRun> {
    if (!this.acceptingRuns) {
      throw new Error("Workflow service is shutting down");
    }
    const scriptFile = await this.inspectScript(input.scriptPath);
    let inputPayload: WorkflowPayload;
    let inputFilePath: string;
    if (input.inputPayload !== undefined) {
      inputPayload = parseInitialPayload(input.inputPayload, dirname(scriptFile.path));
      inputFilePath = getPayloadString(inputPayload, "filePath") ?? "";
    } else if (input.inputFilePath !== undefined) {
      inputFilePath = resolveWorkflowPath(input.inputFilePath);
      await assertExistingPath(inputFilePath, "Workflow input");
      inputPayload = createInitialPayload(inputFilePath);
    } else {
      throw new Error("Workflow input JSON is required");
    }
    const startedAt = this.now().toISOString();
    const run = await this.store.create({
      scriptPath: scriptFile.path,
      scriptSnapshot: scriptFile.script,
      status: "running",
      inputPayload: serializeNodeInputPayload(inputPayload),
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
  }): Promise<WorkflowRun> {
    const run = await this.runScript(input);
    await this.activeRuns.get(run.id);
    return this.getRun(run.id);
  }

  private async executeRun(run: WorkflowRun): Promise<void> {
    const initialPayload =
      parseStoredPayload(run.inputPayload) ?? createInitialPayload(run.inputFilePath);
    let state: ExecutionState = {
      payload: initialPayload,
      filePath: run.inputFilePath || run.scriptPath,
      hasFileOutput: false,
      iterationPath: [],
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
      state = await this.executeSteps(run, run.scriptSnapshot.steps, state);
      this.assertRunActive(run.id, state);
      await this.finishRun(run.id, {
        status: "succeeded",
        outputPayload: serializePayload(state.payload),
        outputFilePath: state.hasFileOutput ? state.filePath : null,
        control: state.payload.control,
        error: null,
        errorCode: null,
      });
    } catch (error) {
      await this.finishRun(run.id, buildFailedRunResult(error, state));
    } finally {
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
    for (const step of steps) {
      this.assertRunActive(run.id, state);
      state = await this.executeStep(run, step, state);
    }
    return state;
  }

  private async executeStep(
    run: WorkflowRun,
    step: WorkflowStep,
    state: ExecutionState,
  ): Promise<ExecutionState> {
    const retry = resolveStepRetryPolicy(run.scriptSnapshot, step);
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      this.assertRunActive(run.id, state);
      const nodeRunId = randomUUID();
      await this.appendNodeRun(run.id, {
        id: nodeRunId,
        stepId: step.id,
        stepName: step.name ?? null,
        stepType: step.type,
        iterationPath: state.iterationPath,
        startedAt: this.now().toISOString(),
        endedAt: null,
        status: "running",
        attempt,
        maxAttempts: retry.maxAttempts,
        retryDelayMs: null,
        inputPayload: serializeNodeInputPayload(state.payload),
        outputPayload: null,
        inputFilePath: getPayloadString(state.payload, "filePath") ?? "",
        outputFilePath: null,
        inputControl: state.payload.control,
        outputControl: null,
        error: null,
        errorCode: null,
        agentId: null,
        output: null,
      });
      try {
        let result: StepExecutionResult;
        switch (step.type) {
          case "bash":
            result = await this.executeBashStep(run, step, state, attempt);
            break;
          case "agent":
            result = await this.executeAgentStep(run, step, state, attempt);
            break;
          case "switch":
            result = await this.executeSwitchStep(run, step, state);
            break;
          case "for":
            result = await this.executeForStep(run, step, state);
            break;
        }
        this.assertRunActive(run.id, result);
        await this.completeNodeRun(run.id, nodeRunId, {
          status: "succeeded",
          outputPayload: serializePayload(result.payload),
          outputFilePath: result.hasFileOutput ? result.filePath : null,
          outputControl: result.payload.control,
          error: null,
          errorCode: null,
          agentId: result.agentId,
          output: result.output,
          retryDelayMs: null,
        });
        return {
          payload: result.payload,
          filePath: result.filePath,
          hasFileOutput: result.hasFileOutput,
          iterationPath: state.iterationPath,
        };
      } catch (error) {
        const executionError = this.normalizeExecutionError(error, run.id, state);
        const canRetry =
          attempt < retry.maxAttempts &&
          executionError.terminalStatus === "failed" &&
          (step.type === "bash" || step.type === "agent");
        const retryDelayMs = canRetry ? calculateRetryDelay(retry, attempt) : null;
        await this.completeNodeRun(run.id, nodeRunId, {
          status:
            executionError.code === "TASK_TIMEOUT" ? "timed_out" : executionError.terminalStatus,
          outputPayload: serializePayload(executionError.state.payload),
          outputFilePath: executionError.state.hasFileOutput ? executionError.state.filePath : null,
          outputControl: executionError.state.payload.control,
          error: executionError.message,
          errorCode: executionError.code,
          agentId: null,
          output: null,
          retryDelayMs,
        });
        if (!canRetry) {
          throw executionError;
        }
        await this.waitForRetryDelay(run.id, retryDelayMs ?? 0);
      }
    }
    throw new WorkflowExecutionError(`Workflow step ${step.id} exhausted its retry policy`, state);
  }

  private async executeBashStep(
    run: WorkflowRun,
    step: WorkflowBashStep,
    state: ExecutionState,
    attempt: number,
  ): Promise<StepExecutionResult> {
    const renderedInstruction = await renderWorkflowInstruction({
      template: step.initialCommand,
      variables: step.variables,
      state,
      runId: run.id,
      stepId: step.id,
      stepName: step.name,
      attempt,
    });
    const cwd = await resolveStepCwd(step.cwd, state.filePath);
    const output = await runBashInstruction({
      instruction: renderedInstruction,
      inputPayload: state.payload,
      inputFilePath: getPayloadString(state.payload, "filePath") ?? "",
      iterationPath: state.iterationPath,
      cwd,
      shell: step.shell ?? DEFAULT_SHELL,
      timeoutMs: step.timeoutMs ?? run.scriptSnapshot.taskDefaults?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      runId: run.id,
      stepId: step.id,
      attempt,
      onSpawn: (child) => this.activeBashProcesses.set(child, run.id),
      onClose: (child) => this.activeBashProcesses.delete(child),
    });
    const result = readBashNodeResult(output.stdout, cwd);
    return this.validateNodeResult(result, state, null, formatProcessOutput(output));
  }

  // oxlint-disable-next-line complexity -- Agent task execution intentionally centralizes workspace lifecycle, timeout cancellation, provider result validation, and archival.
  private async executeAgentStep(
    run: WorkflowRun,
    step: WorkflowAgentStep,
    state: ExecutionState,
    attempt: number,
  ): Promise<StepExecutionResult> {
    const cwd = await resolveStepCwd(step.config.cwd, state.filePath);
    const renderedInstruction = await renderWorkflowInstruction({
      template: step.initialPrompt,
      variables: step.promptVariables,
      state,
      runId: run.id,
      stepId: step.id,
      stepName: step.name,
      attempt,
    });
    const workflowPrompt = buildAgentWorkflowPrompt({
      instruction: renderedInstruction,
      inputPayload: state.payload,
      iterationPath: state.iterationPath,
      attempt,
      systemPrompt: step.config.systemPrompt,
    });
    const baseLabels = {
      "paseo.workflow-run": run.id,
      "paseo.workflow-step": step.id,
      "paseo.workflow-attempt": String(attempt),
    };
    const { prompt, labels } = this.resolveAgentIdentityContext(step, workflowPrompt, baseLabels);
    let workspace: PersistedWorkspaceRecord | null = null;
    let agentId: string | null = null;
    try {
      workspace =
        (step.config.isolation ?? "local") === "worktree"
          ? (await this.createPaseoWorktreeWorkspace({ cwd, firstAgentContext: { prompt } }))
              .workspace
          : await this.createDirectoryWorkspace({ cwd, firstAgentContext: { prompt } });
      const config = buildWorkflowAgentConfig(step, workspace.cwd);
      const created = await this.createAgent({
        kind: "mcp",
        provider: formatProviderModel(config.provider, config.model),
        config,
        cwd: workspace.cwd,
        workspaceId: workspace.workspaceId,
        title:
          resolveCreateAgentTitles({
            configTitle: step.config.title,
            initialPrompt: renderedInstruction,
          }).provisionalTitle ?? `Workflow: ${step.name ?? step.id}`,
        labels,
        mode: config.modeId,
        thinking: config.thinkingOptionId,
        features: config.featureValues,
        unattended: true,
        promptFailure: "return-error",
        background: true,
        notifyOnFinish: false,
      });
      agentId = created.snapshot.id;
      const activeAgentId = agentId;
      this.trackActiveAgent(run.id, activeAgentId);
      if (created.initialPromptError) {
        throw created.initialPromptError;
      }
      const timeoutMs =
        step.timeoutMs ?? run.scriptSnapshot.taskDefaults?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const { result, waitResult } = await withTimeout(
        (async () => {
          const agentResult = await this.agentManager.runAgent(activeAgentId, prompt);
          const agentWaitResult = await this.agentManager.waitForAgentEvent(activeAgentId, {
            waitForActive: true,
          });
          return { result: agentResult, waitResult: agentWaitResult };
        })(),
        timeoutMs,
        async () => {
          await this.agentManager.cancelAgentRun(activeAgentId).catch((error) => {
            this.logger.warn(
              { err: error, runId: run.id, stepId: step.id, agentId: activeAgentId },
              "Failed to cancel timed out workflow agent",
            );
          });
        },
        `Agent workflow node timed out after ${timeoutMs}ms`,
      );
      if (result.canceled) {
        throw new Error(`Workflow agent ${agentId} was canceled`);
      }
      if (waitResult.permission) {
        throw new Error(`Workflow agent ${agentId} is waiting for permission`);
      }
      if (waitResult.status === "error") {
        throw new Error(waitResult.lastMessage ?? `Workflow agent ${agentId} failed`);
      }
      const responseText = result.finalText ?? waitResult.lastMessage ?? "";
      const parsed = parseNodeResult(responseText, cwd);
      const timelineText = curateAgentActivity(result.timeline);
      return this.validateNodeResult(
        parsed,
        state,
        agentId,
        trimOutput([timelineText, responseText].filter(Boolean).join("\n\n")),
      );
    } finally {
      if (agentId) {
        this.untrackActiveAgent(run.id, agentId);
      }
      if (workspace && (step.config.archiveOnFinish ?? true)) {
        await this.archiveWorkspace(workspace.workspaceId).catch((error) => {
          this.logger.warn(
            { err: error, runId: run.id, stepId: step.id, workspaceId: workspace?.workspaceId },
            "Failed to archive workflow agent workspace",
          );
        });
      }
    }
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
    const normalize = step.caseSensitive
      ? (value: string) => value
      : (value: string) => value.toLowerCase();
    const selected = step.cases.find(
      (candidate) => normalize(candidate.equals) === normalize(state.payload.control),
    );
    const branch = selected?.steps ?? step.defaultSteps ?? [];
    const next = await this.executeSteps(run, branch, state);
    return {
      ...next,
      agentId: null,
      output: selected
        ? `Matched control "${state.payload.control}" to "${selected.equals}"`
        : `Used default branch for control "${state.payload.control}"`,
    };
  }

  private async executeForStep(
    run: WorkflowRun,
    step: WorkflowForStep,
    state: ExecutionState,
  ): Promise<StepExecutionResult> {
    const maxIterations = step.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const items = parseForItems(state.payload.control, step.separator, maxIterations);
    if (items.length > maxIterations) {
      throw new WorkflowExecutionError(
        `For step ${step.id} produced ${items.length} iterations; maximum is ${maxIterations}`,
        state,
      );
    }
    let next = state;
    let completedIterations = 0;
    let brokeEarly = false;
    iterationLoop: for (const [index, item] of items.entries()) {
      let iterationState: ExecutionState = {
        ...next,
        payload: {
          ...next.payload,
          control: item.control ?? next.payload.control,
          error: "",
          loop: {
            item: item.value,
            index,
            count: items.length,
          },
        },
        iterationPath: [...state.iterationPath, index],
      };
      for (const childStep of step.steps) {
        iterationState = await this.executeStep(run, childStep, iterationState);
        if (
          iterationState.payload.control === "break" ||
          iterationState.payload.control === step.breakControl
        ) {
          next = iterationState;
          completedIterations += 1;
          brokeEarly = true;
          break iterationLoop;
        }
        if (iterationState.payload.control === "continue") {
          next = iterationState;
          completedIterations += 1;
          continue iterationLoop;
        }
      }
      next = iterationState;
      completedIterations += 1;
    }
    return {
      ...next,
      iterationPath: state.iterationPath,
      agentId: null,
      output: brokeEarly
        ? `Stopped after ${completedIterations} of ${items.length} iterations`
        : `Completed ${completedIterations} iteration${completedIterations === 1 ? "" : "s"}`,
    };
  }

  private async validateNodeResult(
    result: WorkflowNodeResult,
    state: ExecutionState,
    agentId: string | null,
    output: string | null,
  ): Promise<StepExecutionResult> {
    const payload = normalizePayloadPaths(result, dirname(state.filePath));
    const hasFileOutput = getPayloadString(payload, "filePath") !== null;
    const filePath = resolvePayloadFilePath(payload, state.filePath);
    if (result.error.trim()) {
      throw new WorkflowExecutionError(result.error.trim(), {
        ...state,
        payload,
        filePath,
        hasFileOutput,
      });
    }
    return {
      payload,
      filePath,
      hasFileOutput,
      iterationPath: state.iterationPath,
      agentId,
      output,
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
    for (const [child, childRunId] of this.activeBashProcesses) {
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
    this.assertRunActive(runId, {
      payload:
        parseStoredPayload(run.outputPayload) ??
        parseStoredPayload(run.inputPayload) ??
        createInitialPayload(run.inputFilePath),
      filePath: run.outputFilePath ?? (run.inputFilePath || run.scriptPath),
      hasFileOutput:
        getPayloadString(
          parseStoredPayload(run.outputPayload) ??
            parseStoredPayload(run.inputPayload) ??
            createInitialPayload(run.inputFilePath),
          "filePath",
        ) !== null || run.outputFilePath !== null,
      iterationPath: [],
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
      | "output"
      | "retryDelayMs"
    >,
  ): Promise<void> {
    const updated = await this.store.update(runId, (run) => ({
      ...run,
      outputPayload: result.outputPayload ?? run.outputPayload,
      outputFilePath: result.outputFilePath ?? run.outputFilePath,
      control: result.outputControl ?? run.control,
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
      "status" | "outputPayload" | "outputFilePath" | "control" | "error" | "errorCode"
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
  return {
    control: "",
    error: "",
    filePath: inputFilePath,
  };
}

function parseInitialPayload(inputPayload: string, baseDirectory: string): WorkflowPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(inputPayload);
  } catch (error) {
    throw new Error("Workflow input must be a valid JSON object", { cause: error });
  }
  let normalized = parsed;
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    const { error: _frameworkError, ...nodeInput } = record;
    normalized = {
      ...nodeInput,
      control: Object.hasOwn(nodeInput, "control") ? nodeInput.control : "",
      error: "",
    };
  }
  const result = WorkflowPayloadSchema.safeParse(normalized);
  if (!result.success) {
    throw new Error(
      'Workflow input must be a JSON object; field "control" must be a string when provided',
      { cause: result.error },
    );
  }
  return normalizePayloadPaths(result.data, baseDirectory);
}

function buildFailedRunResult(
  error: unknown,
  fallbackState: ExecutionState,
): Pick<
  WorkflowRun,
  "status" | "outputPayload" | "outputFilePath" | "control" | "error" | "errorCode"
> {
  const executionError = error instanceof WorkflowExecutionError ? error : null;
  const state = executionError?.state ?? fallbackState;
  return {
    status: executionError?.terminalStatus ?? "failed",
    outputPayload: serializePayload(state.payload),
    outputFilePath: state.hasFileOutput ? state.filePath : null,
    control: state.payload.control,
    error: error instanceof Error ? error.message : String(error),
    errorCode: executionError?.code ?? "WORKFLOW_FAILED",
  };
}

function serializePayload(payload: WorkflowPayload): string {
  return JSON.stringify(payload);
}

function createNodeInputPayload(payload: WorkflowPayload): Record<string, unknown> {
  const { error: _frameworkError, ...nodeInputPayload } = payload;
  return nodeInputPayload;
}

function serializeNodeInputPayload(payload: WorkflowPayload): string {
  return JSON.stringify(createNodeInputPayload(payload));
}

function parseStoredPayload(value: string | null): WorkflowPayload | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = WorkflowNodeResultSchema.safeParse(JSON.parse(value));
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
  variables: WorkflowPromptVariables | undefined;
  state: ExecutionState;
  runId: string;
  stepId: string;
  stepName: string | undefined;
  attempt: number;
}): Promise<string> {
  const nodeInputPayload = createNodeInputPayload(input.state.payload);
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
    control: input.state.payload.control,
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
  const stepRetry = step.type === "bash" || step.type === "agent" ? step.retry : undefined;
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
  let count = 0;
  const ids = new Set<string>();
  validateRetryPolicy(script.taskDefaults?.retry, "Workflow default");
  const visit = (steps: WorkflowStep[], depth: number): void => {
    if (depth > MAX_WORKFLOW_DEPTH) {
      throw new Error(`Workflow nesting exceeds ${MAX_WORKFLOW_DEPTH} levels`);
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
      if (step.type === "bash" || step.type === "agent") {
        validateRetryPolicy(
          script.taskDefaults?.retry || step.retry
            ? { ...script.taskDefaults?.retry, ...step.retry }
            : undefined,
          `Workflow step ${step.id}`,
        );
      }
      if (step.type === "switch") {
        const normalizedCases = new Set<string>();
        for (const candidate of step.cases) {
          const normalized = step.caseSensitive ? candidate.equals : candidate.equals.toLowerCase();
          if (normalizedCases.has(normalized)) {
            throw new Error(`Switch step ${step.id} has duplicate case: ${candidate.equals}`);
          }
          normalizedCases.add(normalized);
          visit(candidate.steps, depth + 1);
        }
        visit(step.defaultSteps ?? [], depth + 1);
      } else if (step.type === "for") {
        visit(step.steps, depth + 1);
      }
    }
  };
  visit(script.steps, 1);
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

function buildAgentWorkflowPrompt(input: {
  instruction: string;
  inputPayload: WorkflowPayload;
  iterationPath: number[];
  attempt: number;
  systemPrompt?: string;
}): string {
  const systemPromptDelivery = input.systemPrompt?.trim()
    ? [
        "System prompt delivery: configured separately through the provider's system-instruction",
        "channel; it is not duplicated in this user message.",
      ]
    : [];
  return [
    "You are executing one node in a Paseo workflow.",
    "Input JSON payload:",
    serializeNodeInputPayload(input.inputPayload),
    `Iteration path: ${JSON.stringify(input.iterationPath)}`,
    `Attempt: ${input.attempt}`,
    ...systemPromptDelivery,
    "",
    "Execute the instruction below using values from the input JSON payload.",
    "Your final response MUST be only one valid JSON object.",
    'The object MUST include string fields "control" and "error"; preserve or add any other data',
    "that downstream nodes need. Use a non-empty error string when the workflow must stop.",
    "",
    "Instruction:",
    input.instruction,
  ].join("\n");
}

function buildWorkflowAgentConfig(step: WorkflowAgentStep, cwd: string): AgentSessionConfig {
  return {
    provider: step.config.provider,
    cwd,
    modeId: step.config.modeId,
    model: step.config.model,
    thinkingOptionId: step.config.thinkingOptionId,
    title: step.config.title,
    providerOptions: step.config.providerOptions,
    featureValues: step.config.featureValues,
    systemPrompt: step.config.systemPrompt,
    mcpServers: step.config.mcpServers as AgentSessionConfig["mcpServers"],
  };
}

interface WorkflowForItem {
  control?: string;
  value: unknown;
}

function parseForItems(
  control: string,
  separator: string | undefined,
  maxIterations: number,
): WorkflowForItem[] {
  if (!separator) {
    return Array.from({ length: maxIterations }, () => ({ value: null }));
  }
  const trimmed = control.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        control: typeof item === "string" ? item : JSON.stringify(item),
        value: item,
      }));
    }
  } catch {
    // Fall through to integer or delimiter parsing.
  }
  if (/^\d+$/.test(trimmed)) {
    return Array.from({ length: Number(trimmed) }, (_, index) => ({
      control: String(index),
      value: index,
    }));
  }
  return trimmed
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({ control: item, value: item }));
}

interface ParseNodeResultAttempt {
  result: WorkflowNodeResult | null;
  error: string;
}

function attemptParseNodeResult(text: string, cwd: string): ParseNodeResultAttempt {
  const candidates = [text.trim()];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    candidates.unshift(fenced);
  }
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    candidates.push(text.slice(objectStart, objectEnd + 1));
  }
  let lastError = "Workflow node output is not valid JSON";
  for (const candidate of candidates) {
    try {
      const parsed = parseNodeResultCandidate(candidate);
      return {
        result: normalizePayloadPaths(parsed, cwd),
        error: "",
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // Try the next extraction.
    }
  }
  return {
    result: null,
    error: lastError,
  };
}

function parseNodeResult(text: string, cwd: string): WorkflowNodeResult {
  const attempt = attemptParseNodeResult(text, cwd);
  if (attempt.result) {
    return attempt.result;
  }
  return {
    control: "",
    error: attempt.error,
  };
}

function parseNodeResultCandidate(candidate: string): WorkflowNodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Workflow node output is not valid JSON: ${message}`, { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Workflow node output must be a JSON object");
  }
  const payload = parsed as Record<string, unknown>;
  for (const field of ["control", "error"] as const) {
    const value = payload[field];
    if (value !== undefined && typeof value !== "string") {
      throw new Error(`Workflow node output field "${field}" must be a string`);
    }
  }
  return WorkflowNodeResultSchema.parse({
    ...payload,
    control: payload.control ?? "",
    error: payload.error ?? "",
  });
}

function readBashNodeResult(stdout: string, cwd: string): WorkflowNodeResult {
  const stdoutResultLine = getLastNonEmptyLine(stdout);
  if (stdoutResultLine === null) {
    return {
      control: "",
      error: "Bash workflow node produced no stdout result",
    };
  }
  return parseNodeResult(stdoutResultLine, cwd);
}

function getLastNonEmptyLine(value: string): string | null {
  const lines = value.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (line) {
      return line;
    }
  }
  return null;
}

interface BashExecutionOutput {
  stdout: string;
  stderr: string;
}

function runBashInstruction(input: {
  instruction: string;
  inputPayload: WorkflowPayload;
  inputFilePath: string;
  iterationPath: number[];
  cwd: string;
  shell: string;
  timeoutMs: number;
  runId: string;
  stepId: string;
  attempt: number;
  onSpawn: (child: ChildProcess) => void;
  onClose: (child: ChildProcess) => void;
}): Promise<BashExecutionOutput> {
  return new Promise((resolvePromise, reject) => {
    const inputJson = serializeNodeInputPayload(input.inputPayload);
    const args =
      process.platform === "win32"
        ? ["/d", "/s", "/c", input.instruction]
        : ["-c", input.instruction, "paseo-workflow", inputJson, input.inputFilePath];
    const child = spawn(input.shell, args, {
      cwd: input.cwd,
      env: {
        ...process.env,
        PASEO_WORKFLOW_INPUT_JSON: inputJson,
        PASEO_WORKFLOW_INPUT_FILE: input.inputFilePath,
        PASEO_WORKFLOW_CONTROL: input.inputPayload.control,
        PASEO_WORKFLOW_ITERATION_PATH: JSON.stringify(input.iterationPath),
        PASEO_WORKFLOW_RUN_ID: input.runId,
        PASEO_WORKFLOW_STEP_ID: input.stepId,
        PASEO_WORKFLOW_ATTEMPT: String(input.attempt),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    input.onSpawn(child);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, input.timeoutMs);
    timer.unref?.();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = trimOutput(stdout + String(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderr = trimOutput(stderr + String(chunk));
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      input.onClose(child);
      reject(error);
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      input.onClose(child);
      if (timedOut) {
        reject(new Error(`Bash workflow node timed out after ${input.timeoutMs}ms`));
      } else if (exitCode !== 0) {
        reject(
          new Error(
            `Bash workflow node failed with ${
              exitCode === null ? `signal ${signal ?? "unknown"}` : `exit code ${exitCode}`
            }${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
          ),
        );
      } else {
        resolvePromise({ stdout, stderr });
      }
    });
  });
}

function formatProcessOutput(output: BashExecutionOutput): string | null {
  const sections = [];
  if (output.stdout.trim()) {
    sections.push(`stdout:\n${output.stdout.trimEnd()}`);
  }
  if (output.stderr.trim()) {
    sections.push(`stderr:\n${output.stderr.trimEnd()}`);
  }
  return sections.length > 0 ? sections.join("\n\n") : null;
}
