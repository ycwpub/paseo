import type { Cache as LarkCache } from "@larksuiteoapi/node-sdk";

type CacheKey = Parameters<LarkCache["get"]>[0];

interface CacheEntry {
  value: unknown;
  expiredTime?: number;
}

function namespacedKey(key: CacheKey, namespace?: string): CacheKey {
  return namespace ? `${namespace}/${key.toString()}` : key;
}

class LarkClientTokenCache implements LarkCache {
  private readonly values = new Map<CacheKey, CacheEntry>();

  async get(key: CacheKey, options?: { namespace?: string }): Promise<unknown> {
    const cacheKey = namespacedKey(key, options?.namespace);
    const entry = this.values.get(cacheKey);
    if (!entry) return undefined;
    if (entry.expiredTime && entry.expiredTime <= Date.now()) {
      this.values.delete(cacheKey);
      return undefined;
    }
    return entry.value;
  }

  async set(
    key: CacheKey,
    value: unknown,
    expiredTime?: number,
    options?: { namespace?: string },
  ): Promise<boolean> {
    this.values.set(namespacedKey(key, options?.namespace), {
      value,
      ...(expiredTime === undefined ? {} : { expiredTime }),
    });
    return true;
  }

  invalidateNamespace(namespace: string): void {
    const prefix = `${namespace}/`;
    for (const key of this.values.keys()) {
      if (typeof key === "string" && key.startsWith(prefix)) {
        this.values.delete(key);
      }
    }
  }
}

export const larkClientTokenCache = new LarkClientTokenCache();

export function invalidateLarkClientTokens(appId: string): void {
  const normalizedAppId = appId.trim();
  if (normalizedAppId) larkClientTokenCache.invalidateNamespace(normalizedAppId);
}
