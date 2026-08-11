import { Command, Option } from "commander";
import { withOutput } from "../../output/index.js";
import { addJsonAndDaemonHostOptions } from "../../utils/command-options.js";
import { runCreateCommand } from "./create.js";
import { runLsCommand } from "./ls.js";
import { runInspectCommand } from "./inspect.js";
import { runLogsCommand } from "./logs.js";
import { runPauseCommand } from "./pause.js";
import { runResumeCommand } from "./resume.js";
import { runDeleteCommand } from "./delete.js";
import { runRunOnceCommand } from "./run-once.js";
import { runUpdateCommand } from "./update.js";

export function createScheduleCommand(): Command {
  const schedule = new Command("schedule").description("Manage recurring schedules");

  addJsonAndDaemonHostOptions(
    schedule
      .command("create")
      .description("Create a schedule")
      .argument("<prompt>", "Prompt or bash command to run on the schedule")
      .option("--type <type>", "Schedule type: new-agent or bash")
      .option("--every <duration>", "Cron-compatible cadence preset (for example: 5m, 1h)")
      .option("--cron <expr>", "Cron cadence expression")
      .option("--timezone <iana>", "IANA time zone for cron cadence (default: UTC)")
      .option("--name <name>", "Optional schedule name")
      .addOption(new Option("--target <target>", "Legacy schedule target").hideHelp())
      .option(
        "--provider <provider>",
        "Agent provider, or provider/model (e.g. codex or codex/gpt-5.4)",
      )
      .option(
        "--mode <mode>",
        "Provider-specific mode (e.g. claude bypassPermissions, opencode build)",
      )
      .option("--assistant <id>", "Assistant ID for new-agent schedules")
      .option("--cwd <path>", "Working directory (default: current; required with --host)")
      .option("--shell <path>", "Shell for bash schedules (default: /bin/bash)")
      .option("--timeout <duration>", "Timeout for bash schedules (default: 30m)")
      .option("--run-now", "Fire one immediate run on creation")
      .option("--max-runs <n>", "Maximum number of runs")
      .option("--expires-in <duration>", "Time to live for the schedule"),
  ).action(withOutput(runCreateCommand));

  addJsonAndDaemonHostOptions(schedule.command("ls").description("List schedules")).action(
    withOutput(runLsCommand),
  );

  addJsonAndDaemonHostOptions(
    schedule.command("inspect").description("Inspect a schedule").argument("<id>", "Schedule ID"),
  ).action(withOutput(runInspectCommand));

  addJsonAndDaemonHostOptions(
    schedule
      .command("logs")
      .description("Show recent schedule run logs")
      .argument("<id>", "Schedule ID"),
  ).action(withOutput(runLogsCommand));

  addJsonAndDaemonHostOptions(
    schedule.command("pause").description("Pause a schedule").argument("<id>", "Schedule ID"),
  ).action(withOutput(runPauseCommand));

  addJsonAndDaemonHostOptions(
    schedule
      .command("resume")
      .description("Resume a paused or ended schedule")
      .argument("<id>", "Schedule ID"),
  ).action(withOutput(runResumeCommand));

  addJsonAndDaemonHostOptions(
    schedule.command("delete").description("Delete a schedule").argument("<id>", "Schedule ID"),
  ).action(withOutput(runDeleteCommand));

  addJsonAndDaemonHostOptions(
    schedule
      .command("run-once")
      .description("Manually trigger a single run of a schedule without affecting cadence")
      .argument("<id>", "Schedule ID"),
  ).action(withOutput(runRunOnceCommand));

  addJsonAndDaemonHostOptions(
    schedule
      .command("update")
      .description("Update an existing schedule in place")
      .argument("<id>", "Schedule ID")
      .option("--type <type>", "Schedule type for type-specific fields: new-agent or bash")
      .option("--every <duration>", "Cron-compatible cadence preset (for example: 5m, 1h)")
      .option("--cron <expr>", "Switch to cron cadence expression")
      .option("--timezone <iana>", "IANA time zone for cron cadence (requires --cron)")
      .option("--name <name>", "Rename the schedule (empty string clears the name)")
      .option("--prompt <text>", "Replace the schedule prompt")
      .option(
        "--provider <provider>",
        "New agent provider, or provider/model (only for new-agent target)",
      )
      .option("--model <model>", "New agent model (only for new-agent target)")
      .option("--mode <mode>", "New agent provider mode (only for new-agent target)")
      .option("--assistant <id>", "Assistant ID for new-agent schedules")
      .option("--no-assistant", "Clear the assistant for a new-agent schedule")
      .option("--cwd <path>", "New working directory (for new-agent or --type bash)")
      .option("--shell <path>", "New shell (only with --type bash)")
      .option("--timeout <duration>", "New timeout (only with --type bash)")
      .option("--clear-timeout", "Clear the bash timeout (only with --type bash)")
      .option("--max-runs <n>", "Set or change maximum number of runs")
      .option("--no-max-runs", "Clear the max-runs limit")
      .option("--expires-in <duration>", "Set or change time to live for the schedule")
      .option("--no-expires-in", "Clear the expiration"),
  ).action(withOutput(runUpdateCommand));

  return schedule;
}
