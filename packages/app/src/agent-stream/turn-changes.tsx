import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { FileText } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import type { ToastApi } from "@/components/toast-host";
import { useCheckoutGitActionsStore } from "@/git/actions-store";
import { useCheckoutDiffQuery, type ParsedDiffFile } from "@/git/use-diff-query";
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import { useSessionStore } from "@/stores/session-store";
import type { StreamItem } from "@/types/stream";
import { confirmDialog } from "@/utils/confirm-dialog";
import { collectTurnChangedPaths, selectTurnChangedFiles } from "./turn-changes-model";

function fileName(path: string): string {
  return path.replaceAll("\\", "/").split("/").at(-1) ?? path;
}

function changeLabelKey(
  file: ParsedDiffFile,
): "agentStream.changes.added" | "agentStream.changes.deleted" | "agentStream.changes.edited" {
  if (file.isNew) {
    return "agentStream.changes.added";
  }
  if (file.isDeleted) {
    return "agentStream.changes.deleted";
  }
  return "agentStream.changes.edited";
}

interface TurnChangesProps {
  serverId: string;
  cwd: string;
  isGit: boolean;
  readOnly: boolean;
  items: StreamItem[];
  toast: ToastApi | null;
  onOpen: (path: string) => void;
  onReview: (path: string) => void;
}

interface TurnChangeRowProps {
  file: ParsedDiffFile;
  canRevert: boolean;
  discardPending: boolean;
  onRevert: (file: ParsedDiffFile) => void;
  onOpen: (path: string) => void;
  onReview: (path: string) => void;
}

const TurnChangeRow = memo(function TurnChangeRow({
  file,
  canRevert,
  discardPending,
  onRevert,
  onOpen,
  onReview,
}: TurnChangeRowProps) {
  const { t } = useTranslation();
  const revert = useCallback(() => onRevert(file), [file, onRevert]);
  const review = useCallback(() => onReview(file.path), [file.path, onReview]);
  const open = useCallback(() => onOpen(file.path), [file.path, onOpen]);

  return (
    <View style={styles.card}>
      <View style={styles.fileIcon}>
        <FileText size={20} color={styles.fileIconGlyph.color} />
      </View>
      <View style={styles.fileContent}>
        <Text numberOfLines={1} style={styles.title}>
          {t(changeLabelKey(file), { fileName: fileName(file.path) })}
        </Text>
        <View style={styles.stats}>
          <Text style={styles.additions}>+{file.additions}</Text>
          <Text style={styles.deletions}>-{file.deletions}</Text>
          <Text numberOfLines={1} style={styles.path}>
            {file.path}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        {canRevert ? (
          <Button
            size="xs"
            variant="ghost"
            disabled={discardPending}
            loading={discardPending}
            onPress={revert}
          >
            {t("agentStream.changes.undo")}
          </Button>
        ) : null}
        <Button size="xs" variant="outline" onPress={review}>
          {t("agentStream.changes.review")}
        </Button>
        <Button size="xs" variant="ghost" onPress={open}>
          {t("agentStream.changes.open")}
        </Button>
      </View>
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

  const revertFile = useCallback(
    async (file: ParsedDiffFile) => {
      const confirmed = await confirmDialog({
        title: t("workspace.fileActions.confirmRevert.title"),
        message: t("workspace.fileActions.confirmRevert.message", { name: file.path }),
        confirmLabel: t("workspace.fileActions.confirmRevert.confirm"),
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
          paths: file.oldPath ? [file.path, file.oldPath] : [file.path],
        });
      } catch (cause) {
        toast?.error(
          cause instanceof Error ? cause.message : t("workspace.fileActions.confirmRevert.failed"),
        );
      }
    },
    [cwd, discardChanges, serverId, t, toast],
  );

  if (turnFiles.length === 0) {
    return null;
  }

  return (
    <View style={styles.list} testID="turn-changes">
      {turnFiles.map((file) => (
        <TurnChangeRow
          key={file.path}
          file={file}
          canRevert={!readOnly && discardSupported && revertablePaths.has(file.path)}
          discardPending={discardPending}
          onRevert={revertFile}
          onOpen={onOpen}
          onReview={onReview}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  list: {
    width: "100%",
    gap: theme.spacing[2],
    paddingBottom: theme.spacing[6],
  },
  card: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
  },
  fileIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
  },
  fileIconGlyph: {
    color: theme.colors.foregroundMuted,
  },
  fileContent: {
    minWidth: 0,
    flex: 1,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  stats: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    marginTop: theme.spacing[1],
  },
  additions: {
    color: theme.colors.palette.green[500],
    fontSize: theme.fontSize.xs,
    fontVariant: ["tabular-nums"],
  },
  deletions: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
    fontVariant: ["tabular-nums"],
  },
  path: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
}));
