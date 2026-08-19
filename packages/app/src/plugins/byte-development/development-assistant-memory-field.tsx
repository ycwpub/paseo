import { useCallback, useMemo } from "react";
import { SelectField } from "@/components/ui/select-field";
import { useAssistants } from "@/hooks/use-assistants";
import {
  buildDevelopmentAssistantOptions,
  resolveDevelopmentAssistantDisplay,
} from "./development-assistant-memory-model";

export function DevelopmentAssistantMemoryField({
  serverId,
  value,
  enabled,
  onChange,
}: {
  serverId: string;
  value: unknown;
  enabled: boolean;
  onChange: (value: unknown) => void;
}) {
  const assistants = useAssistants(serverId, { enabled });
  const assistantId = typeof value === "string" && value.trim() ? value : null;
  const options = useMemo(
    () => buildDevelopmentAssistantOptions(assistants.assistants),
    [assistants.assistants],
  );
  const selectedDisplay = useMemo(
    () => resolveDevelopmentAssistantDisplay(options, assistantId),
    [assistantId, options],
  );
  const handleChange = useCallback(
    (nextAssistantId: string) => onChange(nextAssistantId),
    [onChange],
  );
  const error = enabled ? (assistants.error?.message ?? null) : null;

  return (
    <SelectField
      label="助手"
      value={assistantId}
      selectedDisplay={selectedDisplay}
      options={options}
      onChange={handleChange}
      placeholder={enabled ? "选择助手" : "请先开启“写入助手记忆”"}
      emptyText="当前 Host 没有可用助手"
      loading={enabled && assistants.isLoading}
      disabled={!enabled || !assistants.isConnected}
      searchable
      searchPlaceholder="搜索助手名称或描述"
      hint="开启写入助手记忆后必选；界面展示助手名称，提交时自动使用 Assistant ID。"
      error={error}
      testID="development-assistant-memory-field"
      triggerTestID="development-assistant-memory-trigger"
    />
  );
}
