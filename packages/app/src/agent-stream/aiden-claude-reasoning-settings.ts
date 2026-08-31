import { useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { useFetchQuery } from "@/data/query";

const STORAGE_KEY = "paseo:aiden-claude-reasoning-settings:v1";
const QUERY_KEY = ["aiden-claude-reasoning-settings"] as const;

export interface AidenClaudeReasoningSettings {
  translateToChinese: boolean;
}

const DEFAULT_SETTINGS: AidenClaudeReasoningSettings = {
  translateToChinese: false,
};

export function parseAidenClaudeReasoningSettings(
  raw: string | null,
): AidenClaudeReasoningSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return {
      translateToChinese:
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        "translateToChinese" in parsed &&
        typeof parsed.translateToChinese === "boolean"
          ? parsed.translateToChinese
          : false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useAidenClaudeReasoningSettings() {
  const queryClient = useQueryClient();
  const { data = DEFAULT_SETTINGS } = useFetchQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => parseAidenClaudeReasoningSettings(await AsyncStorage.getItem(STORAGE_KEY)),
    dataShape: "value",
    staleTimeMs: Number.MAX_SAFE_INTEGER,
  });
  const setTranslateToChinese = useCallback(
    async (translateToChinese: boolean) => {
      const next = { translateToChinese };
      queryClient.setQueryData(QUERY_KEY, next);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    },
    [queryClient],
  );
  return {
    translateToChinese: data.translateToChinese,
    setTranslateToChinese,
  };
}
