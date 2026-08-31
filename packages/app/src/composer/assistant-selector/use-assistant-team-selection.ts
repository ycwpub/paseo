import { useCallback, useEffect, useRef, useState } from "react";

export interface AssistantTeamSelection {
  assistantId: string | null;
  setAssistantId: (assistantId: string | null) => void;
  teamId: string | null;
  setTeamId: (teamId: string | null) => void;
}

export function useAssistantTeamSelection(input: {
  selectionKey: string;
  initialAssistantId?: string | null;
  initialTeamId?: string | null;
}): AssistantTeamSelection {
  const initialAssistantId = input.initialAssistantId ?? null;
  const initialTeamId = input.initialTeamId ?? null;
  const [assistantId, setAssistantIdState] = useState<string | null>(initialAssistantId);
  const [teamId, setTeamIdState] = useState<string | null>(initialTeamId);
  const assistantSelectionKeyRef = useRef(input.selectionKey);
  const teamSelectionKeyRef = useRef(input.selectionKey);
  const appliedInitialAssistantIdRef = useRef<string | null>(initialAssistantId);
  const appliedInitialTeamIdRef = useRef<string | null>(initialTeamId);
  const assistantOverriddenByUserRef = useRef(false);
  const teamOverriddenByUserRef = useRef(false);

  const setAssistantId = useCallback((nextAssistantId: string | null) => {
    assistantOverriddenByUserRef.current = true;
    setAssistantIdState(nextAssistantId);
  }, []);
  const setTeamId = useCallback((nextTeamId: string | null) => {
    teamOverriddenByUserRef.current = true;
    setTeamIdState(nextTeamId);
  }, []);

  useEffect(() => {
    if (assistantSelectionKeyRef.current !== input.selectionKey) {
      assistantSelectionKeyRef.current = input.selectionKey;
      appliedInitialAssistantIdRef.current = initialAssistantId;
      assistantOverriddenByUserRef.current = false;
      setAssistantIdState(initialAssistantId);
      return;
    }
    if (appliedInitialAssistantIdRef.current === initialAssistantId) return;
    appliedInitialAssistantIdRef.current = initialAssistantId;
    if (!assistantOverriddenByUserRef.current) setAssistantIdState(initialAssistantId);
  }, [initialAssistantId, input.selectionKey]);

  useEffect(() => {
    if (teamSelectionKeyRef.current !== input.selectionKey) {
      teamSelectionKeyRef.current = input.selectionKey;
      appliedInitialTeamIdRef.current = initialTeamId;
      teamOverriddenByUserRef.current = false;
      setTeamIdState(initialTeamId);
      return;
    }
    if (appliedInitialTeamIdRef.current === initialTeamId) return;
    appliedInitialTeamIdRef.current = initialTeamId;
    if (!teamOverriddenByUserRef.current) setTeamIdState(initialTeamId);
  }, [initialTeamId, input.selectionKey]);

  return {
    assistantId,
    setAssistantId,
    teamId,
    setTeamId,
  };
}
