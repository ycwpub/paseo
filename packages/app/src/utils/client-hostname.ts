import AsyncStorage from "@react-native-async-storage/async-storage";

const CLIENT_HOSTNAME_STORAGE_KEY = "@paseo:client-hostname-v1";

export interface ClientHostnameStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface ClientHostnameStore {
  initialize(): Promise<string | null>;
  getOverride(): string | null;
  setOverride(value: string): Promise<string>;
}

function normalizeClientHostname(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createClientHostnameStore(input: {
  storage: ClientHostnameStorage;
  storageKey?: string;
}): ClientHostnameStore {
  const storageKey = input.storageKey ?? CLIENT_HOSTNAME_STORAGE_KEY;
  let hostnameOverride: string | null = null;
  let initialized = false;
  let initializePromise: Promise<string | null> | null = null;

  return {
    async initialize(): Promise<string | null> {
      if (initialized) {
        return hostnameOverride;
      }
      if (initializePromise) {
        return initializePromise;
      }

      initializePromise = input.storage
        .getItem(storageKey)
        .then((stored) => {
          hostnameOverride = normalizeClientHostname(stored);
          initialized = true;
          return hostnameOverride;
        })
        .finally(() => {
          initializePromise = null;
        });
      return initializePromise;
    },

    getOverride(): string | null {
      return hostnameOverride;
    },

    async setOverride(value: string): Promise<string> {
      const normalized = normalizeClientHostname(value);
      if (!normalized) {
        throw new Error("Client hostname is required");
      }
      await input.storage.setItem(storageKey, normalized);
      hostnameOverride = normalized;
      initialized = true;
      return normalized;
    },
  };
}

const defaultStore = createClientHostnameStore({
  storage: AsyncStorage,
});

export function initializeClientHostname(): Promise<string | null> {
  return defaultStore.initialize();
}

export function getClientHostnameOverride(): string | null {
  return defaultStore.getOverride();
}

export function saveClientHostname(value: string): Promise<string> {
  return defaultStore.setOverride(value);
}
