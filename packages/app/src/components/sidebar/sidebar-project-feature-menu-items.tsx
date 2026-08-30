import { useCallback, type ComponentProps, type PropsWithChildren } from "react";
import { FolderPlus, Puzzle } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useHostFeature } from "@/runtime/host-features";
import { useAddProjectFlowStore } from "@/stores/add-project-flow-store";
import type { Theme } from "@/styles/theme";
import { useSidebarProjectPluginLink } from "./sidebar-project-plugin-link";

type ProjectMenuSurface = "context" | "dropdown";

const ThemedFolderPlus = withUnistyles(FolderPlus);
const ThemedPuzzle = withUnistyles(Puzzle);

const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

const createChildProjectLeadingIcon = (
  <ThemedFolderPlus size={14} uniProps={foregroundMutedColorMapping} />
);
const openPluginProjectLeadingIcon = (
  <ThemedPuzzle size={14} uniProps={foregroundMutedColorMapping} />
);

function FeatureProjectMenuItem({
  surface,
  children,
  ...props
}: PropsWithChildren<
  Omit<ComponentProps<typeof DropdownMenuItem>, "children"> & { surface: ProjectMenuSurface }
>) {
  if (surface === "context") {
    return <ContextMenuItem {...props}>{children}</ContextMenuItem>;
  }
  return <DropdownMenuItem {...props}>{children}</DropdownMenuItem>;
}

export function SidebarProjectFeatureMenuItems({
  active,
  projectViewKey,
  settingsTarget,
  surface,
}: {
  active: boolean;
  projectViewKey: string;
  settingsTarget: { serverId: string; projectId: string } | null;
  surface: ProjectMenuSurface;
}) {
  const supportsProjectHierarchy = useHostFeature(
    settingsTarget?.serverId ?? "",
    "projectHierarchy",
  );
  const openAddProject = useAddProjectFlowStore((state) => state.openRequest);
  const pluginLink = useSidebarProjectPluginLink({
    active: active && settingsTarget !== null,
    serverId: settingsTarget?.serverId ?? "",
    projectId: settingsTarget?.projectId ?? "",
  });
  const handleCreateChildProject = useCallback(() => {
    if (!settingsTarget) return;
    openAddProject({
      preferredHostId: settingsTarget.serverId,
      parentProjectId: settingsTarget.projectId,
    });
  }, [openAddProject, settingsTarget]);

  return (
    <>
      {settingsTarget && supportsProjectHierarchy ? (
        <FeatureProjectMenuItem
          surface={surface}
          testID={`sidebar-project-menu-create-child-${projectViewKey}`}
          leading={createChildProjectLeadingIcon}
          onSelect={handleCreateChildProject}
        >
          创建子 Project
        </FeatureProjectMenuItem>
      ) : null}
      {pluginLink.link ? (
        <FeatureProjectMenuItem
          surface={surface}
          testID={`sidebar-project-menu-open-plugin-${projectViewKey}`}
          leading={openPluginProjectLeadingIcon}
          onSelect={pluginLink.open}
        >
          跳转到插件项目
        </FeatureProjectMenuItem>
      ) : null}
    </>
  );
}
