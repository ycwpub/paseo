import type { AppSettings, KeyValueStorage } from "./storage";

export const PRODUCT_DEFAULT_LANGUAGE = "zh-CN" as const;

const SUPPORTED_LANGUAGES = new Set([
  "system",
  "ar",
  "en",
  "es",
  "fr",
  "ja",
  "ko",
  "pt-BR",
  "ru",
  "zh-CN",
]);

export function applyProductAppSettingsDefaults(settings: AppSettings): AppSettings {
  return {
    ...settings,
    language: PRODUCT_DEFAULT_LANGUAGE,
  };
}

export function createProductAppSettingsStorage(
  storage: KeyValueStorage,
  appSettingsKey: string,
): KeyValueStorage {
  return {
    async getItem(key) {
      const raw = await storage.getItem(key);
      if (key !== appSettingsKey) return raw;
      return applyDefaultLanguageToStoredJson(raw);
    },
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
  };
}

function applyDefaultLanguageToStoredJson(raw: string | null): string {
  if (raw === null) {
    return JSON.stringify({ language: PRODUCT_DEFAULT_LANGUAGE });
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return raw;
    const record = parsed as Record<string, unknown>;
    if (typeof record.language === "string" && SUPPORTED_LANGUAGES.has(record.language)) {
      return raw;
    }
    return JSON.stringify({ ...record, language: PRODUCT_DEFAULT_LANGUAGE });
  } catch {
    return raw;
  }
}
