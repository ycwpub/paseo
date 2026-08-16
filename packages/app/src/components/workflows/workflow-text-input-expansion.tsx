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
import { applyWorkflowTextIndentation } from "@/workflows/workflow-text-indentation";

const EXPANDED_EDITOR_SNAP_POINTS = ["90%"];

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
  const [expandedValue, setExpandedValue] = useState(value ?? "");
  const expandedInputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (!isExpanded) {
      setExpandedValue(value ?? "");
    }
  }, [isExpanded, value]);
  useEffect(() => {
    if (!isWeb || !isExpanded) {
      return;
    }
    const input = expandedInputRef.current as unknown as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    if (!input) {
      return;
    }
    const handleKeyDown = (rawEvent: Event) => {
      const event = rawEvent as KeyboardEvent;
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) {
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
      setExpandedValue(edit.value);
      onChangeText?.(edit.value);
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      });
    };
    input.addEventListener("keydown", handleKeyDown);
    return () => input.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, onChangeText]);
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
    setExpandedValue(value ?? "");
    setIsExpanded(true);
  }, [value]);
  const closeEditor = useCallback(() => setIsExpanded(false), []);
  const handleExpandedChangeText = useCallback(
    (nextValue: string) => {
      setExpandedValue(nextValue);
      onChangeText?.(nextValue);
    },
    [onChangeText],
  );
  const openLabel = t("workflows.nodes.expandedEditor.open", {
    field: resolvedEditorTitle,
  });
  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        <Button variant="default" size="sm" onPress={closeEditor}>
          {t("workflows.nodes.expandedEditor.done")}
        </Button>
      </View>
    ),
    [closeEditor, t],
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
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={accessibilityLabel}
        multiline={multiline}
        size={size}
        style={style}
        textInputStyle={textInputStyle}
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
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={accessibilityLabel}
          multiline={multiline}
          size={size}
          style={style}
          textInputStyle={[textInputStyle, styles.collapsedInputText]}
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
        testID={testID ? `${testID}-expanded-editor` : "workflow-expanded-editor"}
      >
        <View style={[styles.expandedEditor, { height: expandedEditorHeight }]}>
          <FormTextInput
            {...inputProps}
            ref={expandedInputRef}
            value={expandedValue}
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
            textInputStyle={textInputStyle}
            testID={testID ? `${testID}-expanded-input` : "workflow-expanded-input"}
            controlled
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
    flexDirection: "row",
    justifyContent: "flex-end",
  },
}));
