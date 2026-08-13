import { useEffect, useRef } from "react";
import { isWeb } from "@/constants/platform";

export function useWorkflowEditorGuard({
  dirty,
  saveEnabled,
  onSave,
}: {
  dirty: boolean;
  saveEnabled: boolean;
  onSave: () => void;
}): void {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (saveEnabled && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSaveRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveEnabled]);

  useEffect(() => {
    if (!isWeb || !dirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);
}
