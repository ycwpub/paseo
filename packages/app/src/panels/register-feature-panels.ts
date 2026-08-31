import { registerPanel } from "@/panels/panel-registry";
import { projectFilesPanelRegistration } from "@/panels/files-panel-directory-browser";
import { multiRepositoryPullRequestPanelRegistration } from "@/panels/multi-repository-pull-request";
import { taskSummaryPanelRegistration } from "@/panels/task-summary-panel";

let featurePanelsRegistered = false;

export function ensureFeaturePanelsRegistered(): void {
  if (featurePanelsRegistered) {
    return;
  }
  registerPanel(projectFilesPanelRegistration);
  registerPanel(multiRepositoryPullRequestPanelRegistration);
  registerPanel(taskSummaryPanelRegistration);
  featurePanelsRegistered = true;
}
