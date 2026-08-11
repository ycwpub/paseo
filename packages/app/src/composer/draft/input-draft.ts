import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserComposerAttachment } from "@/attachments/types";
import type { DraftAgentControlsProps } from "@/composer/agent-controls";
import type { DraftCommandConfig } from "@/hooks/use-agent-commands-query";
import {
  useAgentFormState,
  type CreateAgentInitialValues,
  type UseAgentFormStateResult,
} from "@/hooks/use-agent-form-state";
import { useDraftAgentFeatures } from "@/hooks/use-draft-agent-features";
import {
  buildDraftAgentControls,
  hasDraftContent,
  resolveDraftKey,
  type DraftKeyInput,
} from "@/composer/draft/input-draft-core";
import {
  buildDraftCommandConfig,
  resolveEffectiveComposerModelId,
  resolveEffectiveComposerThinkingOptionId,
  type ProviderSelectionState,
} from "@/provider-selection/provider-selection";
import { useDraftStore } from "@/stores/draft-store";
import { toDraftInputIfReady } from "@/stores/draft-store/state";

type AttachmentUpdater =
  | UserComposerAttachment[]
  | ((prev: UserComposerAttachment[]) => UserComposerAttachment[]);

interface AgentInputDraftComposerOptions {
  initialServerId: string | null;
  initialValues?: CreateAgentInitialValues;
  initialFeatureValues?: Record<string, unknown>;
  isVisible?: boolean;
  onlineServerIds?: string[];
  lockedWorkingDir?: string;
}

interface UseAgentInputDraftInput {
  draftKey: DraftKeyInput;
  composer?: AgentInputDraftComposerOptions;
  initialAssistantId?: string | null;
  initialTeamId?: string | null;
}

type DraftComposerState = UseAgentFormStateResult & {
  workingDir: string;
  effectiveModelId: string;
  effectiveThinkingOptionId: string;
  featureValues: Record<string, unknown> | undefined;
  agentControls: DraftAgentControlsProps;
  commandDraftConfig: DraftCommandConfig | undefined;
  assistantId: string | null;
  setAssistantId: (id: string | null) => void;
  teamId: string | null;
  setTeamId: (id: string | null) => void;
};

export interface AgentInputDraft {
  text: string;
  setText: (text: string) => void;
  attachments: UserComposerAttachment[];
  setAttachments: (updater: AttachmentUpdater) => void;
  clear: (lifecycle: "sent" | "abandoned") => void;
  isHydrated: boolean;
  attachmentFocusRequestId: number;
  composerState: DraftComposerState | null;
  assistantId: string | null;
  setAssistantId: (id: string | null) => void;
  teamId: string | null;
  setTeamId: (id: string | null) => void;
}

export function useAgentInputDraft(input: UseAgentInputDraftInput): AgentInputDraft {
  const composerOptions = input.composer ?? null;
  const formState = useAgentFormState({
    initialServerId: composerOptions?.initialServerId ?? null,
    initialValues: composerOptions?.initialValues,
    isVisible: composerOptions?.isVisible ?? false,
    isCreateFlow: true,
    onlineServerIds: composerOptions?.onlineServerIds ?? [],
  });
  const draftKey = useMemo(
    () =>
      resolveDraftKey({
        draftKey: input.draftKey,
        selectedServerId: formState.selectedServerId,
      }),
    [formState.selectedServerId, input.draftKey],
  );
  const [text, setText] = useState("");
  const [attachments, setAttachmentsState] = useState<UserComposerAttachment[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const initialAssistantId = input.initialAssistantId ?? null;
  const initialTeamId = input.initialTeamId ?? null;
  const draftGenerationRef = useRef(0);
  const hydratedGenerationRef = useRef(0);

  const saveDraft = useCallback(
    (
      update: (draft: { text: string; attachments: UserComposerAttachment[] }) => {
        text: string;
        attachments: UserComposerAttachment[];
      },
    ) => {
      const store = useDraftStore.getState();
      const current = store.getDraftInput(draftKey) ?? { text: "", attachments: [] };
      const next = update(current);
      if (!hasDraftContent(next)) {
        store.clearDraftInput({ draftKey, lifecycle: "abandoned" });
        return;
      }
      store.saveDraftInput({ draftKey, draft: next });
    },
    [draftKey],
  );

  const setText = useCallback(
    (nextText: string) => {
      saveDraft((current) => ({ ...current, text: nextText }));
    },
    [saveDraft],
  );

  const setAttachments = useCallback(
    (updater: AttachmentUpdater) => {
      saveDraft((current) => ({
        ...current,
        attachments: typeof updater === "function" ? updater(current.attachments) : updater,
      }));
    },
    [saveDraft],
  );

  const clear = useCallback(
    (lifecycle: "sent" | "abandoned") => {
      useDraftStore.getState().clearDraftInput({ draftKey, lifecycle });
    },
    [draftKey],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await useDraftStore.getState().hydrateDraftInput({ draftKey });
      if (!cancelled) {
        setHydratedDraftKey(draftKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draftKey]);

  const lockedWorkingDir = composerOptions?.lockedWorkingDir?.trim() ?? "";
  useEffect(() => {
    if (!composerOptions || !lockedWorkingDir) {
      return;
    }
    if (formState.workingDir.trim() === lockedWorkingDir) {
      return;
    }
    formState.setWorkingDir(lockedWorkingDir);
  }, [composerOptions, formState, lockedWorkingDir]);

  const providerSelection = useMemo<ProviderSelectionState>(
    () => ({
      provider: formState.selectedProvider,
      modelId: formState.selectedModel,
      modeId: formState.selectedMode,
      thinkingOptionId: formState.selectedThinkingOptionId,
      availableModels: formState.availableModels,
      modeOptions: formState.modeOptions,
    }),
    [
      formState.availableModels,
      formState.modeOptions,
      formState.selectedMode,
      formState.selectedModel,
      formState.selectedProvider,
      formState.selectedThinkingOptionId,
    ],
  );

  const effectiveModelId = useMemo(
    () => resolveEffectiveComposerModelId(providerSelection),
    [providerSelection],
  );

  const effectiveThinkingOptionId = useMemo(
    () => resolveEffectiveComposerThinkingOptionId(providerSelection, effectiveModelId),
    [effectiveModelId, providerSelection],
  );

  const [assistantId, setAssistantIdState] = useState<string | null>(initialAssistantId);
  const [teamId, setTeamIdState] = useState<string | null>(initialTeamId);
  const assistantDraftKeyRef = useRef(draftKey);
  const appliedInitialAssistantIdRef = useRef<string | null>(initialAssistantId);
  const assistantOverriddenByUserRef = useRef(false);

  const setAssistantId = useCallback((id: string | null) => {
    assistantOverriddenByUserRef.current = true;
    setAssistantIdState(id);
  }, []);
  const teamDraftKeyRef = useRef(draftKey);
  const appliedInitialTeamIdRef = useRef<string | null>(initialTeamId);
  const teamOverriddenByUserRef = useRef(false);
  const setTeamId = useCallback((id: string | null) => {
    teamOverriddenByUserRef.current = true;
    setTeamIdState(id);
  }, []);

  // Sync assistantId from agent labels/draft setup. The selected assistant can
  // arrive after the agent panel first renders (directory/detail hydration), and
  // the same component instance can be reused for another draft/agent. Apply the
  // incoming value unless the user has already made an explicit selection in the
  // current draft.
  useEffect(() => {
    if (assistantDraftKeyRef.current !== draftKey) {
      assistantDraftKeyRef.current = draftKey;
      appliedInitialAssistantIdRef.current = initialAssistantId;
      assistantOverriddenByUserRef.current = false;
      setAssistantIdState(initialAssistantId);
      return;
    }

    if (appliedInitialAssistantIdRef.current === initialAssistantId) {
      return;
    }

    appliedInitialAssistantIdRef.current = initialAssistantId;
    if (!assistantOverriddenByUserRef.current) {
      setAssistantIdState(initialAssistantId);
    }
  }, [draftKey, initialAssistantId]);

  useEffect(() => {
    if (teamDraftKeyRef.current !== draftKey) {
      teamDraftKeyRef.current = draftKey;
      appliedInitialTeamIdRef.current = initialTeamId;
      teamOverriddenByUserRef.current = false;
      setTeamIdState(initialTeamId);
      return;
    }
    if (appliedInitialTeamIdRef.current === initialTeamId) {
      return;
    }
    appliedInitialTeamIdRef.current = initialTeamId;
    if (!teamOverriddenByUserRef.current) {
      setTeamIdState(initialTeamId);
    }
  }, [draftKey, initialTeamId]);

  const workingDir = lockedWorkingDir || formState.workingDir;
  const {
    features: draftFeatures,
    featureValues: draftFeatureValues,
    setFeatureValue: setDraftFeatureValue,
  } = useDraftAgentFeatures({
    serverId: formState.selectedServerId,
    provider: formState.selectedProvider,
    cwd: workingDir,
    modeId: formState.selectedMode,
    modelId: effectiveModelId,
    thinkingOptionId: effectiveThinkingOptionId,
    initialFeatureValues: composerOptions?.initialFeatureValues,
  });

  const commandDraftConfig = useMemo(
    () =>
      composerOptions
        ? buildDraftCommandConfig({
            selection: providerSelection,
            cwd: workingDir,
            effectiveModelId,
            effectiveThinkingOptionId,
            featureValues: draftFeatureValues,
          })
        : undefined,
    [
      composerOptions,
      effectiveModelId,
      effectiveThinkingOptionId,
      draftFeatureValues,
      providerSelection,
      workingDir,
    ],
  );

  const composerState = useMemo<DraftComposerState | null>(() => {
    if (!composerOptions) {
      return null;
    }

    return {
      ...formState,
      workingDir,
      effectiveModelId,
      effectiveThinkingOptionId,
      featureValues: draftFeatureValues,
      agentControls: buildDraftAgentControls({
        formState,
        features: draftFeatures,
        onSetFeature: setDraftFeatureValue,
      }),
      commandDraftConfig,
      assistantId,
      setAssistantId,
      teamId,
      setTeamId,
    };
  }, [
    commandDraftConfig,
    composerOptions,
    effectiveModelId,
    effectiveThinkingOptionId,
    draftFeatures,
    draftFeatureValues,
    formState,
    setDraftFeatureValue,
    workingDir,
    assistantId,
    setAssistantId,
    teamId,
    setTeamId,
  ]);

  return {
    text,
    setText,
    attachments,
    setAttachments,
    clear,
    isHydrated,
    attachmentFocusRequestId,
    composerState,
    assistantId,
    setAssistantId,
    teamId,
    setTeamId,
  };
}

export const __private__ = {
  resolveDraftKey,
  resolveEffectiveComposerModelId,
  resolveEffectiveComposerThinkingOptionId,
  buildDraftCommandConfig,
  buildDraftComposerCommandConfig: buildDraftCommandConfig,
  buildDraftAgentControls,
};
