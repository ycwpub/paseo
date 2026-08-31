import type { CommandError } from "../../output/index.js";
import { parseDuration } from "../../utils/duration.js";
import type { ScheduleTarget, UpdateScheduleBashConfig } from "./types.js";

export type ScheduleType = "new-agent" | "bash";

interface CreateTargetOptions {
  shell?: string;
  timeout?: string;
}

interface UpdateTargetOptions {
  type?: string;
  provider?: string;
  model?: string;
  mode?: string;
  assistant?: string | false;
  cwd?: string;
  shell?: string;
  timeout?: string;
  clearTimeout?: boolean;
}

export function parseScheduleType(value: string | undefined): ScheduleType {
  return parseOptionalScheduleType(value) ?? "new-agent";
}

export function inferScheduleUpdateType(options: UpdateTargetOptions): ScheduleType | undefined {
  const explicit = parseOptionalScheduleType(options.type);
  if (explicit !== undefined) {
    return explicit;
  }
  if (options.shell !== undefined || options.timeout !== undefined || options.clearTimeout) {
    return "bash";
  }
  return undefined;
}

export function validateCreateScheduleTargetOptions(input: {
  options: CreateTargetOptions;
  scheduleType: ScheduleType;
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

export function validateTypeSpecificUpdateOptions(
  options: UpdateTargetOptions,
  scheduleType: ScheduleType | undefined,
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

export function createBashScheduleTarget(options: {
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

export function buildBashConfigPatch(
  options: UpdateTargetOptions,
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

function parseOptionalScheduleType(value: string | undefined): ScheduleType | undefined {
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
