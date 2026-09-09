import type pino from "pino";
import {
  BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY,
  BambooTroubleshooterConfigSchema,
  type PluginAppState,
} from "@getpaseo/protocol/messages";
import type {
  LarkChannelEventSubscription,
  LarkChannelClientAdapter,
} from "../channels/lark/lark-client-adapter.js";
import type { NormalizedLarkMessageEvent } from "../channels/lark/lark-message-format.js";
import type { BambooBotCredentialResolver } from "./bamboo-bot-credential-resolver.js";

const RECONCILE_INTERVAL_MS = 30_000;

interface DedicatedSubscription {
  fingerprint: string;
  subscription: LarkChannelEventSubscription;
}

interface BambooDedicatedBotListenerOptions {
  listProjects: () => PluginAppState[];
  credentialResolver: Pick<BambooBotCredentialResolver, "resolve">;
  startEvents: LarkChannelClientAdapter["startEvents"];
  onMessage: (botAppId: string, event: NormalizedLarkMessageEvent) => Promise<void>;
  logger: pino.Logger;
}

function customConfigs(projects: readonly PluginAppState[]) {
  return projects.flatMap((project) => {
    const parsed = BambooTroubleshooterConfigSchema.safeParse(
      project.data[BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY],
    );
    if (
      !parsed.success ||
      !parsed.data.enabled ||
      !parsed.data.listenEnabled ||
      parsed.data.bot.kind !== "custom"
    ) {
      return [];
    }
    return [parsed.data];
  });
}

/**
 * Owns WebSocket subscriptions for Bamboo-only custom bots. These credentials
 * never enter LarkChannelStore, so they cannot become chat, substitute, or
 * reminder channels.
 */
export class BambooDedicatedBotListener {
  private readonly logger: pino.Logger;
  private readonly subscriptions = new Map<string, DedicatedSubscription>();
  private timer: NodeJS.Timeout | null = null;
  private reconcileInFlight: Promise<void> | null = null;

  constructor(private readonly options: BambooDedicatedBotListenerOptions) {
    this.logger = options.logger.child({ module: "bamboo-dedicated-bot-listener" });
  }

  start(): void {
    if (this.timer) return;
    this.requestReconcile();
    this.timer = setInterval(() => this.requestReconcile(), RECONCILE_INTERVAL_MS);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.reconcileInFlight) await this.reconcileInFlight;
    for (const entry of this.subscriptions.values()) entry.subscription.close();
    this.subscriptions.clear();
  }

  private requestReconcile(): void {
    if (this.reconcileInFlight) return;
    const reconcile = this.reconcile()
      .catch((error) => {
        this.logger.warn({ err: error }, "Failed to reconcile Bamboo custom bot listeners");
      })
      .finally(() => {
        if (this.reconcileInFlight === reconcile) this.reconcileInFlight = null;
      });
    this.reconcileInFlight = reconcile;
  }

  private async reconcile(): Promise<void> {
    const desired = new Map<
      string,
      { fingerprint: string; config: ReturnType<BambooBotCredentialResolver["resolve"]>["config"] }
    >();
    for (const config of customConfigs(this.options.listProjects())) {
      const resolved = this.options.credentialResolver.resolve(config);
      const appId = resolved.config.appId;
      const appSecret = resolved.config.appSecret;
      if (!appId || !appSecret) continue;
      desired.set(appId, {
        fingerprint: `${appId}\u0000${appSecret}`,
        config: resolved.config,
      });
    }

    for (const [appId, current] of this.subscriptions) {
      const next = desired.get(appId);
      if (next?.fingerprint === current.fingerprint) continue;
      current.subscription.close();
      this.subscriptions.delete(appId);
    }

    for (const [appId, target] of desired) {
      if (this.subscriptions.has(appId)) continue;
      try {
        const subscription = await this.options.startEvents(target.config, (event) =>
          this.options.onMessage(appId, event),
        );
        this.subscriptions.set(appId, {
          fingerprint: target.fingerprint,
          subscription,
        });
      } catch (error) {
        this.logger.warn(
          { err: error, appId },
          "Failed to start Bamboo custom bot event subscription",
        );
      }
    }
  }
}
