import { Text, View } from "react-native";
import { Alert } from "@/components/ui/alert";
import { useMemory } from "@/hooks/use-memory";
import { useHostFeature, type HostFeatureName } from "@/runtime/host-features";
import { KnowledgeManagementSection } from "@/screens/settings/knowledge/knowledge-management-section";
import { MemoryHostSyncCard } from "@/screens/settings/memory/memory-host-sync-card";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import type { HostResourceSyncPage } from "@/utils/host-feature-routes";
import { HostResourceSyncCard } from "./host-resource-sync-card";

function MemoryResourceSyncPage({ serverId }: { serverId: string }) {
  const memorySupported = useHostFeature(serverId, "memory");
  const syncSupported = useHostFeature(serverId, "memorySync");
  const { memory, isLoading, error, isMutating } = useMemory(serverId, {
    enabled: memorySupported && syncSupported,
  });

  if (!memorySupported || !syncSupported) {
    return (
      <Alert
        variant="warning"
        title="当前主机不支持记忆同步"
        description="请更新所选主机的 Paseo 服务后再试。"
      />
    );
  }
  if (isLoading || !memory) {
    return (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>{error?.message ?? "正在加载记忆…"}</Text>
        </View>
      </View>
    );
  }
  return (
    <SettingsSection title="同步记忆">
      <MemoryHostSyncCard serverId={serverId} memory={memory} disabled={isMutating} />
    </SettingsSection>
  );
}

interface GenericSyncConfiguration {
  kind: Exclude<HostResourceSyncPage, "memory" | "knowledge">;
  requiredFeature: HostFeatureName;
  description?: string;
  warning?: string;
}

const GENERIC_SYNC_CONFIGURATIONS: Record<
  Exclude<HostResourceSyncPage, "memory" | "knowledge">,
  GenericSyncConfiguration
> = {
  mcp: {
    kind: "mcp",
    requiredFeature: "mcpServers",
    warning:
      "MCP 同步会复制完整传输配置，包括命令、环境变量、请求头和其中可能包含的凭据。请只同步到可信主机。",
  },
  skills: {
    kind: "skills",
    requiredFeature: "skills",
  },
  plugins: {
    kind: "plugins",
    requiredFeature: "plugins",
    description: "同步插件安装来源、启用状态及其运行时能力；本地目录插件可按所选策略同步实际文件。",
    warning:
      "插件市场插件要求目标主机能够访问相同插件市场。“覆盖同名内容”不会删除目标目录中仅目标端存在的文件。",
  },
  assistants: {
    kind: "assistants",
    requiredFeature: "assistants",
    description:
      "同步助手定义、提示词、资源选择、助手知识和助手记忆。自定义选择的技能与 MCP 会按名称映射到目标主机。",
  },
};

function GenericResourceSyncPage({
  serverId,
  configuration,
}: {
  serverId: string;
  configuration: GenericSyncConfiguration;
}) {
  const supported = useHostFeature(serverId, configuration.requiredFeature);
  if (!supported) {
    return (
      <Alert
        variant="warning"
        title="当前主机不支持此资源同步"
        description="请更新所选主机的 Paseo 服务后再试。"
      />
    );
  }
  return (
    <SettingsSection title="多主机共享">
      <HostResourceSyncCard
        serverId={serverId}
        kind={configuration.kind}
        requiredFeature={configuration.requiredFeature}
        description={configuration.description}
        warning={configuration.warning}
      />
    </SettingsSection>
  );
}

export function HostResourceSyncPage({
  serverId,
  page,
}: {
  serverId: string;
  page: HostResourceSyncPage;
}) {
  if (page === "memory") {
    return <MemoryResourceSyncPage serverId={serverId} />;
  }
  if (page === "knowledge") {
    return <KnowledgeManagementSection serverId={serverId} syncOnly />;
  }
  return (
    <GenericResourceSyncPage
      serverId={serverId}
      configuration={GENERIC_SYNC_CONFIGURATIONS[page]}
    />
  );
}
