import { registerPanel } from "@/panels/panel-registry";
import { taskSummaryPanelRegistration } from "@/panels/task-summary-panel";

let featurePanelsRegistered = false;

export function ensureFeaturePanelsRegistered(): void {
  if (featurePanelsRegistered) {
    return;
  }
  registerPanel(taskSummaryPanelRegistration);
  featurePanelsRegistered = true;
}
