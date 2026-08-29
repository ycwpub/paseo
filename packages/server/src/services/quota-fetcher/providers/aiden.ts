import { readFile } from "node:fs/promises";
import type { Logger } from "pino";
import { z } from "zod";
import {
  ProviderUsageSchema,
  type ProviderUsage,
  type ProviderUsageBalance,
  type ProviderUsageDetail,
  type ProviderUsageWindow,
} from "../../../server/messages.js";
import { writeJsonFileAtomic } from "../../../server/atomic-file.js";
import { runUsageCommand, usageCommandError, type UsageCommandRunner } from "../command.js";
import type { ProviderUsageFetcher } from "../provider.js";
import { ApiNumberSchema, unavailableUsage, windowFromUsedPct } from "../usage.js";

const AIDEN_COMMAND_TIMEOUT_MS = 20_000;
const AIDEN_COMMAND_MAX_BUFFER_BYTES = 2 * 1024 * 1024;
const AIDEN_SOURCE_LABEL = "Aiden X";
const AIDEN_EMPTY_MODELS_MESSAGE = "Aiden 当前未返回可用模型，暂无用量数据，请稍后重试。";
const AIDEN_LOGIN_MESSAGE = "Aiden 登录状态不可用，请先在终端完成 Aiden 登录后重试。";
const AIDEN_NOT_INSTALLED_MESSAGE = "未检测到 Aiden CLI，请先安装 Aiden 或配置 AIDEN_BIN。";
const AIDEN_GENERIC_ERROR_MESSAGE = "暂时无法获取 Aiden 用量，请稍后重试。";
const AIDEN_CACHE_STATUS_DETAIL_ID = "aiden-cache-status";

const AidenUsageCacheSchema = z.object({
  version: z.literal(1),
  usage: ProviderUsageSchema,
});

const AidenQuotaSchema = z
  .object({
    available_tokens: ApiNumberSchema.optional(),
    available_percent: ApiNumberSchema.optional(),
    reset_time: z.string().nullish(),
    reset_time_ms: ApiNumberSchema.optional(),
    window_hours: ApiNumberSchema.optional(),
  })
  .nullish();

const AidenPtuSchema = z
  .object({
    product_name: z.string().optional(),
    available_percent: ApiNumberSchema.optional(),
    occupancy_percent: ApiNumberSchema.optional(),
  })
  .nullish();

const AidenCapacitySchema = z
  .object({
    usage_percent: ApiNumberSchema.optional(),
    occupancy_percent: ApiNumberSchema.optional(),
    queued: ApiNumberSchema.optional(),
  })
  .nullish();

const AidenModelSchema = z.object({
  id: z.string(),
  quota: AidenQuotaSchema,
  ptu: AidenPtuSchema,
  capacity: AidenCapacitySchema,
});

const AidenModelsResponseSchema = z.object({
  fetched_at: z.string().optional(),
  models: z.array(AidenModelSchema),
});

interface AidenQuotaProviderOptions {
  logger: Logger;
  command?: string;
  runCommand?: UsageCommandRunner;
  cacheFilePath?: string;
}

interface AidenQuotaProviderIdentity {
  providerId: "aiden-codex" | "aiden-claude";
  displayName: "Aiden Codex" | "Aiden Claude";
  cliFlag: "--codex" | "--claude";
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function resetTime(quota: z.infer<typeof AidenQuotaSchema>): string | null {
  if (quota?.reset_time) {
    const parsed = new Date(quota.reset_time);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  if (quota?.reset_time_ms !== undefined) {
    const parsed = new Date(quota.reset_time_ms);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

class AidenQuotaProvider implements ProviderUsageFetcher {
  readonly providerId: AidenQuotaProviderIdentity["providerId"];
  readonly displayName: AidenQuotaProviderIdentity["displayName"];

  private readonly cliFlag: AidenQuotaProviderIdentity["cliFlag"];
  private readonly command: string;
  private readonly runCommand: UsageCommandRunner;
  private readonly logger: Logger;
  private readonly cacheFilePath: string | null;
  private cacheLoaded = false;
  private lastSuccessfulUsage: ProviderUsage | null = null;

  constructor(identity: AidenQuotaProviderIdentity, options: AidenQuotaProviderOptions) {
    this.providerId = identity.providerId;
    this.displayName = identity.displayName;
    this.cliFlag = identity.cliFlag;
    this.command = options.command ?? process.env["AIDEN_BIN"] ?? "aiden";
    this.runCommand = options.runCommand ?? runUsageCommand;
    this.logger = options.logger.child({ provider: identity.providerId });
    this.cacheFilePath = options.cacheFilePath ?? null;
  }

  async fetchUsage(): Promise<ProviderUsage> {
    await this.loadCachedUsage();

    let stdout: string;
    try {
      ({ stdout } = await this.runCommand(
        this.command,
        ["x", "models", "--json", this.cliFlag, "--timeout", "15000"],
        {
          timeoutMs: AIDEN_COMMAND_TIMEOUT_MS,
          maxBufferBytes: AIDEN_COMMAND_MAX_BUFFER_BYTES,
        },
      ));
    } catch (error) {
      const message = usageCommandError(error);
      this.logger.debug({ err: error }, "Aiden usage command failed");
      return this.fallbackUsage(message);
    }

    let response: z.infer<typeof AidenModelsResponseSchema>;
    try {
      response = AidenModelsResponseSchema.parse(JSON.parse(stdout));
    } catch (error) {
      this.logger.debug({ err: error }, "Aiden usage output was invalid");
      return this.fallbackUsage(AIDEN_GENERIC_ERROR_MESSAGE);
    }

    if (response.models.length === 0) {
      return this.fallbackUsage(AIDEN_EMPTY_MODELS_MESSAGE);
    }

    const windows: ProviderUsageWindow[] = [];
    const balances: ProviderUsageBalance[] = [];
    const details: ProviderUsageDetail[] = [];

    for (const model of response.models) {
      if (model.quota?.available_percent !== undefined) {
        windows.push(
          windowFromUsedPct({
            id: `quota:${model.id}`,
            label: model.id,
            utilizationPct: clampPercent(100 - model.quota.available_percent),
            resetsAt: resetTime(model.quota),
            tone: model.quota.available_percent < 20 ? "warning" : "ok",
          }),
        );
      }
      if (model.quota?.available_tokens !== undefined) {
        balances.push({
          id: `tokens:${model.id}`,
          label: `${model.id} 可用`,
          remaining: model.quota.available_tokens,
          unit: "tokens",
          resetsAt: resetTime(model.quota),
          tone: model.quota.available_tokens <= 0 ? "danger" : "ok",
        });
      }
      if (model.ptu?.available_percent !== undefined) {
        windows.push(
          windowFromUsedPct({
            id: `ptu:${model.id}`,
            label: `${model.id} · PTU`,
            utilizationPct: clampPercent(100 - model.ptu.available_percent),
            tone: model.ptu.available_percent < 20 ? "warning" : "ok",
          }),
        );
      }
      if (model.capacity?.occupancy_percent !== undefined) {
        details.push({
          id: `capacity:${model.id}`,
          label: `${model.id} 负载`,
          value: `${model.capacity.occupancy_percent}%`,
          tone: model.capacity.occupancy_percent >= 80 ? "warning" : "default",
        });
      }
    }

    const usage: ProviderUsage = {
      providerId: this.providerId,
      displayName: this.displayName,
      status: "available",
      planLabel: null,
      sourceLabel: AIDEN_SOURCE_LABEL,
      fetchedAt: response.fetched_at ?? null,
      windows,
      balances,
      details,
      error: null,
    };
    this.lastSuccessfulUsage = usage;
    await this.persistCachedUsage(usage);
    return usage;
  }

  private fallbackUsage(rawMessage: string): ProviderUsage {
    if (this.lastSuccessfulUsage) {
      return {
        ...this.lastSuccessfulUsage,
        sourceLabel: `${AIDEN_SOURCE_LABEL}（缓存）`,
        details: [
          ...(this.lastSuccessfulUsage.details ?? []).filter(
            (detail) => detail.id !== AIDEN_CACHE_STATUS_DETAIL_ID,
          ),
          {
            id: AIDEN_CACHE_STATUS_DETAIL_ID,
            label: "数据状态",
            value: "暂时显示最近一次成功获取的数据",
            tone: "warning",
          },
        ],
        error: null,
      };
    }

    const message = friendlyAidenUsageError(rawMessage);
    if (message === AIDEN_EMPTY_MODELS_MESSAGE) {
      return this.unavailableWithDetail("aiden-empty-models", message);
    }
    if (message === AIDEN_LOGIN_MESSAGE) {
      return this.unavailableWithDetail("aiden-login-required", message);
    }

    return unavailableUsage({
      providerId: this.providerId,
      displayName: this.displayName,
      error: message,
    });
  }

  private unavailableWithDetail(detailId: string, message: string): ProviderUsage {
    return {
      ...unavailableUsage({
        providerId: this.providerId,
        displayName: this.displayName,
      }),
      sourceLabel: AIDEN_SOURCE_LABEL,
      details: [
        {
          id: detailId,
          label: "状态",
          value: message,
          tone: "warning",
        },
      ],
    };
  }

  private async loadCachedUsage(): Promise<void> {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    if (!this.cacheFilePath) return;

    try {
      const parsed = AidenUsageCacheSchema.parse(
        JSON.parse(await readFile(this.cacheFilePath, "utf8")),
      );
      if (parsed.usage.providerId === this.providerId && parsed.usage.status === "available") {
        this.lastSuccessfulUsage = parsed.usage;
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT") {
        this.logger.debug({ err: error }, "Aiden usage cache could not be read");
      }
    }
  }

  private async persistCachedUsage(usage: ProviderUsage): Promise<void> {
    if (!this.cacheFilePath) return;
    try {
      await writeJsonFileAtomic(this.cacheFilePath, {
        version: 1,
        usage,
      });
    } catch (error) {
      this.logger.debug({ err: error }, "Aiden usage cache could not be written");
    }
  }
}

function friendlyAidenUsageError(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("empty model list") ||
    normalized.includes("未返回可用模型") ||
    normalized.includes("no models")
  ) {
    return AIDEN_EMPTY_MODELS_MESSAGE;
  }
  if (
    normalized.includes("login") ||
    normalized.includes("auth") ||
    normalized.includes("device_code") ||
    normalized.includes("no tty") ||
    normalized.includes("登录")
  ) {
    return AIDEN_LOGIN_MESSAGE;
  }
  if (
    normalized.includes("enoent") ||
    normalized.includes("not found") ||
    normalized.includes("未找到命令")
  ) {
    return AIDEN_NOT_INSTALLED_MESSAGE;
  }
  return AIDEN_GENERIC_ERROR_MESSAGE;
}

export class AidenCodexQuotaProvider extends AidenQuotaProvider {
  constructor(options: AidenQuotaProviderOptions) {
    super(
      {
        providerId: "aiden-codex",
        displayName: "Aiden Codex",
        cliFlag: "--codex",
      },
      options,
    );
  }
}

export class AidenClaudeQuotaProvider extends AidenQuotaProvider {
  constructor(options: AidenQuotaProviderOptions) {
    super(
      {
        providerId: "aiden-claude",
        displayName: "Aiden Claude",
        cliFlag: "--claude",
      },
      options,
    );
  }
}
