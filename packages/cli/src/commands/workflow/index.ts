import { Command } from "commander";
import { withOutput } from "../../output/index.js";
import { addJsonAndDaemonHostOptions } from "../../utils/command-options.js";
import { runWorkflowInspectCommand } from "./inspect.js";
import { runWorkflowLsCommand } from "./ls.js";
import { runWorkflowCommand } from "./run.js";
import { runWorkflowCancelCommand } from "./cancel.js";
import { runWorkflowProtocolCommand } from "./protocol.js";

export function createWorkflowCommand(): Command {
  const workflow = new Command("workflow")
    .description("Run reusable Paseo workflow scripts")
    .addHelpText(
      "after",
      "\nCommand-node protocol: JSON input on stdin, logs on stdout/stderr, one result JSON on file descriptor 3.\nRun `paseo workflow protocol --json` to inspect the connected daemon or add `--local` to inspect the CLI's bundled schemas without a daemon.",
    );

  const run = workflow
    .command("run")
    .description("Run a workflow script with an input JSON payload")
    .argument("<script>", "Workflow JSON script path on the daemon host")
    .argument("[input-json]", "Initial JSON object matching the first node input schema")
    .option("--preset <preset-id>", "Start from a reusable input preset defined by the workflow")
    .option("--node <node-id>", "Run only the workflow node with this ID")
    .option(
      "--input-type <type>",
      "Node input type: upstream-output or node-input (requires --node)",
    )
    .option("--background", "Return immediately after starting the workflow")
    .addHelpText(
      "after",
      "\nBash/Python protocol: read JSON from stdin; write logs to stdout/stderr; write exactly one result JSON to file descriptor 3. stdout is never parsed as a result.",
    );
  addJsonAndDaemonHostOptions(run).action(withOutput(runWorkflowCommand));

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

  addJsonAndDaemonHostOptions(
    workflow
      .command("protocol")
      .description("Show the complete machine-readable Workflow protocol")
      .option("--local", "Inspect the CLI's bundled protocol without connecting to a daemon"),
  ).action(withOutput(runWorkflowProtocolCommand));

  return workflow;
}
