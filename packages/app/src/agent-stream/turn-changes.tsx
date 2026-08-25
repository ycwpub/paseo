import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { ChevronDown, ChevronUp, ExternalLink, FileDiff, Undo2 } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { DiffStat } from "@/components/diff-stat";
import type { ToastApi } from "@/components/toast-host";
import { useCheckoutGitActionsStore } from "@/git/actions-store";
import { useCheckoutDiffQuery, type ParsedDiffFile } from "@/git/use-diff-query";
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import type { StreamItem } from "@/types/stream";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  collectTurnChangedPaths,
  selectTurnChangedFiles,
  selectVisibleTurnChangedFiles,
  summarizeTurnChangedFiles,
} from "./turn-changes-model";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronUp = withUnistyles(ChevronUp);
const ThemedFileDiff = withUnistyles(FileDiff);
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface TurnChangesProps {
  serverId: string;
  cwd: string;
  isGit: boolean;
  readOnly: boolean;
  items: StreamItem[];
  toast: ToastApi | null;
  onOpen: (path: string) => void;
  onReview: (path?: string) => void;
}

interface TurnChangeRowProps {
  file: ParsedDiffFile;
  onOpen: (path: string) => void;
  onReview: (path: string) => void;
}

const TurnChangeRow = memo(function TurnChangeRow({ file, onOpen, onReview }: TurnChangeRowProps) {
  const { t } = useTranslation();
  const review = useCallback(() => onReview(file.path), [file.path, onReview]);
  const open = useCallback(() => onOpen(file.path), [file.path, onOpen]);
  const rowStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.fileRowMain,
      pressed ? styles.fileRowPressed : null,
    ],
    [],
  );

  return (
    <View style={styles.fileRow} testID={`turn-change-row-${file.path}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("agentStream.changes.reviewFile", { fileName: file.path })}
        onPress={review}
        style={rowStyle}
      >
        <Text numberOfLines={2} style={styles.path}>
          {file.path}
        </Text>
        <DiffStat additions={file.additions} deletions={file.deletions} />
      </Pressable>
      <Button
        size="xs"
        variant="ghost"
        leftIcon={ExternalLink}
        accessibilityLabel={t("agentStream.changes.openFile", { fileName: file.path })}
        testID={`turn-change-open-${file.path}`}
        onPress={open}
      />
    </View>
  );
});

export const TurnChanges = memo(function TurnChanges({
  serverId,
  cwd,
  isGit,
  readOnly,
  items,
  toast,
  onOpen,
  onReview,
}: TurnChangesProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { status } = useCheckoutStatusQuery({ serverId, cwd });
  const baseRef = status?.isGit ? (status.baseRef ?? undefined) : undefined;
  const { files: uncommittedFiles } = useCheckoutDiffQuery({
    serverId,
    cwd,
    mode: "uncommitted",
    enabled: isGit && Boolean(cwd),
    queryScope: "agent-turn-uncommitted-changes",
  });
  const explicitPaths = useMemo(() => collectTurnChangedPaths(items, cwd), [cwd, items]);
  const { files: baseFiles } = useCheckoutDiffQuery({
    serverId,
    cwd,
    mode: "base",
    baseRef,
    enabled: isGit && Boolean(cwd) && explicitPaths.size > 0,
    queryScope: "agent-turn-base-changes",
  });
  const turnFiles = useMemo(() => {
    const uncommittedTurnFiles = selectTurnChangedFiles({
      items,
      files: uncommittedFiles,
      cwd,
    });
    if (explicitPaths.size === 0) {
      return uncommittedTurnFiles;
    }
    const selectedPaths = new Set(uncommittedTurnFiles.map((file) => file.path));
    const committedTurnFiles = selectTurnChangedFiles({ items, files: baseFiles, cwd }).filter(
      (file) => !selectedPaths.has(file.path),
    );
    return [...uncommittedTurnFiles, ...committedTurnFiles];
  }, [baseFiles, cwd, explicitPaths.size, items, uncommittedFiles]);
  const revertablePaths = useMemo(
    () => new Set(uncommittedFiles.map((file) => file.path)),
    [uncommittedFiles],
  );
  const discardChanges = useCheckoutGitActionsStore((state) => state.discardChanges);
  const discardPending = useCheckoutGitActionsStore(
    (state) => state.statusByCheckout[`${serverId}::${cwd}`]?.["discard-changes"] === "pending",
  );
  const discardSupported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.checkoutDiscardChanges === true,
  );
  const summary = useMemo(() => summarizeTurnChangedFiles(turnFiles), [turnFiles]);
  const visibleFiles = useMemo(
    () => selectVisibleTurnChangedFiles(turnFiles, expanded),
    [expanded, turnFiles],
  );
  const hiddenFileCount = Math.max(0, turnFiles.length - visibleFiles.length);
  const canRevertTurn =
    !readOnly &&
    discardSupported &&
    turnFiles.length > 0 &&
    turnFiles.every((file) => revertablePaths.has(file.path));

  const revertTurn = useCallback(async () => {
    const paths = Array.from(
      new Set(
        turnFiles.flatMap((file) => (file.oldPath ? [file.path, file.oldPath] : [file.path])),
      ),
    );
    if (paths.length === 0) {
      return;
    }
    const confirmed = await confirmDialog({
      title: t("agentStream.changes.confirmUndoTitle"),
      message: t("agentStream.changes.confirmUndoMessage", { count: turnFiles.length }),
      confirmLabel: t("agentStream.changes.confirmUndo"),
      cancelLabel: t("workspace.fileActions.confirmRevert.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await discardChanges({
        serverId,
        cwd,
        paths,
      });
    } catch (cause) {
      toast?.error(
        cause instanceof Error ? cause.message : t("workspace.fileActions.confirmRevert.failed"),
      );
    }
  }, [cwd, discardChanges, serverId, t, toast, turnFiles]);
  const reviewTurn = useCallback(() => onReview(), [onReview]);
  const toggleExpanded = useCallback(() => setExpanded((current) => !current), []);
  const expandedAccessibilityState = useMemo(() => ({ expanded }), [expanded]);

  if (turnFiles.length === 0) {
    return null;
  }

  return (
    <View style={styles.card} testID="turn-changes">
      <View style={styles.header}>
        <View style={styles.summaryGroup}>
          <View style={styles.fileIcon}>
            <ThemedFileDiff size={20} uniProps={mutedIconMapping} />
          </View>
          <View style={styles.summaryText}>
            <Text style={styles.title}>
              {t("agentStream.changes.summary", { count: summary.fileCount })}
            </Text>
            <DiffStat additions={summary.additions} deletions={summary.deletions} />
          </View>
        </View>
        <View style={styles.actions}>
          {canRevertTurn ? (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={Undo2}
              disabled={discardPending}
              loading={discardPending}
              testID="turn-changes-undo"
              onPress={revertTurn}
            >
              {t("agentStream.changes.undo")}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" testID="turn-changes-review" onPress={reviewTurn}>
            {t("agentStream.changes.review")}
          </Button>
        </View>
      </View>
      <View style={styles.divider} />
      <View style={styles.files}>
        {visibleFiles.map((file) => (
          <TurnChangeRow key={file.path} file={file} onOpen={onOpen} onReview={onReview} />
        ))}
      </View>
      {hiddenFileCount > 0 || expanded ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={expandedAccessibilityState}
          onPress={toggleExpanded}
          style={styles.expandButton}
          testID="turn-changes-expand"
        >
          <Text style={styles.expandText}>
            {expanded
              ? t("agentStream.changes.showLess")
              : t("agentStream.changes.showMore", { count: hiddenFileCount })}
          </Text>
          {expanded ? (
            <ThemedChevronUp size={16} uniProps={mutedIconMapping} />
          ) : (
            <ThemedChevronDown size={16} uniProps={mutedIconMapping} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  card: {
    width: "100%",
    overflow: "hidden",
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    paddingBottom: theme.spacing[6],
  },
  header: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  summaryGroup: {
    minWidth: 180,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  fileIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
  },
  summaryText: {
    minWidth: 0,
    flex: 1,
    gap: theme.spacing[1],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  divider: {
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
  },
  files: {
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
  },
  fileRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
  },
  fileRowMain: {
    minWidth: 0,
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  fileRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  path: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  expandButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[1],
    paddingVertical: theme.spacing[1],
  },
  expandText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
}));
