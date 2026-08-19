/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Listener tabs and the selected editor bind to the current Project draft. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Plus, Save, Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  PluginAppDefinition,
  PluginHttpJob,
  PluginHttpListenerRuntime,
  PluginHttpProjectConfig,
  PluginSummary,
} from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import {
  PluginProjectBoundary,
  type PluginProjectContext,
} from "@/plugins/project/plugin-project-boundary";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { HttpServiceListenerForm } from "./http-service-listener-form";
import { HttpServiceRequestList } from "./http-service-request-list";
import { createHttpListener, listenerAddress, updateHttpListener } from "./http-service-model";

export const HTTP_SERVICE_PLUGIN_ID = "workflow-http-service";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function listenerStatusStyle(status: PluginHttpListenerRuntime["status"] | undefined) {
  if (status === "running") return styles.statusRunning;
  if (status === "error") return styles.statusError;
  return styles.statusStopped;
}

function HttpServiceProjectConsole({
  active,
  serverId,
  plugin,
  project,
}: {
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  project: PluginProjectContext;
}) {
  const client = useHostRuntimeClient(serverId);
  const supportsManagement = useHostFeature(serverId, "pluginHttpServiceManagement");
  const [config, setConfig] = useState<PluginHttpProjectConfig | null>(null);
  const [runtimes, setRuntimes] = useState<PluginHttpListenerRuntime[]>([]);
  const [selectedListenerId, setSelectedListenerId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<PluginHttpJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobLoading, setJobLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pluginId = plugin.pluginId ?? plugin.name;

  const loadConfig = useCallback(async () => {
    if (!client || !supportsManagement) return;
    setLoading(true);
    setError(null);
    try {
      const response = await client.getPluginHttpConfig(pluginId, project.projectId);
      if (response.error) throw new Error(response.error);
      if (!response.config) throw new Error("HTTP 服务配置不存在");
      setConfig(response.config);
      setRuntimes(response.runtimes);
      setSelectedListenerId((current) =>
        response.config!.listeners.some((listener) => listener.id === current)
          ? current
          : (response.config!.listeners[0]?.id ?? null),
      );
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setLoading(false);
    }
  }, [client, pluginId, project.projectId, supportsManagement]);

  const loadJobs = useCallback(async () => {
    if (!client) return;
    setJobLoading(true);
    try {
      const response = await client.listPluginAppJobs({
        pluginId,
        projectId: project.projectId,
        limit: 200,
      });
      if (response.error) throw new Error(response.error);
      setJobs(response.jobs);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setJobLoading(false);
    }
  }, [client, pluginId, project.projectId]);

  useEffect(() => {
    if (!active) return;
    void loadConfig();
    void loadJobs();
  }, [active, loadConfig, loadJobs]);

  const hasActiveJobs = jobs.some((job) => job.status === "queued" || job.status === "running");
  useEffect(() => {
    if (!active || !hasActiveJobs) return;
    const timer = setInterval(() => void loadJobs(), 1_000);
    return () => clearInterval(timer);
  }, [active, hasActiveJobs, loadJobs]);

  const selectedListener = useMemo(
    () => config?.listeners.find((listener) => listener.id === selectedListenerId) ?? null,
    [config, selectedListenerId],
  );
  const selectedRuntime = useMemo(
    () => runtimes.find((runtime) => runtime.listenerId === selectedListenerId) ?? null,
    [runtimes, selectedListenerId],
  );

  const save = useCallback(async () => {
    if (!client || !config) return;
    setSaving(true);
    setError(null);
    try {
      const response = await client.savePluginHttpConfig({
        version: 1,
        pluginId: config.pluginId,
        projectId: config.projectId,
        listeners: config.listeners,
      });
      if (response.error) throw new Error(response.error);
      if (!response.config) throw new Error("保存后没有返回 HTTP 服务配置");
      setConfig(response.config);
      setRuntimes(response.runtimes);
      await loadJobs();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setSaving(false);
    }
  }, [client, config, loadJobs]);

  const addListener = useCallback(() => {
    if (!config) return;
    const listener = createHttpListener(config);
    setConfig({ ...config, listeners: [...config.listeners, listener] });
    setSelectedListenerId(listener.id);
  }, [config]);

  const deleteSelectedListener = useCallback(() => {
    if (!config || !selectedListenerId) return;
    const listeners = config.listeners.filter((listener) => listener.id !== selectedListenerId);
    setConfig({ ...config, listeners });
    setSelectedListenerId(listeners[0]?.id ?? null);
  }, [config, selectedListenerId]);

  const deleteMany = useCallback(
    async (ids: string[]) => {
      if (!client) return;
      const response = await client.deletePluginHttpJobs(ids);
      if (response.error) {
        setError(response.error);
        return;
      }
      if (response.skipped.length > 0) {
        setError(response.skipped.map((entry) => `${entry.processId}: ${entry.reason}`).join("\n"));
      }
      await loadJobs();
    },
    [client, loadJobs],
  );

  const cleanupNow = useCallback(async () => {
    if (!client) return;
    const response = await client.cleanupPluginHttpJobs(pluginId, project.projectId);
    if (response.error) {
      setError(response.error);
      return;
    }
    await loadJobs();
  }, [client, loadJobs, pluginId, project.projectId]);

  if (!supportsManagement) {
    return (
      <View style={styles.noticeCard}>
        <Text style={styles.errorText}>当前 Host 不支持 HTTP 服务管理，请更新并重启 daemon。</Text>
      </View>
    );
  }

  if (!config) {
    return (
      <View style={styles.noticeCard}>
        <Text style={styles.muted}>{loading ? "正在加载 HTTP 服务配置…" : error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarTitle}>
          <Text style={styles.heading}>HTTP 服务</Text>
          <Text style={styles.muted}>
            Project：{project.projectName} · 多端口独立启停 · 请求持久化异步处理
          </Text>
        </View>
        <Button variant="outline" size="sm" leftIcon={Plus} onPress={addListener}>
          新增端口
        </Button>
        <Button variant="default" size="sm" leftIcon={Save} loading={saving} onPress={save}>
          保存并应用
        </Button>
      </View>
      {error ? (
        <View style={styles.errorCard}>
          <Text selectable style={styles.errorText}>
            {error}
          </Text>
        </View>
      ) : null}

      <View style={styles.listenerTabs}>
        {config.listeners.map((listener) => {
          const runtime = runtimes.find((entry) => entry.listenerId === listener.id);
          const selected = listener.id === selectedListenerId;
          return (
            <Pressable
              key={listener.id}
              style={[styles.listenerTab, selected && styles.listenerTabSelected]}
              onPress={() => setSelectedListenerId(listener.id)}
            >
              <View style={styles.listenerTabHeader}>
                <Text style={styles.listenerTabTitle}>{listener.name}</Text>
                <View style={[styles.statusDot, listenerStatusStyle(runtime?.status)]} />
              </View>
              <Text style={styles.listenerTabMeta}>
                {listenerAddress(listener.host, listener.port, runtime?.boundPort ?? null)}
              </Text>
              <Text style={styles.listenerTabMeta}>
                {listener.routes.length + (listener.defaultJobApi?.enabled ? 1 : 0)} 个处理入口
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selectedListener ? (
        <HttpServiceListenerForm
          listener={selectedListener}
          runtime={selectedRuntime}
          onChange={(listener) =>
            setConfig(updateHttpListener(config, selectedListener.id, () => listener))
          }
          onDelete={deleteSelectedListener}
        />
      ) : (
        <View style={styles.noticeCard}>
          <Text style={styles.muted}>请新增一个监听端口。</Text>
        </View>
      )}

      <View style={styles.requestActions}>
        <Button variant="outline" size="sm" leftIcon={Trash2} onPress={cleanupNow}>
          按策略立即清理
        </Button>
      </View>
      <HttpServiceRequestList
        jobs={jobs}
        loading={jobLoading}
        onRefresh={loadJobs}
        onDeleteMany={deleteMany}
      />
    </View>
  );
}

export function HttpServicePanel({
  active,
  serverId,
  plugin,
  appDefinition,
  initialProjectId,
}: {
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  appDefinition: PluginAppDefinition;
  initialProjectId?: string;
}) {
  return (
    <PluginProjectBoundary
      active={active}
      serverId={serverId}
      pluginId={plugin.pluginId}
      appDefinition={appDefinition}
      initialProjectId={initialProjectId}
    >
      {(project) => (
        <HttpServiceProjectConsole
          active={active}
          serverId={serverId}
          plugin={plugin}
          project={project}
        />
      )}
    </PluginProjectBoundary>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    gap: theme.spacing[6],
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  toolbarTitle: {
    flex: 1,
    minWidth: 240,
  },
  heading: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  noticeCard: {
    padding: theme.spacing[4],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  errorCard: {
    padding: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.destructive,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  listenerTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  listenerTab: {
    width: 230,
    gap: theme.spacing[1],
    padding: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
  },
  listenerTabSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
  },
  listenerTabHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  listenerTabTitle: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  listenerTabMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusRunning: { backgroundColor: theme.colors.success },
  statusError: { backgroundColor: theme.colors.destructive },
  statusStopped: { backgroundColor: theme.colors.foregroundMuted },
  requestActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
}));
