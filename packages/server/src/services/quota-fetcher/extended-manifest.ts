import { join } from "node:path";
import type {
  ProviderUsageFetcher,
  ProviderUsageFetcherFactoryOptions,
  ProviderUsageFetcherManifestEntry,
} from "./provider.js";
import {
  createProviderUsageFetchers as createCoreProviderUsageFetchers,
  PROVIDER_USAGE_FETCHERS as CORE_PROVIDER_USAGE_FETCHERS,
} from "./manifest.js";
import { AidenClaudeQuotaProvider, AidenCodexQuotaProvider } from "./providers/aiden.js";
import { TraeCliQuotaProvider } from "./providers/traecli.js";

export type ExtendedProviderUsageFetcherFactoryOptions = ProviderUsageFetcherFactoryOptions & {
  paseoHome?: string;
};

interface ExtendedProviderUsageFetcherManifestEntry extends Omit<
  ProviderUsageFetcherManifestEntry,
  "create"
> {
  create(options: ExtendedProviderUsageFetcherFactoryOptions): ProviderUsageFetcher;
}

const EXTENDED_PROVIDER_USAGE_FETCHERS: readonly ExtendedProviderUsageFetcherManifestEntry[] = [
  {
    providerId: "aiden-claude",
    create: (options) =>
      new AidenClaudeQuotaProvider({
        logger: options.logger,
        ...(options.paseoHome
          ? {
              cacheFilePath: join(
                options.paseoHome,
                "cache",
                "provider-usage",
                "aiden-claude.json",
              ),
            }
          : {}),
      }),
  },
  {
    providerId: "aiden-codex",
    create: (options) =>
      new AidenCodexQuotaProvider({
        logger: options.logger,
        ...(options.paseoHome
          ? {
              cacheFilePath: join(options.paseoHome, "cache", "provider-usage", "aiden-codex.json"),
            }
          : {}),
      }),
  },
  {
    providerId: "traecli",
    create: (options) => new TraeCliQuotaProvider({ logger: options.logger }),
  },
];

export const PROVIDER_USAGE_FETCHERS: readonly ExtendedProviderUsageFetcherManifestEntry[] = [
  ...EXTENDED_PROVIDER_USAGE_FETCHERS,
  ...CORE_PROVIDER_USAGE_FETCHERS,
];

export function createProviderUsageFetchers(
  options: ExtendedProviderUsageFetcherFactoryOptions,
): ProviderUsageFetcher[] {
  return [
    ...EXTENDED_PROVIDER_USAGE_FETCHERS.map((entry) => entry.create(options)),
    ...createCoreProviderUsageFetchers(options),
  ];
}
