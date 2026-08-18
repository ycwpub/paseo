import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LarkReminder, LarkReminderCreateInput } from "@getpaseo/protocol/messages";
import { useReplicaQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";

function queryKey(serverId: string) {
  return ["lark-reminders", serverId] as const;
}

export interface UseLarkRemindersResult {
  reminders: LarkReminder[];
  isLoading: boolean;
  isMutating: boolean;
  error: Error | null;
  create: (input: LarkReminderCreateInput) => Promise<LarkReminder>;
  setEnabled: (reminderId: string, enabled: boolean) => Promise<LarkReminder>;
  deleteReminder: (reminderId: string) => Promise<void>;
}

export function useLarkReminders(serverId: string, enabled: boolean): UseLarkRemindersResult {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const queryClient = useQueryClient();
  const key = useMemo(() => queryKey(serverId), [serverId]);
  const query = useReplicaQuery({
    queryKey: key,
    pushEvent: "channel.lark.reminder.changed",
    enabled: enabled && connected && Boolean(client),
    queryFn: async () => {
      if (!client) throw new Error("Host is disconnected");
      const result = await client.listLarkReminders();
      if (result.error) throw new Error(result.error);
      return result.reminders;
    },
  });
  useEffect(() => {
    if (!client || !enabled) return;
    return client.on("channel.lark.reminder.changed", (message) => {
      queryClient.setQueryData(key, message.payload.reminders);
    });
  }, [client, enabled, key, queryClient]);
  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<LarkReminder[]>) => operation(),
    onSuccess: (reminders) => {
      queryClient.setQueryData(key, reminders);
    },
  });

  const create = useCallback(
    (input: LarkReminderCreateInput) => {
      if (!client) return Promise.reject(new Error("Host is disconnected"));
      return mutation
        .mutateAsync(async () => {
          const result = await client.createLarkReminder(input);
          if (result.error || !result.reminder) {
            throw new Error(result.error ?? "Lark reminder was not created");
          }
          return result.reminders;
        })
        .then((reminders) => {
          const created = reminders.find(
            (entry) =>
              entry.botId === input.botId &&
              entry.chatId === input.chatId &&
              entry.message === input.message,
          );
          if (!created) throw new Error("Created Lark reminder was not returned");
          return created;
        });
    },
    [client, mutation],
  );

  const setEnabled = useCallback(
    (reminderId: string, nextEnabled: boolean) => {
      if (!client) return Promise.reject(new Error("Host is disconnected"));
      return mutation
        .mutateAsync(async () => {
          const result = await client.setLarkReminderEnabled({
            reminderId,
            enabled: nextEnabled,
          });
          if (result.error || !result.reminder) {
            throw new Error(result.error ?? "Lark reminder was not updated");
          }
          return result.reminders;
        })
        .then((reminders) => {
          const updated = reminders.find((entry) => entry.id === reminderId);
          if (!updated) throw new Error("Updated Lark reminder was not returned");
          return updated;
        });
    },
    [client, mutation],
  );

  const deleteReminder = useCallback(
    async (reminderId: string) => {
      if (!client) throw new Error("Host is disconnected");
      await mutation.mutateAsync(async () => {
        const result = await client.deleteLarkReminder({ reminderId });
        if (result.error || !result.ok) {
          throw new Error(result.error ?? "Lark reminder was not deleted");
        }
        return result.reminders;
      });
    },
    [client, mutation],
  );

  return {
    reminders: query.data ?? [],
    isLoading: query.isLoading,
    isMutating: mutation.isPending,
    error: query.error ?? mutation.error,
    create,
    setEnabled,
    deleteReminder,
  };
}
