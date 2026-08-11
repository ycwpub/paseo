import type { Logger } from "pino";
import { z } from "zod";
import type {
  ProviderUsage,
  ProviderUsageBalance,
  ProviderUsageDetail,
  ProviderUsageWindow,
} from "../../../server/messages.js";
import { runUsageCommand, usageCommandError, type UsageCommandRunner } from "../command.js";
import type { ProviderUsageFetcher } from "../provider.js";
import { ApiNumberSchema, unavailableUsage, windowFromUsedPct } from "../usage.js";

const AIDEN_COMMAND_TIMEOUT_MS = 20_000;
const AIDEN_COMMAND_MAX_BUFFER_BYTES = 2 * 1024 * 1024;

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

  constructor(identity: AidenQuotaProviderIdentity, options: AidenQuotaProviderOptions) {
    this.providerId = identity.providerId;
    this.displayName = identity.displayName;
    this.cliFlag = identity.cliFlag;
    this.command = options.command ?? process.env["AIDEN_BIN"] ?? "aiden";
    this.runCommand = options.runCommand ?? runUsageCommand;
    this.logger = options.logger.child({ provider: identity.providerId });
  }

  async fetchUsage(): Promise<ProviderUsage> {
    let stdout: string;
    try {
      ({ stdout } = await this.runCommand(
        this.command,
        ["x", "models", "--json", this.cliFlag, "--no-cache", "--timeout", "15000"],
        {
          timeoutMs: AIDEN_COMMAND_TIMEOUT_MS,
          maxBufferBytes: AIDEN_COMMAND_MAX_BUFFER_BYTES,
        },
      ));
    } catch (error) {
      const message = usageCommandError(error);
      this.logger.debug({ err: error }, "Aiden usage command failed");
      return unavailableUsage({
        providerId: this.providerId,
        displayName: this.displayName,
        error: message,
      });
    }

    let response: z.infer<typeof AidenModelsResponseSchema>;
    try {
      response = AidenModelsResponseSchema.parse(JSON.parse(stdout));
    } catch (error) {
      this.logger.debug({ err: error }, "Aiden usage output was invalid");
      return unavailableUsage({
        providerId: this.providerId,
        displayName: this.displayName,
        error: "Aiden returned invalid usage data",
      });
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
          label: `${model.id} available`,
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
          label: `${model.id} load`,
          value: `${model.capacity.occupancy_percent}%`,
          tone: model.capacity.occupancy_percent >= 80 ? "warning" : "default",
        });
      }
    }

    return {
      providerId: this.providerId,
      displayName: this.displayName,
      status: "available",
      planLabel: null,
      sourceLabel: "Aiden X",
      fetchedAt: response.fetched_at ?? null,
      windows,
      balances,
      details,
      error: null,
    };
  }
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
