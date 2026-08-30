import { useCallback } from "react";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { AssistantMessage, ToolCall, type InlinePathTarget } from "@/components/message";
import type { ToastApi } from "@/components/toast-host";
import { useHostFeature } from "@/runtime/host-features";
import { useSettings } from "@/hooks/use-settings";
import { useRevealedText } from "@/hooks/use-revealed-text";
import type { StreamItem } from "@/types/stream";
import { AssistantFileLinkResolverProvider } from "@/assistant-file-links";
import { createAssistantImageOccurrenceKey } from "@/assistant-image/acquisition-cache";
import type { OpenFileDisposition } from "@/workspace/file-open";
import type { StreamLayoutItem } from "./layout";
import {
  AidenClaudeReasoningTranslation,
  shouldTranslateAidenClaudeReasoning,
} from "./aiden-claude-reasoning-translation";
import { resolveReasoningPresentation } from "./reasoning-presentation";

export interface ReasoningItemProps {
  agentId: string;
  client: DaemonClient | null;
  item: Extract<StreamItem, { kind: "thought" }>;
  layoutItem: StreamLayoutItem;
  onInlineDetailsExpandedChangeByItemId: (itemId: string, expanded: boolean) => void;
  onInlinePathPress: (target: InlinePathTarget, disposition: OpenFileDisposition) => void;
  provider: string | undefined;
  serverId: string;
  toast?: ToastApi | null;
  workspaceRoot: string;
}

export function ReasoningItem({
  agentId,
  client,
  item,
  layoutItem,
  onInlineDetailsExpandedChangeByItemId,
  onInlinePathPress,
  provider,
  serverId,
  toast,
  workspaceRoot,
}: ReasoningItemProps) {
  const autoExpandReasoning = useSettings((settings) => settings.autoExpandReasoning);
  const translateAidenClaudeReasoning = useSettings(
    (settings) => settings.aidenClaudeTranslateReasoningToChinese,
  );
  const supportsReasoningTranslation = useHostFeature(serverId, "reasoningTranslation");
  const revealedText = useRevealedText(
    item.text,
    item.status === "ready" ? "complete" : "streaming",
  );
  const presentation = resolveReasoningPresentation({
    provider,
    source: item.source,
    autoExpandReasoning,
  });
  const handleExpandedChange = useCallback(
    (expanded: boolean) => onInlineDetailsExpandedChangeByItemId(item.id, expanded),
    [item.id, onInlineDetailsExpandedChangeByItemId],
  );

  return (
    <AidenClaudeReasoningTranslation
      enabled={shouldTranslateAidenClaudeReasoning({
        enabled: translateAidenClaudeReasoning,
        provider,
        sourceText: item.text,
        source: item.source,
      })}
      supported={supportsReasoningTranslation}
      client={client}
      serverId={serverId}
      agentId={agentId}
      sourceText={item.text}
      completed={item.status === "ready"}
    >
      {(translatedText) => {
        const displayText = translatedText === item.text ? revealedText : translatedText;
        if (presentation.kind === "message") {
          return (
            <AssistantFileLinkResolverProvider
              client={client}
              serverId={serverId}
              workspaceRoot={workspaceRoot}
              onOpenWorkspaceFile={onInlinePathPress}
              toast={toast}
            >
              <AssistantMessage
                occurrenceKey={createAssistantImageOccurrenceKey({
                  agentId,
                  itemId: item.id,
                })}
                message={displayText}
                timestamp={item.timestamp.getTime()}
                workspaceRoot={workspaceRoot}
                serverId={serverId}
                client={client}
                spacing={layoutItem.assistantSpacing}
                phase={layoutItem.phase}
                variant="reasoning"
              />
            </AssistantFileLinkResolverProvider>
          );
        }
        return (
          <ToolCall
            toolName="thinking"
            args={displayText}
            status={item.status === "ready" ? "completed" : "executing"}
            isLastInSequence={layoutItem.isLastInToolSequence}
            defaultExpanded={presentation.defaultExpanded}
            forceInline={presentation.defaultExpanded}
            onInlineDetailsExpandedChange={handleExpandedChange}
          />
        );
      }}
    </AidenClaudeReasoningTranslation>
  );
}
