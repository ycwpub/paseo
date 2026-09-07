import { useCallback, useMemo } from "react";
import type { LarkDirectoryUser } from "@getpaseo/protocol/messages";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { formatLarkUserLabel } from "./lark-directory-format";

interface LarkUserDirectoryPickerProps {
  appId: string;
  users: readonly LarkDirectoryUser[];
  onSelect: (user: LarkDirectoryUser) => void;
  selectedOpenId?: string | null;
  selectedDisplay?: SelectFieldDisplay | null;
  excludedOpenIds?: readonly string[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  field?: boolean;
  testID?: string;
}

export function LarkUserDirectoryPicker({
  appId,
  users,
  onSelect,
  selectedOpenId = null,
  selectedDisplay,
  excludedOpenIds = [],
  label = "从通讯录添加",
  placeholder = "搜索用户名、邮箱或 ou_xxx",
  disabled = false,
  field = true,
  testID,
}: LarkUserDirectoryPickerProps) {
  const availableUsers = useMemo(() => {
    const excluded = new Set(excludedOpenIds);
    const unique = new Map<string, LarkDirectoryUser>();
    for (const user of users) {
      if (user.appId !== appId) continue;
      if (excluded.has(user.openId) && user.openId !== selectedOpenId) continue;
      unique.set(user.openId, user);
    }
    return [...unique.values()];
  }, [appId, excludedOpenIds, selectedOpenId, users]);
  const userByOpenId = useMemo(
    () => new Map(availableUsers.map((user) => [user.openId, user])),
    [availableUsers],
  );
  const options = useMemo<SelectFieldOption<string>[]>(
    () =>
      availableUsers.map((user) => ({
        id: `${user.appId}:${user.openId}`,
        value: user.openId,
        label: formatLarkUserLabel(user),
        description: "通讯录联系人",
      })),
    [availableUsers],
  );
  const directorySelectedDisplay = useMemo<SelectFieldDisplay | null>(() => {
    const selected = selectedOpenId ? userByOpenId.get(selectedOpenId) : null;
    return selected ? { label: formatLarkUserLabel(selected), description: "通讯录联系人" } : null;
  }, [selectedOpenId, userByOpenId]);
  const handleChange = useCallback(
    (openId: string) => {
      const user = userByOpenId.get(openId);
      if (user) onSelect(user);
    },
    [onSelect, userByOpenId],
  );

  return (
    <SelectField
      label={label}
      value={selectedOpenId}
      selectedDisplay={selectedDisplay === undefined ? directorySelectedDisplay : selectedDisplay}
      options={options}
      onChange={handleChange}
      placeholder={placeholder}
      searchPlaceholder="搜索用户名、邮箱或 ou_xxx"
      emptyText={appId ? "当前机器人通讯录暂无匹配联系人" : "请先选择飞书机器人"}
      searchable
      disabled={disabled || !appId}
      field={field}
      testID={testID}
    />
  );
}
