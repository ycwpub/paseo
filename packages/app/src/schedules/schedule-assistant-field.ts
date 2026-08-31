import type { ScheduleFormTargetKind } from "./schedule-form-model";

export function shouldShowScheduleAssistantField(input: {
  targetKind: ScheduleFormTargetKind;
  selectedServerId: string | null;
}): boolean {
  return input.targetKind === "new-agent" && Boolean(input.selectedServerId);
}
