export type ReasoningPresentation =
  | { kind: "message" }
  | { kind: "collapsible"; defaultExpanded: boolean };

export function resolveReasoningPresentation(input: {
  provider: string | undefined;
  source?: "thinking" | "text";
  autoExpandReasoning: boolean;
}): ReasoningPresentation {
  if (input.provider === "aiden-claude") {
    if (input.source === "text") {
      return { kind: "message" };
    }
    return {
      kind: "collapsible",
      defaultExpanded: input.autoExpandReasoning,
    };
  }

  return input.autoExpandReasoning
    ? { kind: "collapsible", defaultExpanded: true }
    : { kind: "message" };
}
