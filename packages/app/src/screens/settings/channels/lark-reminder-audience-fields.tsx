import { useCallback } from "react";
import type {
  LarkChannelBotStatus,
  LarkDirectory,
  LarkDirectoryChat,
  LarkDirectoryUser,
} from "@getpaseo/protocol/messages";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { LarkChatDirectoryField, LarkUserDirectoryField } from "./lark-directory-fields";
import { LarkUserOAuthErrorAction } from "./lark-user-oauth-error-action";

const EMPTY_USERS: LarkDirectoryUser[] = [];
const EMPTY_CHATS: LarkDirectoryChat[] = [];

export function LarkReminderAudienceFields({
  serverId,
  directorySupported,
  selectedBot,
  directory,
  chatId,
  targetOpenIds,
  rawTargetOpenIds,
  onChatIdChange,
  onTargetOpenIdsChange,
  onRawTargetOpenIdsChange,
  resolveDirectoryUsers,
  resolveDirectoryChats,
}: {
  serverId: string;
  directorySupported: boolean;
  selectedBot: LarkChannelBotStatus | null;
  directory: LarkDirectory | null;
  chatId: string;
  targetOpenIds: string[];
  rawTargetOpenIds: string;
  onChatIdChange: (value: string) => void;
  onTargetOpenIdsChange: (value: string[]) => void;
  onRawTargetOpenIdsChange: (value: string) => void;
  resolveDirectoryUsers: (appId: string, emails: string[]) => Promise<LarkDirectoryUser[]>;
  resolveDirectoryChats: (appId: string, query: string) => Promise<LarkDirectoryChat[]>;
}) {
  const selectedAppId = selectedBot?.appId ?? "";
  const renderOAuthErrorAction = useCallback(
    (message: string, clearError: () => void) =>
      selectedAppId ? (
        <LarkUserOAuthErrorAction
          serverId={serverId}
          appId={selectedAppId}
          errorMessage={message}
          onAuthorized={clearError}
        />
      ) : null,
    [selectedAppId, serverId],
  );

  if (!directorySupported) {
    return (
      <>
        <Field label="群标识" hint="填写 oc_xxx；更新 Paseo daemon 后可通过群名称查询。">
          <FormTextInput value={chatId} onChangeText={onChatIdChange} placeholder="oc_xxxxxxxxxx" />
        </Field>
        <Field label="被提醒人 Open ID" hint="更新 Paseo daemon 后可通过用户邮箱查询 Open ID。">
          <FormTextInput
            value={rawTargetOpenIds}
            onChangeText={onRawTargetOpenIdsChange}
            placeholder="ou_xxx, ou_yyy"
            multiline
          />
        </Field>
      </>
    );
  }
  return (
    <>
      <LarkChatDirectoryField
        label="提醒群聊"
        hint="通过群名称或 oc_xxx 查询；机器人或授权用户必须已加入该群。"
        appId={selectedBot?.appId ?? ""}
        chatId={chatId}
        chats={directory?.chats ?? EMPTY_CHATS}
        onChange={onChatIdChange}
        resolveChats={resolveDirectoryChats}
        renderErrorAction={renderOAuthErrorAction}
        disabled={!selectedBot}
      />
      <LarkUserDirectoryField
        label="用户白名单（被提醒人）"
        hint="可从通讯录按用户名、邮箱或 ou_xxx 搜索添加；也可输入多个邮箱查询。任一人回复即停止。"
        appId={selectedBot?.appId ?? ""}
        openIds={targetOpenIds}
        users={directory?.users ?? EMPTY_USERS}
        onChange={onTargetOpenIdsChange}
        resolveUsers={resolveDirectoryUsers}
        renderErrorAction={renderOAuthErrorAction}
        disabled={!selectedBot}
        multiple
      />
    </>
  );
}
