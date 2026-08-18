import type {
  LarkChannelBotStatus,
  LarkDirectory,
  LarkDirectoryChat,
  LarkDirectoryUser,
} from "@getpaseo/protocol/messages";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { LarkChatDirectoryField, LarkUserDirectoryField } from "./lark-directory-fields";

const EMPTY_USERS: LarkDirectoryUser[] = [];
const EMPTY_CHATS: LarkDirectoryChat[] = [];

export function LarkReminderAudienceFields({
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
  if (!directorySupported) {
    return (
      <>
        <Field label="群 ID" hint="更新 Paseo daemon 后可通过群名称查询 chatId。">
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
        hint="通过群名称、群 ID 或 chatId 查询；机器人或授权用户必须已加入该群。"
        appId={selectedBot?.appId ?? ""}
        chatId={chatId}
        chats={directory?.chats ?? EMPTY_CHATS}
        onChange={onChatIdChange}
        resolveChats={resolveDirectoryChats}
        disabled={!selectedBot}
      />
      <LarkUserDirectoryField
        label="被提醒人"
        hint="支持输入多个邮箱；任一人回复即停止。保存和运行时仍只使用 Open ID。"
        appId={selectedBot?.appId ?? ""}
        openIds={targetOpenIds}
        users={directory?.users ?? EMPTY_USERS}
        onChange={onTargetOpenIdsChange}
        resolveUsers={resolveDirectoryUsers}
        disabled={!selectedBot}
        multiple
      />
    </>
  );
}
