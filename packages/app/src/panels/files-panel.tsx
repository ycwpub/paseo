import { Files } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { useCallback } from "react";
import invariant from "tiny-invariant";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel, type PanelPresentation } from "@/panels/panel-registry";
import { useAddFileToChat } from "@/panels/use-add-file-to-chat";
import { FilesPanelDirectoryBrowser } from "./files-panel-directory-browser";

const ThemedFiles = withUnistyles(Files);
const filesPanelPresentation = {
  label: (t) => t("panels.files.label"),
  subtitle: (t) => t("panels.files.subtitle"),
  tooltip: (t) => t("panels.files.tooltip"),
  icon: ThemedFiles,
} satisfies PanelPresentation;

function FilesPanel() {
  const { serverId, workspaceId, target, openPreferredTarget, openTargetToSide } = usePaneContext();
  const { addFile, canAddToChat } = useAddFileToChat({ serverId, workspaceId });
  invariant(target.kind === "files", "FilesPanel requires files target");
  const onOpenFile = useCallback(
    (path: string) => openPreferredTarget({ kind: "file", path }, "explorerFiles"),
    [openPreferredTarget],
  );
  const onOpenFileToSide = useCallback(
    (path: string) => openTargetToSide?.({ kind: "file", path }),
    [openTargetToSide],
  );
  return (
    <FilesPanelDirectoryBrowser
      serverId={serverId}
      workspaceId={workspaceId}
      onOpenFile={onOpenFile}
      onOpenFileToSide={openTargetToSide ? onOpenFileToSide : undefined}
      onAddToChat={canAddToChat ? addFile : undefined}
    />
  );
}

export const filesPanelRegistration = definePanel("files", {
  component: FilesPanel,
  presentation: filesPanelPresentation,
});
