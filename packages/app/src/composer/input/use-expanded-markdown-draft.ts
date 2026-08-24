import { useCallback, useRef, useState, type SetStateAction } from "react";

interface UseExpandedMarkdownDraftOptions {
  value: string;
  onCommit: (value: string) => void;
}

export function useExpandedMarkdownDraft({ value, onCommit }: UseExpandedMarkdownDraftOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const draftRef = useRef(value);
  const [editorSeed, setEditorSeed] = useState(() => ({
    value,
    resetKey: 0,
  }));

  const open = useCallback(() => {
    draftRef.current = value;
    setEditorSeed((current) => ({
      value,
      resetKey: current.resetKey + 1,
    }));
    setIsOpen(true);
  }, [value]);

  const dismiss = useCallback(() => {
    setIsOpen(false);
  }, []);

  const updateDraft = useCallback((nextValue: string) => {
    draftRef.current = nextValue;
  }, []);

  const replaceDraft = useCallback((nextValue: SetStateAction<string>) => {
    const resolvedValue = typeof nextValue === "function" ? nextValue(draftRef.current) : nextValue;
    draftRef.current = resolvedValue;
    setEditorSeed((current) => ({
      value: resolvedValue,
      resetKey: current.resetKey + 1,
    }));
  }, []);

  const commit = useCallback(
    (currentNativeValue?: string) => {
      if (currentNativeValue !== undefined) {
        draftRef.current = currentNativeValue;
      }
      const draft = draftRef.current;
      onCommit(draft);
      return draft;
    },
    [onCommit],
  );

  const commitAndClose = useCallback(
    (currentNativeValue?: string) => {
      const committedValue = commit(currentNativeValue);
      setIsOpen(false);
      return committedValue;
    },
    [commit],
  );

  return {
    isOpen,
    initialValue: editorSeed.value,
    resetKey: editorSeed.resetKey,
    updateDraft,
    replaceDraft,
    open,
    dismiss,
    commit,
    commitAndClose,
  };
}
