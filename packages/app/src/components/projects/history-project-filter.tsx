import { useMemo, type ReactElement } from "react";
import { FolderKanban } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import type { ProjectSummary } from "@/utils/projects";
import type { Theme } from "@/styles/theme";
import { ALL_PROJECTS_OPTION_ID } from "./history-project-filter-model";

const ThemedFolderKanban = withUnistyles(FolderKanban);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
export { ALL_PROJECTS_OPTION_ID } from "./history-project-filter-model";

const projectFilterLeading = <ThemedFolderKanban size={14} uniProps={mutedColorMapping} />;

export function HistoryProjectFilter({
  projects,
  selectedProject,
  onSelectProject,
  loading = false,
}: {
  projects: readonly ProjectSummary[];
  selectedProject: string;
  onSelectProject: (projectViewKey: string) => void;
  loading?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const options = useMemo<SelectFieldOption<string>[]>(
    () => [
      {
        id: ALL_PROJECTS_OPTION_ID,
        value: ALL_PROJECTS_OPTION_ID,
        label: t("sessions.projectFilter.all"),
      },
      ...projects.map((project) => ({
        id: project.viewKey,
        value: project.viewKey,
        label: project.projectName,
        description:
          project.hostCount > 1
            ? t("sessions.projectFilter.hostCount", { count: project.hostCount })
            : undefined,
      })),
    ],
    [projects, t],
  );
  const selectedDisplay = useMemo<SelectFieldDisplay | null>(() => {
    const selectedOption = options.find((option) => option.value === selectedProject) ?? options[0];
    return selectedOption
      ? { label: selectedOption.label, description: selectedOption.description }
      : null;
  }, [options, selectedProject]);

  return (
    <View style={styles.container}>
      <SelectField
        field={false}
        label={t("sessions.projectFilter.label")}
        value={selectedProject}
        selectedDisplay={selectedDisplay}
        options={options}
        onChange={onSelectProject}
        placeholder={t("sessions.projectFilter.all")}
        emptyText={t("sessions.projectFilter.empty")}
        searchPlaceholder={t("sessions.projectFilter.search")}
        title={t("sessions.projectFilter.title")}
        searchable
        loading={loading}
        size="sm"
        triggerLeading={projectFilterLeading}
        triggerTestID="sessions-project-filter-trigger"
      />
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  container: {
    width: {
      xs: 180,
      md: 240,
    },
    maxWidth: "100%",
  },
}));
