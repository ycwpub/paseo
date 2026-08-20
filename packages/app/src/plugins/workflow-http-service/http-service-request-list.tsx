/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- Request rows bind selection and expansion to the current persisted job. */
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CheckSquare2, RefreshCw, Square, Trash2 } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { PluginHttpJob } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/styles/theme";
import { canDeleteHttpJob } from "./http-service-model";

const ThemedSquare = withUnistyles(Square);
const ThemedCheckSquare = withUnistyles(CheckSquare2);
const mutedIcon = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const accentIcon = (theme: Theme) => ({ color: theme.colors.accent });

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return "暂无";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function HttpServiceRequestList({
  jobs,
  loading,
  onRefresh,
  onDeleteMany,
}: {
  jobs: PluginHttpJob[];
  loading: boolean;
  onRefresh: () => void;
  onDeleteMany: (ids: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const deletableSelected = useMemo(
    () =>
      selected.filter((id) => {
        const job = jobs.find((entry) => entry.id === id);
        return job ? canDeleteHttpJob(job.status) : false;
      }),
    [jobs, selected],
  );
  const toggleSelected = useCallback((id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }, []);
  const handleDelete = useCallback(async () => {
    if (deletableSelected.length === 0) return;
    await onDeleteMany(deletableSelected);
    setSelected((current) => current.filter((id) => !deletableSelected.includes(id)));
  }, [deletableSelected, onDeleteMany]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>请求记录</Text>
          <Text style={styles.subtitle}>请求先落盘，再异步执行 Workflow；运行中请求不可删除。</Text>
        </View>
        <Button
          variant="outline"
          size="sm"
          leftIcon={RefreshCw}
          loading={loading}
          onPress={onRefresh}
        >
          刷新
        </Button>
        <Button
          variant="destructive"
          size="sm"
          leftIcon={Trash2}
          disabled={deletableSelected.length === 0}
          onPress={handleDelete}
        >
          批量删除 ({deletableSelected.length})
        </Button>
      </View>
      {jobs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>暂无请求记录</Text>
        </View>
      ) : (
        jobs.map((job) => {
          const checked = selected.includes(job.id);
          const expanded = expandedId === job.id;
          return (
            <View key={job.id} style={styles.jobCard}>
              <View style={styles.jobRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  onPress={() => toggleSelected(job.id)}
                  hitSlop={8}
                >
                  {checked ? (
                    <ThemedCheckSquare size={18} uniProps={accentIcon} />
                  ) : (
                    <ThemedSquare size={18} uniProps={mutedIcon} />
                  )}
                </Pressable>
                <Pressable
                  style={styles.jobSummary}
                  onPress={() => setExpandedId(expanded ? null : job.id)}
                >
                  <View style={styles.jobTitleRow}>
                    <Text style={styles.jobId}>{job.id}</Text>
                    <Text style={[styles.status, styles[`status_${job.status}`]]}>
                      {job.status}
                    </Text>
                  </View>
                  <Text style={styles.metadata}>
                    {job.listenerId ?? "legacy"} / {job.routeId ?? job.serviceName} ·{" "}
                    {new Date(job.createdAt).toLocaleString()}
                  </Text>
                </Pressable>
              </View>
              {expanded ? (
                <View style={styles.details}>
                  <Text style={styles.detailLabel}>输入</Text>
                  <Text selectable style={styles.code}>
                    {prettyJson(job.input)}
                  </Text>
                  <Text style={styles.detailLabel}>输出</Text>
                  <Text selectable style={styles.code}>
                    {prettyJson(job.result)}
                  </Text>
                  {job.error ? (
                    <>
                      <Text style={styles.detailLabel}>错误</Text>
                      <Text selectable style={styles.errorText}>
                        {job.errorCode ? `${job.errorCode}: ` : ""}
                        {job.error}
                      </Text>
                    </>
                  ) : null}
                  <Text style={styles.metadata}>
                    Workflow Run ID: {job.workflowRunId ?? "暂无"} · 开始：
                    {job.startedAt ? new Date(job.startedAt).toLocaleString() : "未开始"} · 结束：
                    {job.endedAt ? new Date(job.endedAt).toLocaleString() : "未结束"}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[3],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  titleGroup: {
    flex: 1,
    minWidth: 220,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  subtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  empty: {
    padding: theme.spacing[6],
    alignItems: "center",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
  },
  jobCard: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    overflow: "hidden",
  },
  jobRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[3],
  },
  jobSummary: {
    flex: 1,
    minWidth: 0,
  },
  jobTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  jobId: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontFamily: "monospace",
  },
  metadata: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 3,
  },
  status: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  status_draft: { color: theme.colors.foregroundMuted },
  status_queued: { color: theme.colors.foregroundMuted },
  status_running: { color: theme.colors.accent },
  status_succeeded: { color: theme.colors.success },
  status_failed: { color: theme.colors.destructive },
  status_cancelled: { color: theme.colors.foregroundMuted },
  status_timed_out: { color: theme.colors.destructive },
  details: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  detailLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  code: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontFamily: "monospace",
    lineHeight: 18,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
