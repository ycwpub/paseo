import type { Logger } from "pino";
import { z } from "zod";
import type {
  ProviderUsage,
  ProviderUsageDetail,
  ProviderUsageWindow,
} from "../../../server/messages.js";
import { runUsageCommand, usageCommandError, type UsageCommandRunner } from "../command.js";
import type { ProviderUsageFetcher } from "../provider.js";
import { unavailableUsage, windowFromUsedPct } from "../usage.js";

const TRAE_COMMAND_TIMEOUT_MS = 20_000;
const TRAE_COMMAND_MAX_BUFFER_BYTES = 2 * 1024 * 1024;
const QUOTA_DESCRIPTION_PATTERN =
  /\bQuota:\s*([0-9]+(?:\.[0-9]+)?)%\s*used(?:,\s*resets\s*([^,]+))?/iu;

const TraeModelSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

const TraeModelsSchema = z.array(TraeModelSchema);

interface TraeCliQuotaProviderOptions {
  logger: Logger;
  command?: string;
  runCommand?: UsageCommandRunner;
}

function quotaWindow(model: z.infer<typeof TraeModelSchema>): ProviderUsageWindow | null {
  const match = model.description?.match(QUOTA_DESCRIPTION_PATTERN);
  if (!match?.[1]) {
    return null;
  }
  const usedPct = Math.min(100, Math.max(0, Number(match[1])));
  const resetLabel = match[2]?.trim();
  return windowFromUsedPct({
    id: `quota:${model.name}`,
    label: resetLabel ? `${model.name} · ${resetLabel}` : model.name,
    utilizationPct: usedPct,
    tone: usedPct >= 80 ? "warning" : "ok",
  });
}

export class TraeCliQuotaProvider implements ProviderUsageFetcher {
  readonly providerId = "traecli";
  readonly displayName = "TRAE CLI";

  private readonly command: string;
  private readonly runCommand: UsageCommandRunner;
  private readonly logger: Logger;

  constructor(options: TraeCliQuotaProviderOptions) {
    this.command = options.command ?? process.env["TRAECLI_BIN"] ?? "traecli";
    this.runCommand = options.runCommand ?? runUsageCommand;
    this.logger = options.logger.child({ provider: this.providerId });
  }

  async fetchUsage(): Promise<ProviderUsage> {
    let stdout: string;
    try {
      ({ stdout } = await this.runCommand(this.command, ["models", "--json"], {
        timeoutMs: TRAE_COMMAND_TIMEOUT_MS,
        maxBufferBytes: TRAE_COMMAND_MAX_BUFFER_BYTES,
      }));
    } catch (error) {
      const message = usageCommandError(error);
      this.logger.debug({ err: error }, "TRAE CLI usage command failed");
      return unavailableUsage({
        providerId: this.providerId,
        displayName: this.displayName,
        error: message,
      });
    }

    let models: z.infer<typeof TraeModelsSchema>;
    try {
      models = TraeModelsSchema.parse(JSON.parse(stdout));
    } catch (error) {
      this.logger.debug({ err: error }, "TRAE CLI usage output was invalid");
      return unavailableUsage({
        providerId: this.providerId,
        displayName: this.displayName,
        error: "TRAE CLI returned invalid usage data",
      });
    }

    const windows = models.map(quotaWindow).filter((window) => window !== null);
    const details: ProviderUsageDetail[] = [
      {
        id: "models",
        label: "Models",
        value: String(models.length),
      },
      {
        id: "quota_models",
        label: "Models with quota",
        value: String(windows.length),
      },
    ];

    return {
      providerId: this.providerId,
      displayName: this.displayName,
      status: "available",
      planLabel: null,
      sourceLabel: "TRAE CLI",
      windows,
      balances: [],
      details,
      error: null,
    };
  }
}
