import React, { useCallback, useMemo, useState, type ReactElement } from "react";
import type { NativeSyntheticEvent, TextInputContentSizeChangeEventData } from "react-native";
import {
  WorkflowTextInput,
  type WorkflowTextInputProps,
} from "@/components/workflows/workflow-text-input";

const MIN_TITLE_HEIGHT = 48;
const TITLE_CONTENT_HEIGHT_BUFFER = 8;

export function WorkflowWrappingTitleInput({
  onChangeText,
  onContentSizeChange,
  style,
  ...props
}: WorkflowTextInputProps): ReactElement {
  const [contentHeight, setContentHeight] = useState(MIN_TITLE_HEIGHT);
  const handleChangeText = useCallback(
    (value: string) => {
      setContentHeight(MIN_TITLE_HEIGHT);
      onChangeText?.(value);
    },
    [onChangeText],
  );
  const handleContentSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const nextHeight = Math.max(
        MIN_TITLE_HEIGHT,
        Math.ceil(event.nativeEvent.contentSize.height) + TITLE_CONTENT_HEIGHT_BUFFER,
      );
      setContentHeight(nextHeight);
      onContentSizeChange?.(event);
    },
    [onContentSizeChange],
  );
  const contentSizeStyle = useMemo(
    () => ({
      height: contentHeight,
      minHeight: MIN_TITLE_HEIGHT,
    }),
    [contentHeight],
  );

  return (
    <WorkflowTextInput
      {...props}
      onChangeText={handleChangeText}
      onContentSizeChange={handleContentSizeChange}
      multiline
      numberOfLines={1}
      scrollEnabled={false}
      textAlignVertical="top"
      style={[style, contentSizeStyle]}
    />
  );
}
