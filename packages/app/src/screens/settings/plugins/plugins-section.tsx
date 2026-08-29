import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  PluginAppDefinition,
  PluginMarketplaceSummary,
  PluginSummary,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { Switch } from "@/components/ui/switch";
import { usePlugins } from "@/hooks/use-plugins";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { DEVELOPMENT_PLUGIN_ID } from "@/plugins/byte-development/flow-model";
import { resolvePluginAppSelection } from "@/plugins/sidebar-panel/model";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";
import { HttpServiceModal } from "@/plugins/workflow-http-service/http-service-modal";
import { HTTP_SERVICE_PLUGIN_ID } from "@/plugins/workflow-http-service/http-service-panel";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { SettingsSection } from "@/screens/settings/settings-section";
import { PluginLogsSheet } from "@/screens/settings/plugins/plugin-logs-sheet";
import { HostResourceSyncCard } from "@/screens/settings/shared/host-resource-sync-card";
import { usePanelStore } from "@/stores/panel-store";
import { settingsStyles } from "@/styles/settings";
import { confirmDialog } from "@/utils/confirm-dialog";
import { PluginAppModal } from "./plugin-app-modal";

function PluginUpgradeCard() {
  return (
    <SettingsSection title="插件">
      <View style={settingsStyles.card} testID="host-page-plugins-upgrade-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>插件管理需要更新主机</Text>
            <Text style={settingsStyles.rowHint}>
              请更新所选 Paseo Daemon，以安装兼容 Codex 的插件包。
            </Text>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}

function capabilitySummary(plugin: PluginSummary): string {
  const parts: string[] = [];
  if (plugin.runtime) {
    parts.push("运行时代码");
  }
  if (plugin.skills.length > 0) {
    parts.push(`${plugin.skills.length} skill${plugin.skills.length === 1 ? "" : "s"}`);
  }
  if (plugin.mcpServers.length > 0) {
    parts.push(
      `${plugin.mcpServers.length} MCP server${plugin.mcpServers.length === 1 ? "" : "s"}`,
    );
  }
  if (plugin.httpServices.length > 0) {
    parts.push(`${plugin.httpServices.length} 个 HTTP 服务`);
  }
  if (plugin.apps.length > 0) {
    parts.push(`${plugin.apps.length} 个应用`);
  }
  return parts.length > 0 ? parts.join(" · ") : "没有支持的资源";
}

function runtimeStatusLabel(status: NonNullable<PluginSummary["runtime"]>["status"]): string {
  if (status === "running") return "运行中";
  if (status === "failed") return "失败";
  return "已停用";
}

function PluginAppButton({
  plugin,
  app,
  onOpen,
}: {
  plugin: PluginSummary;
  app: PluginAppDefinition;
  onOpen: (plugin: PluginSummary, app: PluginAppDefinition) => void;
}) {
  const handleOpen = useCallback(() => onOpen(plugin, app), [app, onOpen, plugin]);
  return (
    <Button
      size="sm"
      variant="outline"
      onPress={handleOpen}
      disabled={!plugin.installed || !plugin.enabled}
    >
      打开应用：{app.id}
    </Button>
  );
}

// oxlint-disable-next-line complexity -- A unified row renders every optional plugin capability.
function PluginRow({
  plugin,
  isFirst,
  isMutating,
  onInstall,
  onToggle,
  onUninstall,
  onOpenApp,
  onReload,
  onOpenLogs,
  supportsLogs,
}: {
  plugin: PluginSummary;
  isFirst: boolean;
  isMutating: boolean;
  onInstall: (plugin: PluginSummary) => void;
  onToggle: (plugin: PluginSummary, enabled: boolean) => void;
  onUninstall: (plugin: PluginSummary) => void;
  onOpenApp: (plugin: PluginSummary, app: PluginAppDefinition) => void;
  onReload: (plugin: PluginSummary) => void;
  onOpenLogs: (plugin: PluginSummary) => void;
  supportsLogs: boolean;
}) {
  const rowStyle = useMemo(
    () => [
      isFirst ? settingsStyles.row : [settingsStyles.row, settingsStyles.rowBorder],
      styles.pluginRow,
    ],
    [isFirst],
  );
  const handleInstall = useCallback(() => onInstall(plugin), [onInstall, plugin]);
  const handleUninstall = useCallback(() => onUninstall(plugin), [onUninstall, plugin]);
  const handleToggle = useCallback(
    (enabled: boolean) => onToggle(plugin, enabled),
    [onToggle, plugin],
  );
  const handleReload = useCallback(() => onReload(plugin), [onReload, plugin]);
  const handleOpenLogs = useCallback(() => onOpenLogs(plugin), [onOpenLogs, plugin]);
  return (
    <View style={rowStyle} testID={`plugin-row-${plugin.id}`}>
      <View style={styles.pluginBody}>
        <View style={styles.titleLine}>
          <Text style={settingsStyles.rowTitle}>{plugin.displayName}</Text>
          <Text style={styles.badge}>v{plugin.version}</Text>
          {plugin.category ? <Text style={styles.badge}>{plugin.category}</Text> : null}
          {plugin.installed && !plugin.enabled ? <Text style={styles.badge}>已禁用</Text> : null}
          {plugin.runtime ? (
            <Text
              style={[
                styles.badge,
                plugin.runtime.status === "failed" ? styles.runtimeFailedBadge : null,
              ]}
            >
              运行时：{runtimeStatusLabel(plugin.runtime.status)}
            </Text>
          ) : null}
        </View>
        <Text style={settingsStyles.rowHint}>{plugin.description}</Text>
        <Text style={styles.capabilityText}>{capabilitySummary(plugin)}</Text>
        {plugin.skills.length > 0 ? (
          <Text style={styles.resourceText}>Skills：{plugin.skills.join(", ")}</Text>
        ) : null}
        {plugin.mcpServers.length > 0 ? (
          <Text style={styles.resourceText}>MCP: {plugin.mcpServers.join(", ")}</Text>
        ) : null}
        {plugin.httpServices.map((service) => (
          <View key={service.name} style={styles.httpService}>
            <Text style={styles.resourceText}>
              HTTP: {service.name} · {service.status}
            </Text>
            <Text style={styles.pathText}>
              {service.submitUrl ??
                `http://${service.host}:${service.configuredPort}${service.path}`}
            </Text>
            <Text style={styles.pathText}>Workflow: {service.workflowPath}</Text>
            {service.error ? <Text style={styles.warningText}>{service.error}</Text> : null}
          </View>
        ))}
        {plugin.apps.length > 0 ? (
          <View style={styles.appList}>
            {plugin.apps.map((app) => (
              <PluginAppButton key={app.id} plugin={plugin} app={app} onOpen={onOpenApp} />
            ))}
          </View>
        ) : null}
        {plugin.marketplaceName ? (
          <Text style={styles.pathText}>Source: {plugin.marketplaceName}</Text>
        ) : null}
        {plugin.sourcePath ? <Text style={styles.pathText}>{plugin.sourcePath}</Text> : null}
        {plugin.runtime?.path && plugin.runtime.path !== plugin.sourcePath ? (
          <Text style={styles.pathText}>运行时目录：{plugin.runtime.path}</Text>
        ) : null}
        {plugin.unsupportedComponents.length > 0 ? (
          <Text style={styles.warningText}>
            Not active in Paseo yet: {plugin.unsupportedComponents.join(", ")}
          </Text>
        ) : null}
        {plugin.warnings.map((warning) => (
          <Text key={warning} style={styles.warningText}>
            {warning}
          </Text>
        ))}
      </View>
      <View style={styles.actions}>
        {plugin.installed && plugin.pluginId ? (
          <>
            {plugin.runtime && supportsLogs ? (
              <Button size="sm" variant="outline" onPress={handleOpenLogs} disabled={isMutating}>
                日志
              </Button>
            ) : null}
            {plugin.runtime ? (
              <Button
                size="sm"
                variant="outline"
                onPress={handleReload}
                disabled={isMutating || !plugin.enabled}
              >
                重新加载
              </Button>
            ) : null}
            <Switch
              value={plugin.enabled}
              onValueChange={handleToggle}
              accessibilityLabel={`启用 ${plugin.displayName}`}
              disabled={isMutating}
            />
            {plugin.updateAvailable ? (
              <Button size="sm" variant="default" onPress={handleInstall} disabled={isMutating}>
                更新
              </Button>
            ) : null}
            <Button size="sm" variant="destructive" onPress={handleUninstall} disabled={isMutating}>
              卸载
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="default"
            onPress={handleInstall}
            disabled={!plugin.installable || isMutating}
          >
            安装
          </Button>
        )}
      </View>
    </View>
  );
}

function MarketplaceRow({
  marketplace,
  isFirst,
  onRemove,
}: {
  marketplace: PluginMarketplaceSummary;
  isFirst: boolean;
  onRemove: (marketplace: PluginMarketplaceSummary) => void;
}) {
  const handleRemove = useCallback(() => onRemove(marketplace), [marketplace, onRemove]);
  return (
    <View style={isFirst ? settingsStyles.row : [settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{marketplace.displayName}</Text>
        <Text style={settingsStyles.rowHint}>
          {marketplace.pluginCount} plugin{marketplace.pluginCount === 1 ? "" : "s"}
        </Text>
        <Text style={styles.pathText}>{marketplace.path}</Text>
        {marketplace.error ? <Text style={styles.warningText}>{marketplace.error}</Text> : null}
      </View>
      {marketplace.removable ? (
        <Button size="sm" variant="outline" onPress={handleRemove}>
          移除
        </Button>
      ) : null}
    </View>
  );
}

// oxlint-disable-next-line complexity -- The catalog coordinates all unified plugin lifecycle actions.
export function PluginsSection({ serverId }: { serverId: string }) {
  const supportsPlugins = useHostFeature(serverId, "plugins");
  const supportsRuntimePlugins = useHostFeature(serverId, "pluginManagement");
  const supportsPluginLogs = useHostFeature(serverId, "pluginLogs");
  const client = useHostRuntimeClient(serverId);
  const { config, patchConfig } = useDaemonConfig(serverId);
  const plugins = usePlugins(serverId, { enabled: supportsPlugins });
  const openPluginPanel = usePluginAppPanelStore((state) => state.open);
  const openDesktopAgentList = usePanelStore((state) => state.openDesktopAgentList);
  const [sourcePath, setSourcePath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<{
    plugin: PluginSummary;
    app: PluginAppDefinition;
  } | null>(null);
  const [logsPluginId, setLogsPluginId] = useState<string | null>(null);

  const installed = useMemo(
    () => plugins.plugins.filter((plugin) => plugin.installed),
    [plugins.plugins],
  );
  const available = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return plugins.plugins.filter((plugin) => {
      if (plugin.installed) return false;
      if (!query) return true;
      return [
        plugin.displayName,
        plugin.description,
        plugin.marketplaceName ?? "",
        ...plugin.skills,
        ...plugin.mcpServers,
        ...plugin.apps.map((app) => app.id),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [plugins.plugins, searchQuery]);

  const handleRefresh = useCallback(() => {
    setMessage(null);
    void plugins.refresh().then(() => setMessage("插件源已刷新。"));
  }, [plugins]);

  const handleAddMarketplace = useCallback(() => {
    const path = sourcePath.trim();
    if (!path) return;
    setMessage(null);
    void plugins
      .addMarketplace(path)
      .then(() => {
        setSourcePath("");
        setMessage("插件市场已添加。");
        return undefined;
      })
      .catch(() => undefined);
  }, [plugins, sourcePath]);

  const handleInstallLocal = useCallback(() => {
    const path = sourcePath.trim();
    if (!path) return;
    setMessage(null);
    void plugins
      .installPlugin({ type: "local", path })
      .then((plugin) => {
        setSourcePath("");
        setMessage(`${plugin.displayName} 已安装。`);
        return undefined;
      })
      .catch(() => undefined);
  }, [plugins, sourcePath]);

  const handleInstall = useCallback(
    (plugin: PluginSummary) => {
      if (!plugin.marketplaceId) return;
      setMessage(null);
      void plugins
        .installPlugin({
          type: "marketplace",
          marketplaceId: plugin.marketplaceId,
          pluginName: plugin.name,
        })
        .then((installedPlugin) =>
          setMessage(
            plugin.updateAvailable
              ? `${installedPlugin.displayName} 已更新。`
              : `${installedPlugin.displayName} 已安装。`,
          ),
        )
        .catch(() => undefined);
    },
    [plugins],
  );

  const handleToggle = useCallback(
    (plugin: PluginSummary, enabled: boolean) => {
      if (!plugin.pluginId) return;
      void plugins.setPluginEnabled(plugin.pluginId, enabled);
    },
    [plugins],
  );
  const handleReload = useCallback(
    (plugin: PluginSummary) => {
      if (!client || !plugin.pluginId || !plugin.runtime) return;
      setMessage(null);
      void client
        .reloadPlugin(plugin.pluginId)
        .then(() => plugins.refresh())
        .then(() => setMessage(`${plugin.displayName} 已重新加载。`))
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : String(error)),
        );
    },
    [client, plugins],
  );
  const handleOpenLogs = useCallback((plugin: PluginSummary) => {
    if (plugin.pluginId) setLogsPluginId(plugin.pluginId);
  }, []);
  const handleToggleRuntime = useCallback(
    (enabled: boolean) => {
      setMessage(null);
      void patchConfig({ pluginsEnabled: enabled })
        .then(() => plugins.refresh())
        .then(() => setMessage(enabled ? "运行时插件已启用。" : "运行时插件已停用。"))
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : String(error)),
        );
    },
    [patchConfig, plugins],
  );

  const handleUninstall = useCallback(
    (plugin: PluginSummary) => {
      if (!plugin.pluginId) return;
      void confirmDialog({
        title: `卸载 ${plugin.displayName}？`,
        message:
          "这会移除插件的 Skills、MCP 服务、HTTP 服务和应用；插件数据会保留，以便后续重新安装。",
        confirmLabel: "卸载",
        destructive: true,
      }).then((confirmed) => {
        if (confirmed) void plugins.uninstallPlugin(plugin.pluginId!);
        return undefined;
      });
    },
    [plugins],
  );

  const handleRemoveMarketplace = useCallback(
    (marketplace: PluginMarketplaceSummary) => {
      void plugins.removeMarketplace(marketplace.id);
    },
    [plugins],
  );
  const handleOpenApp = useCallback(
    (plugin: PluginSummary, app: PluginAppDefinition) => {
      if (plugin.pluginId === DEVELOPMENT_PLUGIN_ID) {
        openDesktopAgentList();
        openPluginPanel(resolvePluginAppSelection(serverId, { plugin, app }));
        setSelectedApp(null);
        return;
      }
      setSelectedApp({ plugin, app });
    },
    [openDesktopAgentList, openPluginPanel, serverId],
  );
  const handleCloseApp = useCallback(() => setSelectedApp(null), []);
  const handleCloseLogs = useCallback(() => setLogsPluginId(null), []);

  if (!supportsPlugins) return <PluginUpgradeCard />;

  const error = plugins.mutationError ?? plugins.error;
  let availableContent: React.ReactNode;
  if (plugins.isLoading) {
    availableContent = (
      <View style={settingsStyles.row}>
        <Text style={settingsStyles.rowHint}>正在加载插件…</Text>
      </View>
    );
  } else if (available.length > 0) {
    availableContent = available.map((plugin, index) => (
      <PluginRow
        key={plugin.id}
        plugin={plugin}
        isFirst={index === 0}
        isMutating={plugins.isMutating}
        onInstall={handleInstall}
        onToggle={handleToggle}
        onUninstall={handleUninstall}
        onOpenApp={handleOpenApp}
        onReload={handleReload}
        onOpenLogs={handleOpenLogs}
        supportsLogs={supportsPluginLogs}
      />
    ));
  } else {
    availableContent = (
      <View style={settingsStyles.row}>
        <Text style={settingsStyles.rowHint}>没有可用插件。</Text>
      </View>
    );
  }
  let appModal = (
    <PluginAppModal
      visible={selectedApp !== null}
      serverId={serverId}
      plugin={selectedApp?.plugin ?? null}
      appDefinition={selectedApp?.app ?? null}
      onClose={handleCloseApp}
    />
  );
  if (selectedApp?.plugin.pluginId === HTTP_SERVICE_PLUGIN_ID) {
    appModal = (
      <HttpServiceModal
        visible
        serverId={serverId}
        plugin={selectedApp.plugin}
        appDefinition={selectedApp.app}
        onClose={handleCloseApp}
      />
    );
  }
  return (
    <View testID="host-page-plugins">
      <SettingsSection title="插件">
        <View style={styles.headerCard}>
          <View style={styles.headerText}>
            <Text style={settingsStyles.rowTitle}>安装兼容 Codex 的插件包</Text>
            <Text style={settingsStyles.rowHint}>
              插件在统一生命周期内组合 Skills、MCP 服务、Workflow HTTP 服务和 Agent 生成的应用。
            </Text>
          </View>
          <Button
            variant="outline"
            onPress={handleRefresh}
            loading={plugins.isMutating}
            disabled={!plugins.isConnected}
          >
            刷新
          </Button>
        </View>
      </SettingsSection>

      {supportsRuntimePlugins ? (
        <SettingsSection title="运行时">
          <View style={settingsStyles.card}>
            <View style={settingsStyles.row}>
              <View style={settingsStyles.rowContent}>
                <Text style={settingsStyles.rowTitle}>启用插件运行时代码</Text>
                <Text style={settingsStyles.rowHint}>
                  控制插件的进程隔离运行时代码；Skills、MCP、应用和 HTTP
                  等声明式资源仍由同一插件统一管理。
                </Text>
              </View>
              <Switch
                value={config?.pluginsEnabled === true}
                onValueChange={handleToggleRuntime}
                disabled={plugins.isMutating}
                accessibilityLabel="启用插件运行时代码"
              />
            </View>
          </View>
        </SettingsSection>
      ) : null}

      <HostResourceSyncCard
        serverId={serverId}
        kind="plugins"
        requiredFeature="plugins"
        description="同步插件安装来源、启用状态及其运行时能力；目标主机不会删除已有插件。"
        warning="本地目录插件要求目标主机存在相同路径；插件市场插件要求目标主机能够访问相同插件市场。"
      />

      <SettingsSection title="添加本地来源">
        <View style={styles.formCard}>
          <Field
            label="插件或市场路径"
            hint="请选择包含 paseo-plugin.json 或 .codex-plugin/plugin.json 的插件目录，或插件市场根目录/文件。"
          >
            <FormTextInput
              value={sourcePath}
              onChangeText={setSourcePath}
              placeholder="/absolute/path/to/plugin-or-marketplace"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
          <View style={styles.formActions}>
            <Button
              variant="outline"
              onPress={handleAddMarketplace}
              disabled={!sourcePath.trim() || plugins.isMutating}
            >
              添加插件市场
            </Button>
            <Button
              variant="default"
              onPress={handleInstallLocal}
              disabled={!sourcePath.trim() || plugins.isMutating}
            >
              安装本地插件
            </Button>
          </View>
          {message ? <Text style={styles.successText}>{message}</Text> : null}
          {error ? <Text style={styles.warningText}>{error.message}</Text> : null}
        </View>
      </SettingsSection>

      <SettingsSection title={`已安装（${installed.length}）`}>
        <View style={settingsStyles.card}>
          {installed.length > 0 ? (
            installed.map((plugin, index) => (
              <PluginRow
                key={plugin.id}
                plugin={plugin}
                isFirst={index === 0}
                isMutating={plugins.isMutating}
                onInstall={handleInstall}
                onToggle={handleToggle}
                onUninstall={handleUninstall}
                onOpenApp={handleOpenApp}
                onReload={handleReload}
                onOpenLogs={handleOpenLogs}
                supportsLogs={supportsPluginLogs}
              />
            ))
          ) : (
            <View style={settingsStyles.row}>
              <Text style={settingsStyles.rowHint}>暂无已安装插件。</Text>
            </View>
          )}
        </View>
      </SettingsSection>

      <SettingsSection title="插件市场">
        <View style={settingsStyles.card}>
          {plugins.marketplaces.length > 0 ? (
            plugins.marketplaces.map((marketplace, index) => (
              <MarketplaceRow
                key={marketplace.id}
                marketplace={marketplace}
                isFirst={index === 0}
                onRemove={handleRemoveMarketplace}
              />
            ))
          ) : (
            <View style={settingsStyles.row}>
              <Text style={settingsStyles.rowHint}>未找到本地插件市场。</Text>
            </View>
          )}
        </View>
      </SettingsSection>

      <SettingsSection title={`可用插件（${available.length}）`}>
        <View style={styles.searchCard}>
          <FormTextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="搜索插件、Skill、MCP 服务或应用"
          />
        </View>
        <View style={settingsStyles.card}>{availableContent}</View>
      </SettingsSection>
      {appModal}
      {client && logsPluginId ? (
        <PluginLogsSheet
          client={client}
          pluginId={logsPluginId}
          serverId={serverId}
          onClose={handleCloseLogs}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  headerCard: {
    ...settingsStyles.card,
    padding: theme.spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    flexWrap: "wrap",
  },
  headerText: {
    flex: 1,
    minWidth: 220,
    gap: theme.spacing[1],
  },
  formCard: {
    ...settingsStyles.card,
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  searchCard: {
    ...settingsStyles.card,
    padding: theme.spacing[3],
  },
  pluginRow: {
    alignItems: "flex-start",
    gap: theme.spacing[3],
    flexWrap: "wrap",
  },
  pluginBody: {
    flex: 1,
    minWidth: 220,
    gap: theme.spacing[1],
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  badge: {
    color: theme.colors.foregroundMuted,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    fontSize: theme.fontSize.xs,
  },
  runtimeFailedBadge: {
    color: theme.colors.destructive,
  },
  capabilityText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
  },
  httpService: {
    gap: theme.spacing[1],
  },
  appList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  resourceText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    flexWrap: "wrap",
  },
  pathText: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
    flexWrap: "wrap",
  },
  warningText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  successText: {
    color: theme.colors.palette.green[500],
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
