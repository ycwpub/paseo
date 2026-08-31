import type { Logger } from "pino";
import { createProviderUsageFetchers } from "./extended-manifest.js";
import { ProviderUsageService } from "./service.js";

export function createCachedProviderUsageService(input: {
  logger: Logger;
  paseoHome: string;
}): ProviderUsageService {
  const fetcherLogger = input.logger.child({ module: "provider-usage-service" });
  return new ProviderUsageService({
    logger: input.logger,
    fetchers: createProviderUsageFetchers({
      logger: fetcherLogger,
      paseoHome: input.paseoHome,
    }),
  });
}
