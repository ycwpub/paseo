import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { ScrollableCodeSurface, SurfaceCard } from "@/components/ui/scrollable-code-surface";
import { StatusBadge } from "@/components/ui/status-badge";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useFetchQuery } from "@/data/query";
import { useSessionStore } from "@/stores/session-store";
import { formatCadence, resolveScheduleTitle } from "@/utils/schedule-format";
import type { AggregatedSchedule } from "@/hooks/use-schedules";
import type { ScheduleRun, ScheduleRunConfigSnapshot } from "@getpaseo/protocol/schedule/types";

interface ScheduleRunHistorySheetProps {
  visible: boolean;
  serverId: string | null;
  schedule: AggregatedSchedule | null;
  onClose: () => void;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatRunDuration(run: ScheduleRun): string {
  if (!run.endedAt) {
    return "Running";
  }
  const started = Date.parse(run.startedAt);
  const ended = Date.parse(run.endedAt);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) {
    return "—";
  }
  const seconds = Math.round((ended - started) / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function runStatusVariant(status: ScheduleRun["status"]): "success" | "error" | "muted" {
  switch (status) {
    case "succeeded":
      return "success";
    case "failed":
      return "error";
    case "running":
      return "muted";
  }
}

function formatTarget(snapshot: ScheduleRunConfigSnapshot): string {
  if (snapshot.target.type === "bash") {
    return `Bash · ${snapshot.target.config.cwd}`;
  }
  if (snapshot.target.type === "agent") {
    return `Agent · ${snapshot.target.agentId}`;
  }
  const modelSuffix = snapshot.target.config.model ? `/${snapshot.target.config.model}` : "";
  const assistantSuffix = snapshot.target.config.assistantId
    ? ` · assistant:${snapshot.target.config.assistantId}`
    : "";
  return `New agent · ${snapshot.target.config.provider}${modelSuffix}${assistantSuffix} · ${snapshot.target.config.cwd}`;
}

function resolveRunSnapshot(run: ScheduleRun): ScheduleRunConfigSnapshot | null {
  return run.configSnapshot ?? null;
}

function formatSnapshotSummary(snapshot: ScheduleRunConfigSnapshot | null): string {
  if (!snapshot) {
    return "No config snapshot (legacy run)";
  }
  const parts = [formatCadence(snapshot.cadence), formatTarget(snapshot)];
  if (snapshot.maxRuns !== null) {
    parts.push(`maxRuns ${snapshot.maxRuns}`);
  }
  if (snapshot.expiresAt !== null) {
    parts.push(`expires ${formatDateTime(snapshot.expiresAt)}`);
  }
  return parts.join(" · ");
}

function snapshotJson(snapshot: ScheduleRunConfigSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

function getRunOutput(run: ScheduleRun): string | null {
  if (run.error && run.output) {
    return `Error:\n${run.error}\n\nOutput:\n${run.output}`;
  }
  if (run.error) {
    return `Error:\n${run.error}`;
  }
  return run.output;
}

function sortRunsByRunTime(runs: readonly ScheduleRun[]): ScheduleRun[] {
  return [...runs].sort((left, right) => {
    const rightTime = Date.parse(right.startedAt || right.scheduledFor);
    const leftTime = Date.parse(left.startedAt || left.scheduledFor);
    return (
      (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
    );
  });
}

function ScheduleRunDetails({
  run,
  snapshot,
}: {
  run: ScheduleRun;
  snapshot: ScheduleRunConfigSnapshot | null;
}): ReactElement {
  const output = getRunOutput(run);
  return (
    <View style={styles.runDetails} testID={`schedule-run-details-${run.id}`}>
      <View style={styles.metaGrid}>
        <RunMeta label="Scheduled" value={formatDateTime(run.scheduledFor)} />
        <RunMeta label="Started" value={formatDateTime(run.startedAt)} />
        <RunMeta label="Ended" value={formatDateTime(run.endedAt)} />
        <RunMeta label="Duration" value={formatRunDuration(run)} />
        <RunMeta label="Agent" value={run.agentId ?? "—"} />
        <RunMeta label="Workspace" value={run.workspaceId ?? "—"} />
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>配置快照</Text>
        {snapshot ? (
          <ScrollableCodeSurface maxHeight={180} testID={`schedule-run-config-${run.id}`}>
            {snapshotJson(snapshot)}
          </ScrollableCodeSurface>
        ) : (
          <Text style={styles.snapshotUnavailable} testID={`schedule-run-config-missing-${run.id}`}>
            该旧运行记录没有保存配置快照。
          </Text>
        )}
      </View>
      {output ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>输出</Text>
          <ScrollableCodeSurface maxHeight={220} testID={`schedule-run-output-${run.id}`}>
            {output}
          </ScrollableCodeSurface>
        </View>
      ) : null}
    </View>
  );
}

function ScheduleRunCard({
  run,
  expanded,
  onToggleRun,
}: {
  run: ScheduleRun;
  expanded: boolean;
  onToggleRun: (runId: string) => void;
}): ReactElement {
  const snapshot = resolveRunSnapshot(run);
  const handleToggle = useCallback(() => {
    onToggleRun(run.id);
  }, [onToggleRun, run.id]);
  return (
    <SurfaceCard tone="surface1" style={styles.runCard} testID={`schedule-run-${run.id}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View run ${run.id}`}
        onPress={handleToggle}
        style={styles.runSummary}
      >
        <View style={styles.runHeader}>
          <View style={styles.runTitleGroup}>
            <Text style={styles.runTitle} numberOfLines={1} selectable>
              {formatDateTime(run.startedAt)}
            </Text>
            <Text style={styles.runMeta} numberOfLines={2}>
              {formatSnapshotSummary(snapshot)}
            </Text>
          </View>
          <StatusBadge label={run.status} variant={runStatusVariant(run.status)} />
        </View>
        <View style={styles.summaryMetaRow}>
          <Text style={styles.summaryMeta} numberOfLines={1}>
            Duration {formatRunDuration(run)}
          </Text>
          <Text style={styles.summaryMeta} numberOfLines={1}>
            {run.agentId ? `Agent ${run.agentId.slice(0, 8)}` : "No agent"}
          </Text>
        </View>
      </Pressable>
      {expanded ? <ScheduleRunDetails run={run} snapshot={snapshot} /> : null}
    </SurfaceCard>
  );
}

function RunMeta({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={2} selectable>
        {value}
      </Text>
    </View>
  );
}

export function ScheduleRunHistorySheet({
  visible,
  serverId,
  schedule,
  onClose,
}: ScheduleRunHistorySheetProps): ReactElement {
  const scheduleId = schedule?.id ?? null;
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const query = useFetchQuery({
    queryKey: ["schedule-runs", serverId, scheduleId],
    queryFn: async () => {
      if (!serverId || !scheduleId) {
        return [];
      }
      const client = useSessionStore.getState().sessions[serverId]?.client ?? null;
      if (!client) {
        throw new Error("Daemon client unavailable");
      }
      const payload = await client.scheduleLogs({ id: scheduleId });
      if (payload.error) {
        throw new Error(payload.error);
      }
      return payload.runs;
    },
    enabled: visible && serverId !== null && scheduleId !== null,
    dataShape: "list",
    staleTimeMs: 1_000,
  });
  const runs = useMemo(() => sortRunsByRunTime(query.data ?? []), [query.data]);
  useEffect(() => {
    setExpandedRunId(null);
  }, [scheduleId, visible]);
  const header = useMemo(
    () => ({
      title: "运行历史",
      subtitle: schedule ? (
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {resolveScheduleTitle(schedule)} · {schedule.serverName}
        </Text>
      ) : undefined,
    }),
    [schedule],
  );

  const handleRetry = useCallback(() => {
    void query.refetch();
  }, [query]);

  const toggleRun = useCallback((runId: string) => {
    setExpandedRunId((current) => (current === runId ? null : runId));
  }, []);

  let content: ReactElement;
  if (query.isLoading) {
    content = (
      <View style={styles.centered}>
        <LoadingSpinner size="large" color={styles.spinner.color} />
        <Text style={styles.message}>正在加载运行历史…</Text>
      </View>
    );
  } else if (query.isError) {
    content = (
      <View style={styles.centered}>
        <Text style={styles.message}>加载运行历史失败</Text>
        <Text style={styles.errorText}>{query.error.message}</Text>
        <Button variant="ghost" onPress={handleRetry}>
          重试
        </Button>
      </View>
    );
  } else if (!schedule || runs.length === 0) {
    content = (
      <View style={styles.centered}>
        <Text style={styles.message}>暂无历史运行记录</Text>
      </View>
    );
  } else {
    content = (
      <View style={styles.runList}>
        {runs.map((run) => (
          <ScheduleRunCard
            key={run.id}
            run={run}
            expanded={expandedRunId === run.id}
            onToggleRun={toggleRun}
          />
        ))}
      </View>
    );
  }

  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      header={header}
      snapPoints={["75%", "92%"]}
      desktopMaxWidth={760}
      testID="schedule-run-history-sheet"
    >
      {content}
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  headerSubtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    minHeight: 180,
  },
  message: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  errorText: {
    color: theme.colors.palette.red[500],
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  runList: {
    gap: theme.spacing[4],
  },
  runCard: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  runSummary: {
    gap: theme.spacing[3],
  },
  runDetails: {
    gap: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing[4],
  },
  runHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  runTitleGroup: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  runTitle: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  runMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  summaryMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  summaryMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  metaItem: {
    minWidth: 160,
    flex: 1,
    gap: theme.spacing[1],
  },
  metaLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  metaValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  section: {
    gap: theme.spacing[2],
  },
  snapshotUnavailable: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  sectionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  spinner: {
    color: theme.colors.foregroundMuted,
  },
}));
