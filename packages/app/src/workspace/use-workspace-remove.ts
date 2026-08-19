import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useHostFeature } from "@/runtime/host-features";
import { useToast } from "@/contexts/toast-context";
import { confirmDialog } from "@/utils/confirm-dialog";

export interface UseWorkspaceRemoveOptions {
  serverId: string;
  projectId: string;
  workspaceId: string;
  workspaceName: string;
  disabled?: boolean;
  busy?: boolean;
  onRemoveStarted?: () => void;
}

export function useWorkspaceRemove(options: UseWorkspaceRemoveOptions): {
  supported: boolean;
  remove: () => void;
  action: (() => void) | undefined;
  pending: boolean;
  busy: boolean;
  status: "idle" | "pending";
} {
  const { t } = useTranslation();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const supported = useHostFeature(options.serverId, "workspaceRemove");
  const busy = Boolean(options.busy || pending);

  const remove = useCallback(() => {
    if (busy) {
      return;
    }
    void (async () => {
      const confirmed = await confirmDialog({
        title: t("sidebar.workspace.confirmations.removeTitle"),
        message: t("sidebar.workspace.confirmations.removeMessage", {
          workspaceName: options.workspaceName,
          projectId: options.projectId,
          workspaceId: options.workspaceId,
        }),
        confirmLabel: t("sidebar.workspace.confirmations.removeConfirm"),
        cancelLabel: t("sidebar.workspace.confirmations.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }

      const client = getHostRuntimeStore().getClient(options.serverId);
      if (!client) {
        toast.error(t("sidebar.workspace.toasts.hostDisconnected"));
        return;
      }

      setPending(true);
      options.onRemoveStarted?.();
      try {
        await client.removeWorkspace(options.workspaceId);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("sidebar.workspace.toasts.removeFailed"),
        );
      } finally {
        setPending(false);
      }
    })();
  }, [busy, options, t, toast]);

  return {
    supported,
    remove,
    action: options.disabled || !supported ? undefined : remove,
    pending,
    busy,
    status: pending ? "pending" : "idle",
  };
}
