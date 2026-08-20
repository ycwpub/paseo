import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import { CombinedModelSelector } from "@/components/combined-model-selector";
import { Field } from "@/components/ui/form-field";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { buildSelectableProviderSelectorProviders } from "@/provider-selection/provider-selection";

export interface PluginProjectDefaultAgentValue {
  provider: string;
  model: string;
}

export function PluginProjectDefaultAgentField({
  active,
  serverId,
  cwd,
  value,
  disabled,
  onChange,
}: {
  active: boolean;
  serverId: string;
  cwd: string | null;
  value: PluginProjectDefaultAgentValue;
  disabled?: boolean;
  onChange: (value: PluginProjectDefaultAgentValue) => void;
}) {
  const snapshot = useProvidersSnapshot(serverId, { enabled: active, cwd });
  const providers = useMemo(
    () => buildSelectableProviderSelectorProviders(snapshot.entries),
    [snapshot.entries],
  );
  const handleSelect = useCallback(
    (provider: AgentProvider, model: string) => onChange({ provider, model }),
    [onChange],
  );
  const handleOpen = useCallback(() => {
    snapshot.refetchIfStale(value.provider || null);
  }, [snapshot, value.provider]);
  const handleRetry = useCallback(
    (provider: AgentProvider) => snapshot.refresh([provider]),
    [snapshot],
  );

  return (
    <Field
      label="默认 Provider 和模型（必填）"
      hint="保存后作为该插件项目调用 Agent 时的默认模型；需要 Agent 的提示词、助手和流程参数在项目保存后再配置。"
    >
      <View style={styles.selector}>
        <CombinedModelSelector
          providers={providers}
          selectedProvider={value.provider}
          selectedModel={value.model}
          onSelect={handleSelect}
          isLoading={snapshot.isLoading || snapshot.isFetching}
          onOpen={handleOpen}
          onRetryProvider={handleRetry}
          isRetryingProvider={snapshot.isRefreshing}
          disabled={disabled}
          serverId={serverId}
          desktopPlacement="bottom-start"
          desktopMinWidth={420}
          triggerFill
        />
      </View>
      {snapshot.error ? <Text style={styles.error}>{snapshot.error}</Text> : null}
    </Field>
  );
}

const styles = StyleSheet.create((theme) => ({
  selector: {
    minHeight: 40,
    justifyContent: "center",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
  },
}));
