import { connectToDaemon, getDaemonHost } from "../../utils/client.js";
import type { CommandError, CommandOptions } from "../../output/index.js";
import type {
  CreateScheduleInput,
  ScheduleCadence,
  ScheduleDaemonClient,
  ScheduleListItem,
  ScheduleRecord,
  ScheduleTarget,
  UpdateScheduleBashConfig,
  UpdateScheduleInput,
  UpdateScheduleNewAgentConfig,
} from "./types.js";
import { parseDuration } from "../../utils/duration.js";
import { resolveProviderAndModel } from "../../utils/provider-model.js";
import { everyMsToFiveFieldCron } from "@getpaseo/protocol/schedule/cadence";

export interface ScheduleCommandOptions extends CommandOptions {
  host?: string;
}

export async function connectScheduleClient(
  host: string | undefined,
): Promise<{ client: ScheduleDaemonClient; host: string }> {
  const resolvedHost = getDaemonHost({ host });
  try {
    const client = (await connectToDaemon({
      host,
    })) as unknown as ScheduleDaemonClient;
    return { client, host: resolvedHost };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw {
      code: "DAEMON_NOT_RUNNING",
      message: `Cannot connect to daemon at ${resolvedHost}: ${message}`,
      details: "Start the daemon with: paseo daemon start",
    } satisfies CommandError;
  }
}

export function toScheduleCommandError(code: string, action: string, error: unknown): CommandError {
  if (error && typeof error === "object" && "code" in error) {
    return error as CommandError;
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    code,
    message: `Failed to ${action}: ${message}`,
  };
}

export async function requireNewAgentSchedule(
  client: ScheduleDaemonClient,
  id: string,
): Promise<void> {
  const payload = await client.scheduleInspect({ id });
  if (
    payload.error ||
    !payload.schedule ||
    (payload.schedule.target.type !== "new-agent" && payload.schedule.target.type !== "bash")
  ) {
    throw new Error(payload.error ?? `Schedule not found: ${id}`);
  }
}

export function formatCadence(cadence: ScheduleCadence): string {
  if (cadence.type === "cron") {
    const timezoneSuffix = cadence.timezone ? ` (${cadence.timezone})` : "";
    return `cron:${cadence.expression}${timezoneSuffix}`;
  }
  return `every:${formatDurationMs(cadence.everyMs)}`;
}

export function formatTarget(target: ScheduleTarget | ScheduleListItem["target"]): string {
  if (target.type === "self") {
    return `self:${target.agentId.slice(0, 7)}`;
  }
  if (target.type === "agent") {
    return `agent:${target.agentId.slice(0, 7)}`;
  }
  if (target.type === "bash") {
    return `bash:${target.config.cwd}`;
  }
  const modelSuffix = target.config.model ? `/${target.config.model}` : "";
  const assistantSuffix = target.config.assistantId ? `@${target.config.assistantId}` : "";
  return `new-agent:${target.config.provider}${modelSuffix}${assistantSuffix}`;
}

export function formatDurationMs(durationMs: number): string {
  const parts: string[] = [];
  let remainingMs = durationMs;
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  if (hours > 0) {
    parts.push(`${hours}h`);
    remainingMs -= hours * 60 * 60 * 1000;
  }
  const minutes = Math.floor(remainingMs / (60 * 1000));
  if (minutes > 0) {
    parts.push(`${minutes}m`);
    remainingMs -= minutes * 60 * 1000;
  }
  const seconds = Math.floor(remainingMs / 1000);
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }
  return parts.join("");
}

function resolveScheduleTarget(args: {
  targetValue: string | undefined;
  hasExplicitNewAgentOption: boolean;
  createNewAgentTarget: () => ScheduleTarget;
}): ScheduleTarget {
  const { targetValue, hasExplicitNewAgentOption, createNewAgentTarget } = args;
  if (!targetValue) {
    return createNewAgentTarget();
  }

  if (targetValue === "new-agent") {
    return createNewAgentTarget();
  }

  if (hasExplicitNewAgentOption) {
    throw {
      code: "INVALID_TARGET",
      message: "--provider/--mode/--thinking can only be used with a new-agent target",
      details: "Use --target new-agent or omit --target to create a new agent schedule",
    } satisfies CommandError;
  }

  if (targetValue === "self") {
    // COMPAT(scheduleSelfTarget): heartbeat creation moved to `paseo heartbeat create`.
    // Added in v0.2.0; remove after 2027-01-17.
    const currentAgentId = process.env.PASEO_AGENT_ID?.trim();
    if (!currentAgentId) {
      throw {
        code: "INVALID_TARGET",
        message: "--target self requires running inside a Paseo agent",
      } satisfies CommandError;
    }
    return { type: "self", agentId: currentAgentId };
  }

  return { type: "agent", agentId: targetValue };
}

interface ScheduleCreateOptionsInput {
  prompt: string;
  type?: string;
  every?: string;
  cron?: string;
  timezone?: string;
  name?: string;
  target?: string;
  provider?: string;
  mode?: string;
  assistant?: string;
  cwd?: string;
  shell?: string;
  timeout?: string;
  host?: string;
  maxRuns?: string;
  expiresIn?: string;
  runNow?: boolean;
}

function parseSchedulePrompt(value: string): string {
  const prompt = value.trim();
  if (!prompt) {
    throw {
      code: "INVALID_PROMPT",
      message: "Schedule prompt cannot be empty",
    } satisfies CommandError;
  }
  return prompt;
}

function parseRequiredCreateCadence(options: ScheduleCreateOptionsInput): ScheduleCadence {
  const cadence = parseCadenceFromFlags(options.every, options.cron, options.timezone);
  if (!cadence) {
    throw {
      code: "INVALID_CADENCE",
      message: "Specify exactly one of --every or --cron",
    } satisfies CommandError;
  }
  return cadence;
}

function parseCreateCwdInput(options: ScheduleCreateOptionsInput): string | undefined {
  const cwdInput = options.cwd?.trim();
  if (options.host !== undefined && !cwdInput) {
    throw {
      code: "MISSING_CWD",
      message:
        "--cwd is required when --host is specified (the local working directory will not exist on the remote daemon)",
    } satisfies CommandError;
  }
  return cwdInput;
}

function validateCreateScheduleTargetOptions(input: {
  options: ScheduleCreateOptionsInput;
  scheduleType: ScheduleCreateType;
  targetValue: string | undefined;
  hasExplicitNewAgentOption: boolean;
}): void {
  if (input.scheduleType !== "new-agent" && input.targetValue) {
    throw {
      code: "INVALID_TARGET",
      message: "--target can only be used with agent schedules",
    } satisfies CommandError;
  }
  if (input.scheduleType === "bash" && input.hasExplicitNewAgentOption) {
    throw {
      code: "INVALID_SCHEDULE_TYPE",
      message: "--provider/--mode cannot be used with --type bash",
    } satisfies CommandError;
  }
  if (
    input.scheduleType === "new-agent" &&
    (input.options.shell !== undefined || input.options.timeout !== undefined)
  ) {
    throw {
      code: "INVALID_SCHEDULE_TYPE",
      message: "--shell/--timeout can only be used with --type bash",
    } satisfies CommandError;
  }
}

function buildCreateScheduleTarget(input: {
  options: ScheduleCreateOptionsInput;
  cwdInput: string | undefined;
  scheduleType: ScheduleCreateType;
}): ScheduleTarget {
  const { options, cwdInput, scheduleType } = input;
  const targetValue = options.target?.trim();
  const modeId = options.mode?.trim();
  const hasExplicitNewAgentOption =
    options.provider !== undefined || options.mode !== undefined || options.assistant !== undefined;
  validateCreateScheduleTargetOptions({
    options,
    scheduleType,
    targetValue,
    hasExplicitNewAgentOption,
  });
  const createNewAgentTarget = (): ScheduleTarget => {
    const resolvedProviderModel = resolveProviderAndModel({
      provider: options.provider,
    });
    const assistantId =
      options.assistant === undefined
        ? undefined
        : parseOptionalStringFlag(options.assistant, "--assistant");
    return {
      type: "new-agent",
      config: {
        provider: resolvedProviderModel.provider,
        cwd: cwdInput ?? process.cwd(),
        ...(resolvedProviderModel.model ? { model: resolvedProviderModel.model } : {}),
        ...(modeId ? { modeId } : {}),
        ...(assistantId ? { assistantId } : {}),
      },
    };
  };
  if (scheduleType === "bash") {
    return createBashScheduleTarget({
      cwd: cwdInput ?? process.cwd(),
      shell: options.shell,
      timeout: options.timeout,
    });
  }
  return resolveScheduleTarget({
    targetValue,
    hasExplicitNewAgentOption,
    createNewAgentTarget,
  });
}

export function parseScheduleCreateInput(options: ScheduleCreateOptionsInput): CreateScheduleInput {
  const prompt = parseSchedulePrompt(options.prompt);
  const cadence = parseRequiredCreateCadence(options);
  const cwdInput = parseCreateCwdInput(options);
  const scheduleType = parseScheduleType(options.type);
  const target = buildCreateScheduleTarget({ options, cwdInput, scheduleType });
  const runOnCreate = resolveRunOnCreate(options.runNow, cadence.type);

  const maxRuns =
    options.maxRuns === undefined ? undefined : parsePositiveInt(options.maxRuns, "--max-runs");
  const expiresAt =
    options.expiresIn === undefined
      ? undefined
      : new Date(Date.now() + parseDuration(options.expiresIn)).toISOString();

  return {
    prompt,
    cadence,
    target,
    runOnCreate,
    ...(options.name?.trim() ? { name: options.name.trim() } : {}),
    ...(maxRuns !== undefined ? { maxRuns } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function resolveRunOnCreate(
  runNow: boolean | undefined,
  _cadenceType: ScheduleCadence["type"],
): boolean {
  return runNow ?? false;
}

export interface ScheduleUpdateOptionsInput {
  id: string;
  type?: string;
  every?: string;
  cron?: string;
  timezone?: string;
  name?: string;
  prompt?: string;
  provider?: string;
  model?: string;
  mode?: string;
  assistant?: string | false;
  cwd?: string;
  shell?: string;
  timeout?: string;
  clearTimeout?: boolean;
  maxRuns?: string;
  expiresIn?: string;
  clearMaxRuns?: boolean;
  clearExpires?: boolean;
}

export function parseScheduleUpdateInput(options: ScheduleUpdateOptionsInput): UpdateScheduleInput {
  const id = options.id.trim();
  if (!id) {
    throw {
      code: "INVALID_SCHEDULE_ID",
      message: "Schedule id cannot be empty",
    } satisfies CommandError;
  }

  const cadence = parseCadenceFromFlags(options.every, options.cron, options.timezone);
  const scheduleType = inferScheduleUpdateType(options);
  validateTypeSpecificUpdateOptions(options, scheduleType);
  const newAgentConfig = scheduleType === "bash" ? undefined : buildNewAgentConfigPatch(options);
  const bashConfig = scheduleType === "bash" ? buildBashConfigPatch(options) : undefined;
  const maxRuns = parseUpdateMaxRuns(options);
  const expiresAt = parseUpdateExpiresAt(options);
  const name = parseUpdateName(options);
  const prompt = parseUpdatePrompt(options);

  if (
    name === undefined &&
    prompt === undefined &&
    cadence === undefined &&
    newAgentConfig === undefined &&
    bashConfig === undefined &&
    maxRuns === undefined &&
    expiresAt === undefined
  ) {
    throw {
      code: "NO_UPDATES",
      message: "Specify at least one field to update",
    } satisfies CommandError;
  }

  return {
    id,
    ...(name !== undefined ? { name } : {}),
    ...(prompt !== undefined ? { prompt } : {}),
    ...(cadence !== undefined ? { cadence } : {}),
    ...(newAgentConfig !== undefined ? { newAgentConfig } : {}),
    ...(bashConfig !== undefined ? { bashConfig } : {}),
    ...(maxRuns !== undefined ? { maxRuns } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };
}

type ScheduleCreateType = "new-agent" | "bash";
type ScheduleUpdateType = ScheduleCreateType;

function parseOptionalScheduleType(value: string | undefined): ScheduleUpdateType | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === "new-agent" || trimmed === "bash") {
    return trimmed;
  }
  throw {
    code: "INVALID_SCHEDULE_TYPE",
    message: "--type must be one of: new-agent, bash",
  } satisfies CommandError;
}

function parseScheduleType(value: string | undefined): ScheduleCreateType {
  return parseOptionalScheduleType(value) ?? "new-agent";
}

function inferScheduleUpdateType(
  options: ScheduleUpdateOptionsInput,
): ScheduleUpdateType | undefined {
  const explicit = parseOptionalScheduleType(options.type);
  if (explicit !== undefined) {
    return explicit;
  }
  if (options.shell !== undefined || options.timeout !== undefined || options.clearTimeout) {
    return "bash";
  }
  return undefined;
}

function validateTypeSpecificUpdateOptions(
  options: ScheduleUpdateOptionsInput,
  scheduleType: ScheduleUpdateType | undefined,
): void {
  const hasBashOption =
    options.shell !== undefined || options.timeout !== undefined || options.clearTimeout;
  const hasNewAgentOption =
    options.provider !== undefined ||
    options.model !== undefined ||
    options.mode !== undefined ||
    options.assistant !== undefined;
  if (scheduleType === "bash" && hasNewAgentOption) {
    throw {
      code: "INVALID_SCHEDULE_TYPE",
      message: "--provider/--model/--mode/--assistant cannot be used with --type bash",
    } satisfies CommandError;
  }
  if (scheduleType === "new-agent" && hasBashOption) {
    throw {
      code: "INVALID_SCHEDULE_TYPE",
      message: "--shell/--timeout/--clear-timeout can only be used with --type bash",
    } satisfies CommandError;
  }
}

function createBashScheduleTarget(options: {
  cwd: string;
  shell?: string;
  timeout?: string;
}): ScheduleTarget {
  const cwd = options.cwd.trim();
  if (!cwd) {
    throw {
      code: "INVALID_CWD",
      message: "--cwd cannot be empty",
    } satisfies CommandError;
  }
  const shell = parseOptionalStringFlag(options.shell, "--shell");
  const timeoutMs =
    options.timeout === undefined ? undefined : parsePositiveDuration(options.timeout, "--timeout");
  return {
    type: "bash",
    config: {
      cwd,
      ...(shell !== undefined ? { shell } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    },
  };
}

function parseCadenceFromFlags(
  every: string | undefined,
  cron: string | undefined,
  timezone: string | undefined,
): ScheduleCadence | undefined {
  if (every !== undefined && cron !== undefined) {
    throw {
      code: "INVALID_CADENCE",
      message: "Specify at most one of --every or --cron",
    } satisfies CommandError;
  }
  const trimmedTimeZone = parseTimeZoneFlag(timezone);
  if (trimmedTimeZone !== undefined && cron === undefined) {
    throw {
      code: "INVALID_TIME_ZONE",
      message: "--timezone can only be used with --cron",
    } satisfies CommandError;
  }
  if (every !== undefined) {
    return { type: "cron", expression: compileEveryPresetToCron(every) };
  }
  if (cron !== undefined) {
    return {
      type: "cron",
      expression: cron.trim(),
      ...(trimmedTimeZone ? { timezone: trimmedTimeZone } : {}),
    };
  }
  return undefined;
}

export function compileEveryPresetToCron(value: string): string {
  const durationMs = parseDuration(value);
  const cron = everyMsToFiveFieldCron(durationMs);
  if (cron) {
    return cron;
  }

  throw {
    code: "UNREPRESENTABLE_CADENCE",
    message: `${value} cannot be represented faithfully by five-field cron`,
    details: "Use --cron for calendar schedules",
  } satisfies CommandError;
}

function parseTimeZoneFlag(timeZone: string | undefined): string | undefined {
  if (timeZone === undefined) {
    return undefined;
  }
  const trimmed = timeZone.trim();
  if (!trimmed) {
    throw {
      code: "INVALID_TIME_ZONE",
      message: "--timezone cannot be empty",
    } satisfies CommandError;
  }
  return trimmed;
}

function parseUpdateMaxRuns(options: ScheduleUpdateOptionsInput): number | null | undefined {
  if (options.maxRuns !== undefined && options.clearMaxRuns) {
    throw {
      code: "CONFLICTING_MAX_RUNS",
      message: "Use either --max-runs <n> or --no-max-runs, not both",
    } satisfies CommandError;
  }
  if (options.clearMaxRuns) {
    return null;
  }
  if (options.maxRuns !== undefined) {
    return parsePositiveInt(options.maxRuns, "--max-runs");
  }
  return undefined;
}

function parseUpdateExpiresAt(options: ScheduleUpdateOptionsInput): string | null | undefined {
  if (options.expiresIn !== undefined && options.clearExpires) {
    throw {
      code: "CONFLICTING_EXPIRES",
      message: "Use either --expires-in <duration> or --no-expires-in, not both",
    } satisfies CommandError;
  }
  if (options.clearExpires) {
    return null;
  }
  if (options.expiresIn !== undefined) {
    return new Date(Date.now() + parseDuration(options.expiresIn)).toISOString();
  }
  return undefined;
}

function parseUpdateName(options: ScheduleUpdateOptionsInput): string | null | undefined {
  if (options.name === undefined) {
    return undefined;
  }
  const trimmed = options.name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseUpdatePrompt(options: ScheduleUpdateOptionsInput): string | undefined {
  if (options.prompt === undefined) {
    return undefined;
  }
  const trimmed = options.prompt.trim();
  if (!trimmed) {
    throw {
      code: "INVALID_PROMPT",
      message: "--prompt cannot be empty",
    } satisfies CommandError;
  }
  return trimmed;
}

function buildNewAgentConfigPatch(
  options: ScheduleUpdateOptionsInput,
): UpdateScheduleNewAgentConfig | undefined {
  const patch: UpdateScheduleNewAgentConfig = {};
  if (options.provider !== undefined || options.model !== undefined) {
    const resolved = resolveProviderAndModel({
      provider: options.provider,
      model: options.model,
    });
    patch.provider = resolved.provider;
    if (resolved.model !== undefined) {
      patch.model = resolved.model;
    }
  }
  if (options.mode !== undefined) {
    const trimmed = options.mode.trim();
    patch.modeId = trimmed.length > 0 ? trimmed : null;
  }
  if (options.assistant !== undefined) {
    if (options.assistant === false) {
      patch.assistantId = null;
    } else {
      const trimmed = options.assistant.trim();
      if (!trimmed) {
        throw {
          code: "INVALID_ASSISTANT",
          message: "--assistant cannot be empty",
        } satisfies CommandError;
      }
      patch.assistantId = trimmed;
    }
  }
  if (options.cwd !== undefined) {
    const trimmed = options.cwd.trim();
    if (!trimmed) {
      throw {
        code: "INVALID_CWD",
        message: "--cwd cannot be empty",
      } satisfies CommandError;
    }
    patch.cwd = trimmed;
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}

function buildBashConfigPatch(
  options: ScheduleUpdateOptionsInput,
): UpdateScheduleBashConfig | undefined {
  if (options.timeout !== undefined && options.clearTimeout) {
    throw {
      code: "CONFLICTING_TIMEOUT",
      message: "Use either --timeout <duration> or --no-timeout, not both",
    } satisfies CommandError;
  }
  const patch: UpdateScheduleBashConfig = {};
  if (options.cwd !== undefined) {
    const trimmed = options.cwd.trim();
    if (!trimmed) {
      throw {
        code: "INVALID_CWD",
        message: "--cwd cannot be empty",
      } satisfies CommandError;
    }
    patch.cwd = trimmed;
  }
  if (options.shell !== undefined) {
    patch.shell = options.shell.trim() || null;
  }
  if (options.timeout !== undefined) {
    patch.timeoutMs = parsePositiveDuration(options.timeout, "--timeout");
  }
  if (options.clearTimeout) {
    patch.timeoutMs = null;
  }
  return Object.keys(patch).length > 0 ? patch : undefined;
}

function parseOptionalStringFlag(value: string | undefined, flag: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw {
      code: "INVALID_OPTION",
      message: `${flag} cannot be empty`,
    } satisfies CommandError;
  }
  return trimmed;
}

function parsePositiveDuration(value: string, flag: string): number {
  const parsed = parseDuration(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw {
      code: "INVALID_DURATION",
      message: `${flag} must be a positive duration`,
    } satisfies CommandError;
  }
  return parsed;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw {
      code: "INVALID_INTEGER",
      message: `${flag} must be a positive integer`,
    } satisfies CommandError;
  }
  return parsed;
}

export interface ScheduleRow {
  id: string;
  name: string | null;
  cadence: string;
  target: string;
  status: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

export function toScheduleRow(schedule: ScheduleListItem | ScheduleRecord): ScheduleRow {
  return {
    id: schedule.id,
    name: schedule.name,
    cadence: formatCadence(schedule.cadence),
    target: formatTarget(schedule.target),
    status: schedule.status,
    nextRunAt: schedule.nextRunAt,
    lastRunAt: schedule.lastRunAt,
  };
}
