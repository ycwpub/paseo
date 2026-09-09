import { Command } from "commander";
import { withOutput } from "../../output/index.js";
import { addJsonAndDaemonHostOptions } from "../../utils/command-options.js";
import { runSubstituteReplyCommand } from "./reply.js";

export function createSubstituteCommand(): Command {
  const substitute = new Command("substitute").description("Manage Lark substitute tasks");

  addJsonAndDaemonHostOptions(
    substitute
      .command("reply")
      .description("Reply to the original Lark topic for the current substitute task")
      .argument("[message]", "Final reply text")
      .option("--message-file <path>", "Read the final reply text from a file")
      .allowExcessArguments(false),
  ).action(withOutput(runSubstituteReplyCommand));

  return substitute;
}
