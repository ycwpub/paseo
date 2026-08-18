import { useEffect, useState, type ReactNode } from "react";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useTranslation } from "react-i18next";

const STREAMING_TRANSLATION_DEBOUNCE_MS = 700;
const MAX_TRANSLATION_CACHE_ENTRIES = 256;
const translationCache = new Map<string, string>();
const translationInflight = new Map<string, Promise<string>>();

export interface ReasoningTranslationDisplayInput {
  enabled: boolean;
  supported: boolean;
  connected: boolean;
  sourceText: string;
  sourceIsSettled: boolean;
  isPending: boolean;
  isError: boolean;
  translatedText?: string;
  translatingText: string;
  failedText: string;
  unavailableText: string;
}

export function resolveReasoningTranslationDisplayText(
  input: ReasoningTranslationDisplayInput,
): string {
  if (!input.enabled) {
    return input.sourceText;
  }
  if (!input.sourceText.trim()) {
    return "";
  }
  if (!input.supported) {
    return input.unavailableText;
  }
  if (!input.connected || !input.sourceIsSettled || input.isPending) {
    return input.translatingText;
  }
  if (input.isError || !input.translatedText?.trim()) {
    return input.failedText;
  }
  return input.translatedText;
}

export interface AidenClaudeReasoningTranslationProps {
  enabled: boolean;
  supported: boolean;
  client: DaemonClient | null;
  serverId: string;
  agentId: string;
  sourceText: string;
  completed: boolean;
  children: (displayText: string) => ReactNode;
}

export function AidenClaudeReasoningTranslation({
  enabled,
  supported,
  client,
  serverId,
  agentId,
  sourceText,
  completed,
  children,
}: AidenClaudeReasoningTranslationProps) {
  const { t } = useTranslation();
  const [settledText, setSettledText] = useState(completed ? sourceText : "");
  const [translation, setTranslation] = useState<{
    key: string;
    translatedText?: string;
    error: boolean;
    pending: boolean;
  }>({ key: "", error: false, pending: false });

  useEffect(() => {
    if (!enabled || !sourceText.trim()) {
      setSettledText("");
      return;
    }
    if (completed) {
      setSettledText(sourceText);
      return;
    }
    const timer = setTimeout(() => {
      setSettledText(sourceText);
    }, STREAMING_TRANSLATION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [completed, enabled, sourceText]);

  const sourceIsSettled = settledText === sourceText && sourceText.trim().length > 0;
  const translationKey = createTranslationKey(serverId, agentId, settledText);
  const canTranslate = enabled && supported && client !== null && sourceIsSettled;

  useEffect(() => {
    if (!canTranslate || !client) {
      return;
    }
    const cached = translationCache.get(translationKey);
    if (cached !== undefined) {
      setTranslation({
        key: translationKey,
        translatedText: cached,
        error: false,
        pending: false,
      });
      return;
    }

    let cancelled = false;
    setTranslation({ key: translationKey, error: false, pending: true });
    void requestTranslation(client, agentId, settledText, translationKey)
      .then((translatedText) => {
        if (!cancelled) {
          setTranslation({
            key: translationKey,
            translatedText,
            error: false,
            pending: false,
          });
        }
        return undefined;
      })
      .catch(() => {
        if (!cancelled) {
          setTranslation({ key: translationKey, error: true, pending: false });
        }
        return undefined;
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, canTranslate, client, settledText, translationKey]);

  const translationMatchesSource = translation.key === translationKey;

  return children(
    resolveReasoningTranslationDisplayText({
      enabled,
      supported,
      connected: client !== null,
      sourceText,
      sourceIsSettled,
      isPending: canTranslate && (!translationMatchesSource || translation.pending),
      isError: translationMatchesSource && translation.error,
      translatedText: translationMatchesSource ? translation.translatedText : undefined,
      translatingText: t("agentStream.reasoningTranslation.translating"),
      failedText: t("agentStream.reasoningTranslation.failed"),
      unavailableText: t("agentStream.reasoningTranslation.unavailable"),
    }),
  );
}

export function shouldTranslateAidenClaudeReasoning(input: {
  enabled: boolean;
  provider: string | undefined;
}): boolean {
  return input.enabled && input.provider === "aiden-claude";
}

function createTranslationKey(serverId: string, agentId: string, sourceText: string): string {
  return `${serverId}\0${agentId}\0${sourceText}`;
}

async function requestTranslation(
  client: DaemonClient,
  agentId: string,
  sourceText: string,
  cacheKey: string,
): Promise<string> {
  const existing = translationInflight.get(cacheKey);
  if (existing) {
    return existing;
  }
  const request = client
    .translateReasoning({ agentId, text: sourceText })
    .then((response) => {
      if (response.error || !response.translatedText?.trim()) {
        throw new Error(response.error ?? "Reasoning translation returned no text");
      }
      rememberTranslation(cacheKey, response.translatedText);
      return response.translatedText;
    })
    .finally(() => {
      if (translationInflight.get(cacheKey) === request) {
        translationInflight.delete(cacheKey);
      }
    });
  translationInflight.set(cacheKey, request);
  return request;
}

function rememberTranslation(key: string, translatedText: string): void {
  translationCache.delete(key);
  translationCache.set(key, translatedText);
  while (translationCache.size > MAX_TRANSLATION_CACHE_ENTRIES) {
    const oldestKey = translationCache.keys().next().value;
    if (typeof oldestKey !== "string") {
      return;
    }
    translationCache.delete(oldestKey);
  }
}
