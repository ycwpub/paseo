import { useCallback, useMemo, useState } from "react";
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
}

const ROW_WITH_BORDER_STYLE = [settingsStyles.row, settingsStyles.rowBorder];

const EMPTY_MCP_JSON = `{
  "mcpServers": {
    "weather": {
      "command": "uv",
      "args": ["--directory", "/path/to/weather", "run", "weather.py"],
      "description": "Weather information server"
    }
  }
}`;

function McpUpgradeCard() {
  return (
    <SettingsSection title="MCP servers">
      <View style={settingsStyles.card} testID="host-page-mcp-upgrade-card">
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>MCP server management requires a newer host</Text>
            <Text style={settingsStyles.rowHint}>
              Update the selected Paseo daemon to add, edit, test, and remove MCP servers.
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
  if (server.lastTestStatus === "connected") return "Connected";
  if (server.lastTestStatus === "error") return "Error";
  if (server.lastTestStatus === "testing") return "Testing";
  if (server.lastTestStatus === "disconnected") return "Disconnected";
  return server.enabled ? "Not tested" : "Disabled";
}

function buildServerJson(server: McpServer): string {
  if (server.originalJson?.trim()) return server.originalJson;
  return buildMcpOriginalJson(server.name, server.description, server.transport);
}

function McpServerTools({ server }: { server: McpServer }) {
  const tools = server.tools ?? [];
  if (tools.length === 0) {
    return <Text style={styles.toolsEmpty}>No tools reported yet.</Text>;
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
    () => [isFirst ? settingsStyles.row : ROW_WITH_BORDER_STYLE, styles.serverRow],
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
          Test
        </Button>
        <Button size="sm" variant="outline" onPress={handleEdit}>
          Edit
        </Button>
        <Button size="sm" variant="destructive" onPress={handleDelete}>
          Delete
        </Button>
      </View>
    </View>
  );
}

export function McpSection({ serverId }: McpSectionProps) {
  const supportsMcpServers = useHostFeature(serverId, "mcpServers");
  const mcp = useMcpServers(serverId, { enabled: supportsMcpServers });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [testingServerIds, setTestingServerIds] = useState<string[]>([]);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const editingServer = useMemo(
    () => mcp.servers.find((server) => server.id === editingServerId) ?? null,
    [editingServerId, mcp.servers],
  );

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

  const resetEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingServerId(null);
    setJsonInput("");
    setJsonError(null);
  }, []);

  const openCreateEditor = useCallback(() => {
    setEditingServerId(null);
    setJsonInput(EMPTY_MCP_JSON);
    setJsonError(null);
    setEditorOpen(true);
  }, []);

  const openEditEditor = useCallback((server: McpServer) => {
    setEditingServerId(server.id);
    setJsonInput(buildServerJson(server));
    setJsonError(null);
    setEditorOpen(true);
  }, []);

  const handleSubmitJson = useCallback(async () => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonInput);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Enter valid JSON.");
      return;
    }

    const parseResult = parseMcpJsonImport(parsedJson);
    if (!parseResult.isValid) {
      setJsonError(getMcpJsonImportErrorMessage(parseResult.errorKey));
      return;
    }

    if (editingServer && parseResult.servers.length !== 1) {
      setJsonError("Editing expects exactly one MCP server in the JSON.");
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
      resetEditor();
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  }, [editingServer, jsonInput, mcp, resetEditor]);

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
            ? `${server.name}: connection test passed.`
            : `${server.name}: ${result.error ?? "connection test failed."}`,
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
        title: `Delete ${server.name}?`,
        message: "This removes the MCP server from this host.",
        confirmLabel: "Delete",
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
      setRefreshMessage("Local Skill and MCP resources scanned.");
    } catch {
      // The hook exposes the mutation error below.
    }
  }, [mcp]);

  const serverListContent = useMemo(() => {
    if (mcp.isLoading) {
      return (
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>Loading MCP servers…</Text>
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
          onEdit={openEditEditor}
          onDelete={handleDelete}
        />
      ));
    }

    return (
      <View style={settingsStyles.row}>
        <Text style={settingsStyles.rowHint}>
          {mcp.servers.length === 0 ? "No MCP servers configured yet." : "No matching MCP servers."}
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
    openEditEditor,
    testingServerIds,
  ]);

  if (!supportsMcpServers) {
    return <McpUpgradeCard />;
  }

  return (
    <View testID="host-page-mcp">
      <SettingsSection title="MCP servers">
        <View style={styles.headerCard}>
          <View style={styles.headerText}>
            <Text style={settingsStyles.rowTitle}>Manage Model Context Protocol servers</Text>
            <Text style={settingsStyles.rowHint}>
              Import Claude/Codex-style MCP JSON, enable or disable servers, and test connections.
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Button
              variant="outline"
              onPress={handleRefresh}
              loading={mcp.isMutating}
              disabled={!mcp.isConnected}
            >
              Scan local resources
            </Button>
            <Button variant="default" onPress={openCreateEditor} disabled={!mcp.isConnected}>
              Add from JSON
            </Button>
          </View>
        </View>
      </SettingsSection>

      {editorOpen ? (
        <SettingsSection title={editingServer ? "Edit MCP server" : "Import MCP JSON"}>
          <View style={styles.formCard}>
            <Field
              label="MCP JSON"
              hint='Accepts { "mcpServers": { ... } } or an array of named servers.'
            >
              <SettingsTextAreaCard
                value={jsonInput}
                onChangeText={setJsonInput}
                accessibilityLabel="MCP JSON"
                placeholder={EMPTY_MCP_JSON}
                style={styles.jsonInput}
              />
            </Field>
            {jsonError ? <Text style={settingsStyles.rowError}>{jsonError}</Text> : null}
            {mcp.mutationError ? (
              <Text style={settingsStyles.rowError}>{mcp.mutationError.message}</Text>
            ) : null}
            <View style={styles.actionsRow}>
              <Button
                variant="default"
                onPress={handleSubmitJson}
                loading={mcp.isMutating}
                disabled={!mcp.isConnected}
              >
                {editingServer ? "Save server" : "Import"}
              </Button>
              <Button variant="outline" onPress={resetEditor} disabled={mcp.isMutating}>
                Cancel
              </Button>
            </View>
          </View>
        </SettingsSection>
      ) : null}

      <SettingsSection title={`Configured servers (${mcp.servers.length})`}>
        <View style={styles.searchCard}>
          <Field label="Search">
            <FormTextInput
              initialValue={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search servers and tools"
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
    fontSize: theme.fontSize.xs,
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
    fontSize: theme.fontSize.xs,
  },
  statusBadgeMuted: {
    opacity: 0.7,
  },
  monoHint: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.4),
    marginTop: theme.spacing[1],
  },
  toolsEmpty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
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
    fontSize: theme.fontSize.xs,
  },
  sectionMessage: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[2],
  },
}));
