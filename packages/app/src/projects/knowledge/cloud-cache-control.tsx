import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StyleSheet } from "react-native-unistyles";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useFetchQuery } from "@/data/query";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";

export interface CloudKnowledgeCacheTarget {
  serverId: string;
  scope: "global" | "project" | "assistant";
  projectId?: string;
  assistantId?: string;
}

function isCloudDocumentSource(source: string): boolean {
  return /^https?:\/\//u.test(source);
}

function cacheStatusText(status: {
  cached: boolean;
  stale: boolean;
  cachedAt: string | null;
}): string {
  if (!status.cached) return "尚未缓存";
  const label = status.stale ? "已有旧缓存" : "已缓存";
  return status.cachedAt ? `${label} · ${new Date(status.cachedAt).toLocaleString()}` : label;
}

function cacheButtonText(status: { cached: boolean } | null | undefined): string {
  return status?.cached ? "刷新缓存" : "缓存到本地";
}

function cacheLocalPath(status: { localPath: string | null } | null | undefined): string | null {
  return status?.localPath ?? null;
}

function CloudKnowledgeCachePath({
  localPath,
  loading,
}: {
  localPath: string | null | undefined;
  loading: boolean;
}) {
  let pathText = localPath;
  if (!pathText) {
    pathText = loading ? "正在获取缓存文件路径…" : "暂未获取到缓存文件路径";
  }
  return (
    <View style={styles.pathRow} testID="cloud-knowledge-cache-path">
      <Text style={styles.pathLabel}>缓存文件路径</Text>
      <Text selectable style={styles.pathText}>
        {pathText}
      </Text>
    </View>
  );
}

export function CloudKnowledgeCacheControl({
  target,
  source,
}: {
  target: CloudKnowledgeCacheTarget;
  source: string;
}) {
  const client = useHostRuntimeClient(target.serverId);
  const supported = useHostFeature(target.serverId, "cloudKnowledgeCache");
  const queryClient = useQueryClient();
  const trimmedSource = source.trim();
  const queryKey = [
    "cloud-knowledge-cache",
    target.serverId,
    target.scope,
    target.projectId ?? "",
    target.assistantId ?? "",
    trimmedSource,
  ] as const;
  const validSource = isCloudDocumentSource(trimmedSource);
  const statusQuery = useFetchQuery({
    queryKey,
    enabled: supported && Boolean(client) && validSource,
    dataShape: "value",
    staleTimeMs: 30_000,
    queryFn: async () => {
      if (!client) throw new Error("Daemon 未连接");
      const result = await client.getCloudDocumentCacheStatus({
        scope: target.scope,
        projectId: target.projectId,
        assistantId: target.assistantId,
        source: trimmedSource,
      });
      if (result.error) throw new Error(result.error);
      return result.status;
    },
  });
  const cacheMutation = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("Daemon 未连接");
      const result = await client.cacheCloudDocument({
        scope: target.scope,
        projectId: target.projectId,
        assistantId: target.assistantId,
        source: trimmedSource,
        force: true,
      });
      if (result.error) throw new Error(result.error);
      return result.status;
    },
    onSuccess: (status) => {
      queryClient.setQueryData(queryKey, status);
    },
  });
  const cache = useCallback(() => {
    if (!cacheMutation.isPending) cacheMutation.mutate();
  }, [cacheMutation]);

  if (!supported || !validSource) return null;
  const status = cacheMutation.data ?? statusQuery.data;
  const error =
    cacheMutation.error instanceof Error
      ? cacheMutation.error.message
      : (status?.authIssue?.message ?? status?.error ?? null);
  const statusText = status ? cacheStatusText(status) : "尚未缓存";

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <Pressable
          accessibilityLabel="强制缓存云文档"
          disabled={cacheMutation.isPending}
          onPress={cache}
          style={styles.button}
        >
          {cacheMutation.isPending ? (
            <LoadingSpinner size="small" color={styles.buttonText.color} />
          ) : (
            <RefreshCw size={13} color={styles.buttonText.color} />
          )}
          <Text style={styles.buttonText}>{cacheButtonText(status)}</Text>
        </Pressable>
        <Text style={error ? styles.errorText : styles.statusText} numberOfLines={2}>
          {error ?? statusText}
        </Text>
      </View>
      <CloudKnowledgeCachePath localPath={cacheLocalPath(status)} loading={statusQuery.isLoading} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    width: "100%",
    paddingLeft: 152,
    gap: theme.spacing[2],
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  button: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
  },
  buttonText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
  statusText: {
    flex: 1,
    minWidth: 160,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  errorText: {
    flex: 1,
    minWidth: 160,
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
  },
  pathRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  pathLabel: {
    flexShrink: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  pathText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
  },
}));
