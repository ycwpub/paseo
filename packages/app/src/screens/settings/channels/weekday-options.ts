import type { ComboboxOption } from "@/components/ui/combobox";

export const WEEKDAY_OPTIONS: ComboboxOption[] = [
  { id: "1", label: "周一" },
  { id: "2", label: "周二" },
  { id: "3", label: "周三" },
  { id: "4", label: "周四" },
  { id: "5", label: "周五" },
  { id: "6", label: "周六" },
  { id: "7", label: "周日" },
];

export function formatSelectedWeekdays(value: readonly number[]): string {
  if (value.length === 7) return "每天";
  const selected = new Set(value);
  return WEEKDAY_OPTIONS.filter((option) => selected.has(Number(option.id)))
    .map((option) => option.label)
    .join("、");
}
