import { GitPullRequest } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import invariant from "tiny-invariant";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel, type PanelPresentation } from "@/panels/panel-registry";
import { MultiRepositoryPullRequestPanel } from "@/panels/multi-repository-pull-request";

const ThemedGitPullRequest = withUnistyles(GitPullRequest);
const pullRequestPanelPresentation = {
  label: (t) => t("panels.pullRequest.label"),
  subtitle: (t) => t("panels.pullRequest.subtitle"),
  tooltip: (t) => t("panels.pullRequest.label"),
  icon: ThemedGitPullRequest,
} satisfies PanelPresentation;
function usePullRequestPanelDescriptor(
  _target: { kind: "pull_request" },
  context: { serverId: string; workspaceId: string },
) {
  const { t } = useTranslation();
  void context;
  const label = pullRequestPanelPresentation.label(t);
  return {
    label,
    subtitle: pullRequestPanelPresentation.subtitle(t),
    tooltip: label,
    titleState: "ready" as const,
    icon: pullRequestPanelPresentation.icon,
    statusBucket: null,
  };
}

function PullRequestPanel() {
  const { serverId, workspaceId, target } = usePaneContext();
  invariant(target.kind === "pull_request", "PullRequestPanel requires pull_request target");
  return <MultiRepositoryPullRequestPanel serverId={serverId} workspaceId={workspaceId} />;
}

export const pullRequestPanelRegistration = definePanel("pull_request", {
  component: PullRequestPanel,
  presentation: pullRequestPanelPresentation,
  useDescriptor: usePullRequestPanelDescriptor,
});
