import { Eye, EyeOff } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { withUnistyles } from "react-native-unistyles";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { Theme } from "@/styles/theme";

const ThemedEye = withUnistyles(Eye);
const ThemedEyeOff = withUnistyles(EyeOff);
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const showProjectLeadingIcon = <ThemedEye size={14} uniProps={foregroundMutedColorMapping} />;
const hideProjectLeadingIcon = <ThemedEyeOff size={14} uniProps={foregroundMutedColorMapping} />;

export function SidebarProjectVisibilityMenuItem({
  surface,
  projectViewKey,
  hidden,
  onToggleHidden,
}: {
  surface: "context" | "dropdown";
  projectViewKey: string;
  hidden: boolean;
  onToggleHidden: () => void;
}) {
  const { t } = useTranslation();
  const Item = surface === "context" ? ContextMenuItem : DropdownMenuItem;

  return (
    <Item
      testID={`sidebar-project-menu-${hidden ? "show" : "hide"}-${projectViewKey}`}
      leading={hidden ? showProjectLeadingIcon : hideProjectLeadingIcon}
      onSelect={onToggleHidden}
    >
      {t(hidden ? "sidebar.project.actions.show" : "sidebar.project.actions.hide")}
    </Item>
  );
}
