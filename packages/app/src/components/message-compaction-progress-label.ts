import { i18n } from "@/i18n/i18next";
import {
  getCompactionMarkerLabel,
  type CompactionMarkerLabelInput,
} from "./message-compaction-label";

export function getCompactionProgressLabel(input: CompactionMarkerLabelInput): string {
  if (input.status === "loading" && input.trigger === "auto") {
    return i18n.t("message.compaction.loadingAuto");
  }
  if (input.status === "loading" && input.trigger === "manual") {
    return i18n.t("message.compaction.loadingManual");
  }
  return getCompactionMarkerLabel(input);
}
