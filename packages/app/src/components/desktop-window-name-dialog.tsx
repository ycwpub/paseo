import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { getDesktopHost } from "@/desktop/host";
import { listenToDesktopEvent } from "@/desktop/electron/events";

const MAX_WINDOW_NAME_LENGTH = 80;

export function DesktopWindowNameDialog() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [initialValue, setInitialValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    const openDialog = async () => {
      const getName = getDesktopHost()?.window?.getCurrentWindow?.()?.getName;
      if (typeof getName !== "function") {
        return;
      }

      try {
        const name = await getName();
        if (cancelled) {
          return;
        }
        setInitialValue(name);
        setVisible(true);
      } catch {
        // The window may have closed while the menu event was being handled.
      }
    };

    const setupListener = async () => {
      try {
        const dispose = await listenToDesktopEvent("rename-window", () => {
          void openDialog();
        });
        if (cancelled) {
          dispose();
          return;
        }
        unlisten = dispose;
      } catch {
        // Browser and native builds do not expose the Electron event bridge.
      }
    };

    void setupListener();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);

  const handleSubmit = useCallback(async (name: string) => {
    const setName = getDesktopHost()?.window?.getCurrentWindow?.()?.setName;
    if (typeof setName !== "function") {
      throw new Error("Desktop window API is unavailable.");
    }
    await setName(name);
  }, []);

  return (
    <AdaptiveRenameModal
      visible={visible}
      title={t("desktop.windowName.renameTitle")}
      initialValue={initialValue}
      placeholder={t("desktop.windowName.placeholder")}
      onClose={handleClose}
      onSubmit={handleSubmit}
      maxLength={MAX_WINDOW_NAME_LENGTH}
      testID="desktop-window-name-dialog"
    />
  );
}
