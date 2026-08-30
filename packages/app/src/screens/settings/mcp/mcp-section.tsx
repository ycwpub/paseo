import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { McpServer, McpTransport } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingsTextAreaCard } from "@/components/settings-textarea";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useMcpServers } from "@/hooks/use-mcp-servers";
import { useHostFeature } from "@/runtime/host-features";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  buildMcpOriginalJson,
  getMcpJsonImportErrorMessage,
  normalizeStdioTransport,
  parseMcpJsonImport,
} from "./mcp-json-import";

interface McpSectionProps {
  serverId: string;
  onCreate: () => void;
  onEdit: (server: McpServer) => void;
}

const EMPTY_MCP_JSON = `{
  "mcpServers": {
    "weather": {
      "command": "uv",
      "args": ["--directory", "/path/to/weather", "run", "weather.py"],
      "description": "天气信息服务"
    }
  }
}`;

function McpUpgradeCard() {
  return (
    <SettingsSection title="MCP 服务">
      <View style={settingsStyles.card} testID="host-page-mcp-upgrade-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>MCP 服务管理需要更新主机</Text>
            <Text style={settingsStyles.rowHint}>
              请更新所选 Paseo 服务，以添加、编辑、测试和删除 MCP 服务。
            </Text>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}

function summarizeTransport(transport: McpTransport): string {
  if (transport.type === "stdio") {
    const args = transport.args?.length ? ` ${transport.args.join(" ")}` : "";
    return `${transport.command}${args}`;
  }
  return `${transport.type.toUpperCase()} · ${transport.url}`;
}

function statusLabel(server: McpServer): string {
  if (server.lastTestStatus === "connected") return "已连接";
  if (server.lastTestStatus === "error") return "错误";
  if (server.lastTestStatus === "testing") return "测试中";
  if (server.lastTestStatus === "disconnected") return "已断开";
  return server.enabled ? "未测试" : "已禁用";
}

function buildServerJson(server: McpServer): string {
  if (server.originalJson?.trim()) return server.originalJson;
  return buildMcpOriginalJson(server.name, server.description, server.transport);
}

function McpServerTools({ server }: { server: McpServer }) {
  const tools = server.tools ?? [];
  if (tools.length === 0) {
    return <Text style={styles.toolsEmpty}>尚未上报工具。</Text>;
  }
  return (
    <View style={styles.toolsList}>
      {tools.map((tool) => (
        <View key={tool.name} style={styles.toolPill}>
          <Text style={styles.toolPillText}>{tool.name}</Text>
        </View>
      ))}
    </View>
  );
}

function McpServerRow({
  server,
  isFirst,
  isTesting,
  onToggleEnabled,
  onTest,
  onEdit,
  onDelete,
}: {
  server: McpServer;
  isFirst: boolean;
  isTesting: boolean;
  onToggleEnabled: (server: McpServer, enabled: boolean) => void;
  onTest: (server: McpServer) => void;
  onEdit: (server: McpServer) => void;
  onDelete: (server: McpServer) => void;
}) {
  const isPluginOwned = Boolean(server.pluginId);
  const handleToggle = useCallback(
    (enabled: boolean) => {
      onToggleEnabled(server, enabled);
    },
    [onToggleEnabled, server],
  );
  const handleTest = useCallback(() => onTest(server), [onTest, server]);
  const handleEdit = useCallback(() => onEdit(server), [onEdit, server]);
  const handleDelete = useCallback(() => onDelete(server), [onDelete, server]);
  const rowStyle = useMemo(
    () => [
      isFirst ? settingsStyles.row : [settingsStyles.row, settingsStyles.rowBorder],
      styles.serverRow,
    ],
    [isFirst],
  );

  return (
    <View style={rowStyle} testID={`mcp-server-row-${server.id}`}>
      <View style={settingsStyles.rowContent}>
        <View style={styles.rowTitleLine}>
          <Text style={settingsStyles.rowTitle} numberOfLines={1}>
            {server.name}
          </Text>
          <Text style={[styles.statusBadge, server.enabled ? null : styles.statusBadgeMuted]}>
            {statusLabel(server)}
          </Text>
          {server.pluginName ? <Text style={styles.statusBadge}>{server.pluginName}</Text> : null}
        </View>
        {server.description ? (
          <Text style={settingsStyles.rowHint} numberOfLines={2}>
            {server.description}
          </Text>
        ) : null}
        <Text style={styles.monoHint} numberOfLines={2}>
          {summarizeTransport(server.transport)}
        </Text>
        <McpServerTools server={server} />
      </View>
      <View style={styles.rowActions}>
        <Switch
          value={server.enabled}
          onValueChange={handleToggle}
          accessibilityLabel={`Enable ${server.name}`}
        />
        <Button size="sm" variant="outline" onPress={handleTest} loading={isTesting}>
          测试
        </Button>
        <Button size="sm" variant="outline" onPress={handleEdit} disabled={isPluginOwned}>
          编辑
        </Button>
        <Button size="sm" variant="destructive" onPress={handleDelete} disabled={isPluginOwned}>
          删除
        </Button>
      </View>
    </View>
  );
}

export function McpSection({ serverId, onCreate, onEdit }: McpSectionProps) {
  const supportsMcpServers = useHostFeature(serverId, "mcpServers");
  const mcp = useMcpServers(serverId, { enabled: supportsMcpServers });
  const [searchQuery, setSearchQuery] = useState("");
  const [testingServerIds, setTestingServerIds] = useState<string[]>([]);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const filteredServers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return mcp.servers;
    return mcp.servers.filter((server) => {
      const haystack = [
        server.name,
        server.description ?? "",
        summarizeTransport(server.transport),
        ...(server.tools ?? []).map((tool) => tool.name),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [mcp.servers, searchQuery]);

  const handleToggleEnabled = useCallback(
    (server: McpServer, enabled: boolean) => {
      void mcp.updateServer({ id: server.id, enabled });
    },
    [mcp],
  );

  const handleTest = useCallback(
    async (server: McpServer) => {
      setTestingServerIds((current) =>
        current.includes(server.id) ? current : [...current, server.id],
      );
      setTestMessage(null);
      try {
        const result = await mcp.testServer(server.id);
        setTestMessage(
          result.status === "connected"
            ? `${server.name}：连接测试通过。`
            : `${server.name}：${result.error ?? "连接测试失败。"}`,
        );
      } catch (error) {
        setTestMessage(`${server.name}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setTestingServerIds((current) => current.filter((id) => id !== server.id));
      }
    },
    [mcp],
  );

  const handleDelete = useCallback(
    (server: McpServer) => {
      void confirmDialog({
        title: `删除 ${server.name}？`,
        message: "这会从当前主机移除该 MCP 服务。",
        confirmLabel: "删除",
        destructive: true,
      }).then((confirmed) => {
        if (confirmed) {
          void mcp.deleteServer(server.id);
        }
        return undefined;
      });
    },
    [mcp],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshMessage(null);
    try {
      await mcp.refreshServers();
      setRefreshMessage("已扫描本地 Skill 和 MCP 资源。");
    } catch {
      // The hook exposes the mutation error below.
    }
  }, [mcp]);

  const serverListContent = useMemo(() => {
    if (mcp.isLoading) {
      return (
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>正在加载 MCP 服务…</Text>
        </View>
      );
    }

    if (filteredServers.length > 0) {
      return filteredServers.map((server, index) => (
        <McpServerRow
          key={server.id}
          server={server}
          isFirst={index === 0}
          isTesting={testingServerIds.includes(server.id)}
          onToggleEnabled={handleToggleEnabled}
          onTest={handleTest}
          onEdit={onEdit}
          onDelete={handleDelete}
        />
      ));
    }

    return (
      <View style={settingsStyles.row}>
        <Text style={settingsStyles.rowHint}>
          {mcp.servers.length === 0 ? "尚未配置 MCP 服务。" : "没有匹配的 MCP 服务。"}
        </Text>
      </View>
    );
  }, [
    filteredServers,
    handleDelete,
    handleTest,
    handleToggleEnabled,
    mcp.isLoading,
    mcp.servers.length,
    onEdit,
    testingServerIds,
  ]);

  if (!supportsMcpServers) {
    return <McpUpgradeCard />;
  }

  return (
    <View testID="host-page-mcp">
      <SettingsSection title="MCP 服务">
        <View style={styles.headerCard}>
          <View style={styles.headerText}>
            <Text style={settingsStyles.rowTitle}>管理 Model Context Protocol 服务</Text>
            <Text style={settingsStyles.rowHint}>
              导入 Claude/Codex 格式的 MCP JSON，启用或禁用服务，并测试连接。
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Button
              variant="outline"
              onPress={handleRefresh}
              loading={mcp.isMutating}
              disabled={!mcp.isConnected}
            >
              扫描本地资源
            </Button>
            <Button variant="default" onPress={onCreate} disabled={!mcp.isConnected}>
              从 JSON 添加
            </Button>
          </View>
        </View>
      </SettingsSection>

      <SettingsSection title={`已配置服务（${mcp.servers.length}）`}>
        <View style={styles.searchCard}>
          <Field label="搜索">
            <FormTextInput
              initialValue={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="搜索服务和工具"
            />
          </Field>
        </View>
        <View style={settingsStyles.card}>{serverListContent}</View>
        {refreshMessage ? <Text style={styles.sectionMessage}>{refreshMessage}</Text> : null}
        {testMessage ? <Text style={styles.sectionMessage}>{testMessage}</Text> : null}
        {mcp.error ? <Text style={settingsStyles.rowError}>{mcp.error.message}</Text> : null}
        {mcp.mutationError ? (
          <Text style={settingsStyles.rowError}>{mcp.mutationError.message}</Text>
        ) : null}
      </SettingsSection>
    </View>
  );
}

export function McpEditorPage({
  serverId,
  mcpServerId,
  onDone,
}: {
  serverId: string;
  mcpServerId?: string;
  onDone: () => void;
}) {
  const supportsMcpServers = useHostFeature(serverId, "mcpServers");
  const mcp = useMcpServers(serverId, { enabled: supportsMcpServers });
  const editingServer = useMemo(
    () => mcp.servers.find((server) => server.id === mcpServerId) ?? null,
    [mcp.servers, mcpServerId],
  );
  const [jsonInput, setJsonInput] = useState(EMPTY_MCP_JSON);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (editingServer) {
      setJsonInput(buildServerJson(editingServer));
      setJsonError(null);
    }
  }, [editingServer]);

  const handleSubmitJson = useCallback(async () => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonInput);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "请输入有效的 JSON。");
      return;
    }

    const parseResult = parseMcpJsonImport(parsedJson);
    if (!parseResult.isValid) {
      setJsonError(getMcpJsonImportErrorMessage(parseResult.errorKey));
      return;
    }

    if (mcpServerId && parseResult.servers.length !== 1) {
      setJsonError("编辑时 JSON 中必须且只能包含一个 MCP 服务。");
      return;
    }

    try {
      if (editingServer) {
        const parsedServer = parseResult.servers[0]!;
        const transport = normalizeStdioTransport(parsedServer.transport);
        await mcp.updateServer({
          id: editingServer.id,
          name: parsedServer.name,
          description: parsedServer.description,
          transport,
          originalJson: buildMcpOriginalJson(
            parsedServer.name,
            parsedServer.description,
            transport,
          ),
        });
      } else {
        for (const parsedServer of parseResult.servers) {
          const transport = normalizeStdioTransport(parsedServer.transport);
          await mcp.createServer({
            name: parsedServer.name,
            description: parsedServer.description,
            enabled: true,
            transport,
            originalJson: buildMcpOriginalJson(
              parsedServer.name,
              parsedServer.description,
              transport,
            ),
          });
        }
      }
      onDone();
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  }, [editingServer, jsonInput, mcp, mcpServerId, onDone]);

  if (!supportsMcpServers) {
    return <McpUpgradeCard />;
  }

  if (mcpServerId && !mcp.isLoading && !editingServer) {
    return (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>找不到 MCP 服务</Text>
            <Text style={settingsStyles.rowHint}>该服务可能已被删除或不再可编辑。</Text>
          </View>
          <Button size="sm" variant="outline" onPress={onDone}>
            返回列表
          </Button>
        </View>
      </View>
    );
  }

  return (
    <SettingsSection title={mcpServerId ? "编辑 MCP 服务" : "创建 MCP 服务"}>
      <View style={styles.formCard}>
        <Field
          label="MCP JSON"
          hint='支持 { "mcpServers": { ... } }，创建时也可以一次导入多个具名服务。'
        >
          <SettingsTextAreaCard
            key={`mcp-json-${mcpServerId ?? "new"}-${editingServer?.updatedAt ?? "loading"}`}
            value={jsonInput}
            onChangeText={setJsonInput}
            accessibilityLabel="MCP JSON 配置"
            placeholder={EMPTY_MCP_JSON}
            style={styles.jsonInput}
            testID="mcp-json-input"
          />
        </Field>
        {jsonError ? <Text style={settingsStyles.rowError}>{jsonError}</Text> : null}
        {mcp.mutationError ? (
          <Text style={settingsStyles.rowError}>{mcp.mutationError.message}</Text>
        ) : null}
        <View style={styles.actionsRow}>
          <Button variant="outline" onPress={onDone} disabled={mcp.isMutating}>
            取消
          </Button>
          <Button
            variant="default"
            onPress={handleSubmitJson}
            loading={mcp.isMutating}
            disabled={!mcp.isConnected || (mcpServerId !== undefined && !editingServer)}
            testID="save-mcp-server"
          >
            {mcpServerId ? "保存服务" : "创建服务"}
          </Button>
        </View>
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  headerCard: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[4],
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  formCard: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  searchCard: {
    backgroundColor: theme.colors.surface1,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.colors.border,
    padding: theme.spacing[3],
  },
  jsonInput: {
    minHeight: 260,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  serverRow: {
    alignItems: "flex-start",
  },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  statusBadge: {
    color: theme.colors.foregroundMuted,
    backgroundColor: theme.colors.surface3,
    borderRadius: theme.borderRadius.full,
    overflow: "hidden",
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    fontSize: theme.fontSize.sm,
  },
  statusBadgeMuted: {
    opacity: 0.7,
  },
  monoHint: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.4),
    marginTop: theme.spacing[1],
  },
  toolsEmpty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[2],
  },
  toolsList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[1],
    marginTop: theme.spacing[2],
  },
  toolPill: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
  toolPillText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  sectionMessage: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[2],
  },
}));
