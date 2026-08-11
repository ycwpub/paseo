import { Command } from "commander";
import { withOutput } from "../../output/index.js";
import { addJsonAndDaemonHostOptions } from "../../utils/command-options.js";
import { runWorkflowInspectCommand } from "./inspect.js";
import { runWorkflowLsCommand } from "./ls.js";
import { runWorkflowCommand } from "./run.js";
import { runWorkflowCancelCommand } from "./cancel.js";

export function createWorkflowCommand(): Command {
  const workflow = new Command("workflow").description("Run reusable Paseo workflow scripts");

  addJsonAndDaemonHostOptions(
    workflow
      .command("run")
      .description("Run a workflow script with an input JSON payload")
      .argument("<script>", "Workflow JSON script path on the daemon host")
      .argument("<input-json>", 'Initial JSON object with string fields "control" and "error"')
      .option("--background", "Return immediately after starting the workflow"),
  ).action(withOutput(runWorkflowCommand));

  addJsonAndDaemonHostOptions(
    workflow.command("ls").description("List installed workflows"),
  ).action(withOutput(runWorkflowLsCommand));

  addJsonAndDaemonHostOptions(
    workflow
      .command("inspect")
      .description("Inspect and validate a workflow script")
      .argument("<script>", "Workflow JSON script path on the daemon host"),
  ).action(withOutput(runWorkflowInspectCommand));

  addJsonAndDaemonHostOptions(
    workflow
      .command("cancel")
      .description("Cancel a running workflow")
      .argument("<run-id>", "Workflow run ID"),
  ).action(withOutput(runWorkflowCancelCommand));

  return workflow;
}
