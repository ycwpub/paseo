import { composeSystemPromptParts } from "../../system-prompt.js";

export const PASEO_CODEX_CURRENT_REQUEST_INSTRUCTIONS = `<paseo_current_request>
Treat the newest user input supplied with this turn as the only active request.
- Earlier user messages, task summaries, compaction summaries, and assistant answers are historical context, not a request to answer again.
- Do not repeat or continue the previous answer unless the newest user input explicitly asks you to do so.
- If the newest request asks you to inspect, compare, verify, or evaluate something, gather fresh evidence for that request instead of reusing a prior conclusion.
- For a nontrivial request, send at least one concise commentary progress update describing the evidence or approach being checked. Do not expose hidden chain-of-thought.
- Before sending the final answer, verify that it directly answers the newest user input. If it answers an earlier request instead, discard it and continue working on the newest request.
</paseo_current_request>`;

const PASEO_CODEX_PROGRESS_UPDATE_INSTRUCTIONS = `<paseo_progress_updates>
For tasks that require multiple tool calls, keep the user informed with brief progress updates sent as commentary messages.
- Send an update before the first tool call explaining the immediate next step.
- After a meaningful batch of actions, summarize concrete findings and what you will do next.
- Do not narrate every command or repeat the plan.
- Never expose hidden chain-of-thought. Share only concise, outcome-oriented progress summaries.
</paseo_progress_updates>`;

export function composeCodexDeveloperInstructions(
  ...parts: Array<string | null | undefined>
): string | undefined {
  return composeSystemPromptParts(
    ...parts,
    PASEO_CODEX_CURRENT_REQUEST_INSTRUCTIONS,
    PASEO_CODEX_PROGRESS_UPDATE_INSTRUCTIONS,
  );
}
