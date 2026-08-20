import { useMemo, useState, useCallback, useEffect, type ReactElement } from "react";
import { View, Text } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ChevronLeft } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { MenuHeader } from "@/components/headers/menu-header";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AgentList } from "@/components/agent-list";
import { SearchField } from "@/components/ui/search-field";
import { HostFilter } from "@/components/hosts/host-filter";
import { ALL_HOSTS_OPTION_ID } from "@/components/hosts/host-picker";
import { HistoryProjectFilter } from "@/components/projects/history-project-filter";
import {
  ALL_PROJECTS_OPTION_ID,
  filterHistoryProjects,
  resolveHistoryProjectKeysByServerId,
} from "@/components/projects/history-project-filter-model";
import { type AgentHistoryHostError, useAgentHistory } from "@/hooks/use-agent-history";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useProjects } from "@/hooks/use-projects";
import { useHosts } from "@/runtime/host-runtime";
import { buildOpenProjectRoute } from "@/utils/host-routes";

/** Long enough that a typed word is one request, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 200;

const sessionsHostOptionTestID = (serverId: string) => `sessions-host-filter-item-${serverId}`;

/**
 * A host that failed while others answered. Without this the list silently
 * under-reports, and under a query "No sessions match" becomes a claim the app
 * has no basis for.
 */
function SessionHostErrorsBanner({
  errors,
  t,
}: {
  errors: AgentHistoryHostError[];
  t: TFunction;
}): ReactElement {
  return (
    <View style={styles.errorsBannerWrap}>
      <View style={styles.errorsBanner} testID="sessions-host-errors">
        {errors.map((error) => (
          <Text key={error.serverId} style={styles.errorsBannerText}>
            {t("sessions.hostLoadFailed", { host: error.serverName })}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** An empty list means something different once a query is narrowing it. */
function resolveEmptyText(input: {
  t: TFunction;
  isSearching: boolean;
  isAllHosts: boolean;
  isProjectFiltered: boolean;
}): string {
  if (input.isSearching) return input.t("sessions.noMatches");
  if (input.isProjectFiltered) return input.t("sessions.noProjectSessions");
  if (input.isAllHosts) return input.t("sessions.empty");
  return "此主机暂无会话";
}

function SessionsFilterRow({
  isSearchSupported,
  searchInput,
  onChangeSearch,
  hosts,
  showHostFilter,
  selectedHost,
  onSelectHost,
  showProjectFilter,
  projects,
  selectedProject,
  onSelectProject,
  projectsLoading,
  t,
}: {
  isSearchSupported: boolean;
  searchInput: string;
  onChangeSearch: (value: string) => void;
  hosts: ReturnType<typeof useHosts>;
  showHostFilter: boolean;
  selectedHost: string;
  onSelectHost: (serverId: string) => void;
  showProjectFilter: boolean;
  projects: ReturnType<typeof useProjects>["projects"];
  selectedProject: string;
  onSelectProject: (projectViewKey: string) => void;
  projectsLoading: boolean;
  t: TFunction;
}): ReactElement {
  return (
    <View style={styles.filterContainer}>
      {isSearchSupported ? (
        <SearchField
          value={searchInput}
          onChangeText={onChangeSearch}
          placeholder={t("sessions.searchPlaceholder")}
          clearAccessibilityLabel={t("sessions.actions.clearSearch")}
          testID="sessions-search-input"
          clearTestID="sessions-search-clear"
        />
      ) : null}
      {showHostFilter ? (
        <HostFilter
          hosts={hosts}
          selectedHost={selectedHost}
          onSelectHost={onSelectHost}
          triggerTestID="sessions-host-filter-trigger"
          hostOptionTestID={sessionsHostOptionTestID}
        />
      ) : null}
      {showProjectFilter ? (
        <HistoryProjectFilter
          projects={projects}
          selectedProject={selectedProject}
          onSelectProject={onSelectProject}
          loading={projectsLoading}
        />
      ) : null}
    </View>
  );
}

export function SessionsScreen() {
  const isFocused = useIsFocused();

  if (!isFocused) {
    return <View style={styles.container} />;
  }

  return <SessionsScreenContent />;
}

function SessionsScreenContent() {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const hosts = useHosts();
  const { projects, isLoading: projectsLoading } = useProjects();
  const [selectedHost, setSelectedHost] = useState(ALL_HOSTS_OPTION_ID);
  const [selectedProject, setSelectedProject] = useState(ALL_PROJECTS_OPTION_ID);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS).trim();
  const historyServerId = selectedHost === ALL_HOSTS_OPTION_ID ? null : selectedHost;
  const availableProjects = useMemo(
    () => filterHistoryProjects(projects, historyServerId),
    [historyServerId, projects],
  );
  const selectedProjectSummary = useMemo(
    () => availableProjects.find((project) => project.viewKey === selectedProject),
    [availableProjects, selectedProject],
  );
  const projectKeysByServerId = useMemo(
    () => resolveHistoryProjectKeysByServerId(selectedProjectSummary, historyServerId),
    [historyServerId, selectedProjectSummary],
  );
  const {
    agents,
    hasMore,
    isInitialLoad,
    isLoadingMore,
    isError,
    isSearchSupported,
    isSearchTruncated,
    searchMatchesByAgentKey,
    hostErrors,
    loadMore,
    refreshAll,
  } = useAgentHistory({
    serverId: historyServerId,
    search,
    projectKeysByServerId,
  });
  const isSearching = isSearchSupported && search.length > 0;

  useEffect(() => {
    if (
      selectedHost !== ALL_HOSTS_OPTION_ID &&
      !hosts.some((host) => host.serverId === selectedHost)
    ) {
      setSelectedHost(ALL_HOSTS_OPTION_ID);
    }
  }, [hosts, selectedHost]);

  useEffect(() => {
    if (
      selectedProject !== ALL_PROJECTS_OPTION_ID &&
      !availableProjects.some((project) => project.viewKey === selectedProject)
    ) {
      setSelectedProject(ALL_PROJECTS_OPTION_ID);
    }
  }, [availableProjects, selectedProject]);

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsManualRefresh(true);
    void refreshAll().finally(() => setIsManualRefresh(false));
  }, [refreshAll]);

  // `useAgentHistory` owns the order: recency at rest, relevance under a query.
  const emptyText = resolveEmptyText({
    t,
    isSearching,
    isAllHosts: selectedHost === ALL_HOSTS_OPTION_ID,
    isProjectFiltered: selectedProject !== ALL_PROJECTS_OPTION_ID,
  });
  const showHostFilter = hosts.length > 1;
  const showProjectFilter = availableProjects.length > 0 || projectsLoading;
  const showFilterRow = showHostFilter || showProjectFilter || isSearchSupported;
  const showLoadError = isError && agents.length === 0;

  const handleBack = useCallback(() => {
    router.navigate(buildOpenProjectRoute());
  }, []);

  const handleClearSearch = useCallback(() => setSearchInput(""), []);

  const listFooterComponent = useMemo(() => {
    // A ranked result set has no next page — reaching a weaker match means
    // narrowing the query, so the footer says that instead of offering a button.
    if (isSearchTruncated) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerHint}>{t("sessions.tooManyMatches")}</Text>
        </View>
      );
    }
    if (!hasMore) {
      return null;
    }
    return (
      <View style={styles.footer}>
        <Button variant="ghost" onPress={loadMore} disabled={isLoadingMore}>
          {isLoadingMore ? "Loading..." : t("sessions.actions.loadMore")}
        </Button>
      </View>
    );
  }, [hasMore, isLoadingMore, isSearchTruncated, loadMore, t]);

  return (
    <View style={styles.container}>
      <MenuHeader title={t("sessions.title")} />
      {showFilterRow ? (
        <SessionsFilterRow
          isSearchSupported={isSearchSupported}
          searchInput={searchInput}
          onChangeSearch={setSearchInput}
          hosts={hosts}
          showHostFilter={showHostFilter}
          selectedHost={selectedHost}
          onSelectHost={setSelectedHost}
          showProjectFilter={showProjectFilter}
          projects={availableProjects}
          selectedProject={selectedProject}
          onSelectProject={setSelectedProject}
          projectsLoading={projectsLoading}
          t={t}
        />
      ) : null}
      {hostErrors.length > 0 ? <SessionHostErrorsBanner errors={hostErrors} t={t} /> : null}
      {isInitialLoad ? (
        <View style={styles.loadingContainer}>
          <LoadingSpinner size="large" color={theme.colors.foregroundMuted} />
        </View>
      ) : null}
      {!isInitialLoad && showLoadError ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>无法加载会话</Text>
          <Button variant="ghost" onPress={handleRefresh}>
            Try again
          </Button>
        </View>
      ) : null}
      {!isInitialLoad && !showLoadError && agents.length === 0 ? (
        <View style={styles.emptyContainer} testID="sessions-empty">
          <Text style={styles.emptyText}>{emptyText}</Text>
          {isSearching ? (
            <Button variant="ghost" onPress={handleClearSearch}>
              {t("sessions.actions.clearSearch")}
            </Button>
          ) : (
            <Button variant="ghost" leftIcon={ChevronLeft} onPress={handleBack}>
              Back
            </Button>
          )}
        </View>
      ) : null}
      {!isInitialLoad && !showLoadError && agents.length > 0 ? (
        <AgentList
          agents={agents}
          showCheckoutInfo={false}
          isRefreshing={isManualRefresh}
          onRefresh={handleRefresh}
          listFooterComponent={listFooterComponent}
          showAttentionIndicator={false}
          showHostColumn
          searchMatchesByAgentKey={isSearching ? searchMatchesByAgentKey : undefined}
          flat={isSearching}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  filterContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexWrap: "wrap",
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[6],
    },
    paddingTop: theme.spacing[4],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[6],
    padding: theme.spacing[6],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    alignItems: "center",
    paddingVertical: theme.spacing[4],
  },
  footerHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  errorsBannerWrap: {
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[6],
    },
    paddingTop: theme.spacing[3],
  },
  errorsBanner: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    gap: theme.spacing[1],
  },
  errorsBannerText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
  },
}));
