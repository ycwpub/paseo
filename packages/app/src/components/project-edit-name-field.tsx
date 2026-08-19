import React, { useRef } from "react";
import type { FieldControlSize } from "@/components/ui/control-geometry";
import { Field, FormTextInput } from "@/components/ui/form-field";

export function ProjectEditNameField({
  initialName,
  placeholder,
  label,
  accessibilityLabel,
  error,
  size,
  disabled,
  onChangeText,
}: {
  initialName: string;
  placeholder: string;
  label: string;
  accessibilityLabel: string;
  error: string | null;
  size: FieldControlSize;
  disabled: boolean;
  onChangeText: (value: string) => void;
}) {
  // AdaptiveTextInput is deliberately uncontrolled. Keep its default value
  // fixed for this mounted edit session so parent updates cannot overwrite an
  // in-progress Chinese IME composition. The sheet remounts for each opening.
  const initialNameRef = useRef(initialName);

  return (
    <Field label={label} error={error}>
      <FormTextInput
        size={size}
        testID="project-edit-name"
        accessibilityLabel={accessibilityLabel}
        initialValue={initialNameRef.current}
        onChangeText={onChangeText}
        placeholder={placeholder}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Field>
  );
}
