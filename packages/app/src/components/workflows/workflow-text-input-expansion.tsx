import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import {
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInput,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTranslation } from "react-i18next";
import { Maximize2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { FormTextInput } from "@/components/ui/form-field";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isWeb } from "@/constants/platform";
import { calculateExpandedWorkflowEditorHeight } from "@/workflows/expanded-editor-layout";
import {
  applyWorkflowTextIndentation,
  WORKFLOW_TEXT_TAB_SIZE,
} from "@/workflows/workflow-text-indentation";

const EXPANDED_EDITOR_SNAP_POINTS = ["90%"];
const WEB_TAB_WIDTH_STYLE = (isWeb
  ? { tabSize: WORKFLOW_TEXT_TAB_SIZE }
  : undefined) as unknown as StyleProp<TextStyle>;

export type WorkflowTextInputExpansionProps = ComponentProps<typeof FormTextInput> & {
  editorTitle?: string;
  expandable?: boolean;
  monospace?: boolean;
};

export function WorkflowTextInputExpansion({
  value,
  onChangeText,
  editorTitle,
  expandable = true,
  monospace = false,
  accessibilityLabel,
  multiline,
  size,
  style,
  textInputStyle,
  testID,
  ...inputProps
}: WorkflowTextInputExpansionProps): ReactElement {
  const { t } = useTranslation();
  const { height: viewportHeight } = useWindowDimensions();
  const [isExpanded, setIsExpanded] = useState(false);
  const [collapsedValue, setCollapsedValue] = useState(value ?? "");
  const [expandedInitialValue, setExpandedInitialValue] = useState(value ?? "");
  const [expandedResetKey, setExpandedResetKey] = useState(0);
  const collapsedInputElementRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const expandedInputElementRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const collapsedValueRef = useRef(value ?? "");
  const expandedValueRef = useRef(value ?? "");
  const collapsedIsComposingRef = useRef(false);
  const expandedIsComposingRef = useRef(false);
  const onChangeTextRef = useRef(onChangeText);
  onChangeTextRef.current = onChangeText;
  useEffect(() => {
    if (collapsedIsComposingRef.current) {
      return;
    }
    const nextValue = value ?? "";
    collapsedValueRef.current = nextValue;
    setCollapsedValue(nextValue);
  }, [value]);
  useEffect(() => {
    if (!isExpanded) {
      const nextValue = value ?? "";
      expandedValueRef.current = nextValue;
    }
  }, [isExpanded, value]);
  const updateExpandedDraft = useCallback((nextValue: string) => {
    expandedValueRef.current = nextValue;
  }, []);
  const syncCollapsedValue = useCallback((nextValue: string) => {
    const changed = collapsedValueRef.current !== nextValue;
    collapsedValueRef.current = nextValue;
    setCollapsedValue(nextValue);
    if (changed) {
      onChangeTextRef.current?.(nextValue);
    }
  }, []);
  const handleCollapsedChangeText = useCallback(
    (nextValue: string) => {
      if (collapsedIsComposingRef.current) {
        setCollapsedValue(nextValue);
        return;
      }
      syncCollapsedValue(nextValue);
    },
    [syncCollapsedValue],
  );
  const handleCollapsedCompositionStart = useCallback(() => {
    collapsedIsComposingRef.current = true;
  }, []);
  const handleCollapsedCompositionEnd = useCallback(
    (rawEvent: Event) => {
      collapsedIsComposingRef.current = false;
      const input = rawEvent.currentTarget as HTMLInputElement | HTMLTextAreaElement | null;
      if (input) {
        syncCollapsedValue(input.value);
      }
    },
    [syncCollapsedValue],
  );
  const setCollapsedInputRef = useCallback(
    (node: TextInput | null) => {
      collapsedInputElementRef.current?.removeEventListener(
        "compositionstart",
        handleCollapsedCompositionStart,
      );
      collapsedInputElementRef.current?.removeEventListener(
        "compositionend",
        handleCollapsedCompositionEnd,
      );
      const input = node as unknown as HTMLInputElement | HTMLTextAreaElement | null;
      if (!isWeb || !input || typeof input.addEventListener !== "function") {
        collapsedInputElementRef.current = null;
        return;
      }
      collapsedInputElementRef.current = input;
      input.addEventListener("compositionstart", handleCollapsedCompositionStart);
      input.addEventListener("compositionend", handleCollapsedCompositionEnd);
    },
    [handleCollapsedCompositionEnd, handleCollapsedCompositionStart],
  );
  const handleExpandedInputKeyDown = useCallback(
    (rawEvent: Event) => {
      const event = rawEvent as KeyboardEvent;
      if (expandedIsComposingRef.current || event.isComposing || event.keyCode === 229) {
        return;
      }
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const input = expandedInputElementRef.current;
      if (!input) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const edit = applyWorkflowTextIndentation({
        value: input.value,
        selectionStart: input.selectionStart ?? input.value.length,
        selectionEnd: input.selectionEnd ?? input.value.length,
        outdent: event.shiftKey,
      });
      input.value = edit.value;
      updateExpandedDraft(edit.value);
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      });
    },
    [updateExpandedDraft],
  );
  const handleExpandedCompositionStart = useCallback(() => {
    expandedIsComposingRef.current = true;
  }, []);
  const handleExpandedCompositionEnd = useCallback(
    (rawEvent: Event) => {
      expandedIsComposingRef.current = false;
      const input = rawEvent.currentTarget as HTMLInputElement | HTMLTextAreaElement | null;
      if (input) {
        updateExpandedDraft(input.value);
      }
    },
    [updateExpandedDraft],
  );
  const setExpandedInputRef = useCallback(
    (node: TextInput | null) => {
      expandedInputElementRef.current?.removeEventListener(
        "keydown",
        handleExpandedInputKeyDown,
        true,
      );
      expandedInputElementRef.current?.removeEventListener(
        "compositionstart",
        handleExpandedCompositionStart,
      );
      expandedInputElementRef.current?.removeEventListener(
        "compositionend",
        handleExpandedCompositionEnd,
      );
      const input = node as unknown as HTMLInputElement | HTMLTextAreaElement | null;
      if (!isWeb || !input || typeof input.addEventListener !== "function") {
        expandedInputElementRef.current = null;
        return;
      }
      expandedInputElementRef.current = input;
      input.addEventListener("keydown", handleExpandedInputKeyDown, true);
      input.addEventListener("compositionstart", handleExpandedCompositionStart);
      input.addEventListener("compositionend", handleExpandedCompositionEnd);
    },
    [handleExpandedCompositionEnd, handleExpandedCompositionStart, handleExpandedInputKeyDown],
  );
  useEffect(
    () => () => {
      collapsedInputElementRef.current?.removeEventListener(
        "compositionstart",
        handleCollapsedCompositionStart,
      );
      collapsedInputElementRef.current?.removeEventListener(
        "compositionend",
        handleCollapsedCompositionEnd,
      );
      expandedInputElementRef.current?.removeEventListener(
        "keydown",
        handleExpandedInputKeyDown,
        true,
      );
      expandedInputElementRef.current?.removeEventListener(
        "compositionstart",
        handleExpandedCompositionStart,
      );
      expandedInputElementRef.current?.removeEventListener(
        "compositionend",
        handleExpandedCompositionEnd,
      );
      collapsedInputElementRef.current = null;
      expandedInputElementRef.current = null;
    },
    [
      handleCollapsedCompositionEnd,
      handleCollapsedCompositionStart,
      handleExpandedCompositionEnd,
      handleExpandedCompositionStart,
      handleExpandedInputKeyDown,
    ],
  );
  const expandedEditorHeight = useMemo(
    () => calculateExpandedWorkflowEditorHeight(viewportHeight),
    [viewportHeight],
  );
  const expandedInputSizeStyle = useMemo(
    () => ({
      height: expandedEditorHeight,
      minHeight: expandedEditorHeight,
    }),
    [expandedEditorHeight],
  );
  const resolvedEditorTitle =
    editorTitle || accessibilityLabel || t("workflows.nodes.expandedEditor.defaultTitle");
  const header = useMemo<SheetHeader>(
    () => ({
      title: resolvedEditorTitle,
      subtitle: t("workflows.nodes.expandedEditor.subtitle"),
    }),
    [resolvedEditorTitle, t],
  );
  const openEditor = useCallback(() => {
    const nextValue = isWeb ? collapsedValueRef.current : (value ?? "");
    expandedValueRef.current = nextValue;
    setExpandedInitialValue(nextValue);
    setExpandedResetKey((current) => current + 1);
    setIsExpanded(true);
  }, [value]);
  const closeEditor = useCallback(() => {
    expandedIsComposingRef.current = false;
    setIsExpanded(false);
  }, []);
  const completeEditor = useCallback(() => {
    expandedIsComposingRef.current = false;
    const nextValue =
      isWeb && expandedInputElementRef.current
        ? expandedInputElementRef.current.value
        : expandedValueRef.current;
    expandedValueRef.current = nextValue;
    collapsedValueRef.current = nextValue;
    setCollapsedValue(nextValue);
    if (nextValue !== (value ?? "")) {
      onChangeTextRef.current?.(nextValue);
    }
    setIsExpanded(false);
  }, [value]);
  const handleExpandedChangeText = useCallback(
    (nextValue: string) => {
      updateExpandedDraft(nextValue);
    },
    [updateExpandedDraft],
  );
  const openLabel = t("workflows.nodes.expandedEditor.open", {
    field: resolvedEditorTitle,
  });
  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        <Button variant="default" size="sm" onPress={completeEditor}>
          {t("workflows.nodes.expandedEditor.done")}
        </Button>
      </View>
    ),
    [completeEditor, t],
  );
  let expandButtonPlacement: StyleProp<ViewStyle> = styles.expandButtonDefault;
  if (multiline) {
    expandButtonPlacement = styles.expandButtonMultiline;
  } else if (size === "sm") {
    expandButtonPlacement = styles.expandButtonSmall;
  }

  if (!expandable) {
    return (
      <FormTextInput
        {...inputProps}
        ref={setCollapsedInputRef}
        value={isWeb ? collapsedValue : value}
        onChangeText={isWeb ? handleCollapsedChangeText : onChangeText}
        accessibilityLabel={accessibilityLabel}
        multiline={multiline}
        size={size}
        style={style}
        textInputStyle={[textInputStyle, WEB_TAB_WIDTH_STYLE]}
        testID={testID}
        controlled
      />
    );
  }

  return (
    <>
      <View style={styles.inputContainer}>
        <FormTextInput
          {...inputProps}
          ref={setCollapsedInputRef}
          value={isWeb ? collapsedValue : value}
          onChangeText={isWeb ? handleCollapsedChangeText : onChangeText}
          accessibilityLabel={accessibilityLabel}
          multiline={multiline}
          size={size}
          style={style}
          textInputStyle={[textInputStyle, styles.collapsedInputText, WEB_TAB_WIDTH_STYLE]}
          testID={testID}
          controlled
        />
        <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              leftIcon={Maximize2}
              accessibilityLabel={openLabel}
              onPress={openEditor}
              style={[styles.expandButton, expandButtonPlacement]}
              testID={testID ? `${testID}-expand` : undefined}
            />
          </TooltipTrigger>
          <TooltipContent side="top" align="end" offset={6}>
            {openLabel}
          </TooltipContent>
        </Tooltip>
      </View>
      <AdaptiveModalSheet
        visible={isExpanded}
        header={header}
        onClose={closeEditor}
        desktopMaxWidth={960}
        snapPoints={EXPANDED_EDITOR_SNAP_POINTS}
        scrollable={false}
        contentStyle={styles.sheetContent}
        footer={footer}
        footerContainerStyle={styles.footerContainer}
        testID={testID ? `${testID}-expanded-editor` : "workflow-expanded-editor"}
      >
        <View style={[styles.expandedEditor, { height: expandedEditorHeight }]}>
          <FormTextInput
            {...inputProps}
            ref={setExpandedInputRef}
            initialValue={expandedInitialValue}
            resetKey={expandedResetKey}
            onChangeText={handleExpandedChangeText}
            accessibilityLabel={accessibilityLabel}
            multiline
            size={size}
            textAlignVertical="top"
            autoFocus={isWeb}
            style={[
              styles.expandedInput,
              expandedInputSizeStyle,
              monospace && styles.monospaceInput,
            ]}
            textInputStyle={[textInputStyle, WEB_TAB_WIDTH_STYLE]}
            testID={testID ? `${testID}-expanded-input` : "workflow-expanded-input"}
          />
        </View>
      </AdaptiveModalSheet>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  inputContainer: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    position: "relative",
  },
  collapsedInputText: {
    paddingRight: theme.spacing[8] + theme.spacing[8],
  },
  expandButton: {
    position: "absolute",
    right: theme.spacing[3],
    zIndex: 2,
    backgroundColor: theme.colors.surface2,
  },
  expandButtonSmall: {
    top: theme.spacing[0.5],
  },
  expandButtonDefault: {
    top: theme.spacing[2],
  },
  expandButtonMultiline: {
    top: theme.spacing[1],
  },
  sheetContent: {
    flex: 1,
  },
  expandedEditor: {
    width: "100%",
  },
  expandedInput: {
    width: "100%",
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.5),
  },
  monospaceInput: {
    fontFamily: "monospace",
  },
  footer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  footerContainer: {
    justifyContent: "flex-end",
  },
}));
