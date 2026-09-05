import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, View, type PressableStateCallbackType } from "react-native";
import { Combobox, ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";
import { Field } from "@/components/ui/form-field";
import { SelectFieldTrigger } from "@/components/ui/select-field";

const WEEKDAY_OPTIONS: ComboboxOption[] = [
  { id: "1", label: "1 周一" },
  { id: "2", label: "2 周二" },
  { id: "3", label: "3 周三" },
  { id: "4", label: "4 周四" },
  { id: "5", label: "5 周五" },
  { id: "6", label: "6 周六" },
  { id: "7", label: "7 周日" },
];

function formatSelectedWeekdays(value: readonly number[]): string {
  if (value.length === 7) return "每天（1～7）";
  const selected = new Set(value);
  return WEEKDAY_OPTIONS.filter((option) => selected.has(Number(option.id)))
    .map((option) => option.label)
    .join("、");
}

export function WeekdayMultiSelectField({
  value,
  onChange,
}: {
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(value), [value]);
  const displayLabel = formatSelectedWeekdays(value) || "选择星期";

  const handleSelect = useCallback(
    (id: string) => {
      const weekday = Number(id);
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return;
      const next = new Set(value);
      if (next.has(weekday)) {
        next.delete(weekday);
      } else {
        next.add(weekday);
      }
      onChange([...next].sort((left, right) => left - right));
    },
    [onChange, value],
  );
  const handlePress = useCallback(() => {
    setOpen((current) => !current);
  }, []);

  const renderOption = useCallback(
    ({
      option,
      active,
      onPress,
    }: {
      option: ComboboxOption;
      selected: boolean;
      active: boolean;
      onPress: () => void;
    }) => (
      <ComboboxItem
        label={option.label}
        selected={selected.has(Number(option.id))}
        active={active}
        onPress={onPress}
      />
    ),
    [selected],
  );

  return (
    <Field label="星期" hint="使用 1～7 表示周一到周日，可多选。">
      <View ref={anchorRef} collapsable={false}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={`星期（${displayLabel}）`}
        >
          {({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => (
            <SelectFieldTrigger
              label={displayLabel}
              isPlaceholder={value.length === 0}
              placeholder="选择星期"
              hovered={Boolean(hovered)}
              active={pressed || open}
            />
          )}
        </Pressable>
      </View>
      <Combobox
        options={WEEKDAY_OPTIONS}
        value=""
        onSelect={handleSelect}
        keepOpenOnSelect
        emptyText="暂无星期选项"
        title="选择星期"
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchorRef}
        renderOption={renderOption}
      />
    </Field>
  );
}
