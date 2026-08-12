import { useCallback, useMemo, useState, type ComponentProps, type ReactElement } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Maximize2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WorkflowTextInput } from "@/components/workflows/workflow-text-input";
import { isWeb } from "@/constants/platform";

const EXPANDED_EDITOR_SNAP_POINTS = ["90%"];

type WorkflowExpandableTextInputProps = Omit<
  ComponentProps<typeof WorkflowTextInput>,
  "value" | "onChangeText"
> & {
  value: string;
  onChangeText: (value: string) => void;
  editorTitle: string;
  monospace?: boolean;
};

export function WorkflowExpandableTextInput({
  value,
  onChangeText,
  editorTitle,
  monospace = false,
  style,
  testID,
  ...inputProps
}: WorkflowExpandableTextInputProps): ReactElement {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const header = useMemo<SheetHeader>(
    () => ({
      title: editorTitle,
      subtitle: t("workflows.nodes.expandedEditor.subtitle"),
    }),
    [editorTitle, t],
  );
  const openEditor = useCallback(() => setIsExpanded(true), []);
  const closeEditor = useCallback(() => setIsExpanded(false), []);
  const openLabel = t("workflows.nodes.expandedEditor.open", { field: editorTitle });
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

  return (
    <>
      <View style={styles.inputContainer}>
        <WorkflowTextInput
          {...inputProps}
          value={value}
          onChangeText={onChangeText}
          style={[style, styles.collapsedInput]}
          testID={testID}
        />
        <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              leftIcon={Maximize2}
              accessibilityLabel={openLabel}
              onPress={openEditor}
              style={styles.expandButton}
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
        <View style={styles.expandedEditor}>
          <WorkflowTextInput
            {...inputProps}
            value={value}
            onChangeText={onChangeText}
            multiline
            textAlignVertical="top"
            autoFocus={isWeb}
            style={[styles.expandedInput, monospace && styles.monospaceInput]}
            testID={testID ? `${testID}-expanded-input` : "workflow-expanded-input"}
          />
        </View>
      </AdaptiveModalSheet>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  inputContainer: {
    position: "relative",
  },
  collapsedInput: {
    paddingRight: theme.spacing[12],
  },
  expandButton: {
    position: "absolute",
    top: theme.spacing[2],
    right: theme.spacing[2],
    zIndex: 1,
  },
  sheetContent: {
    flex: 1,
  },
  expandedEditor: {
    flex: 1,
    minHeight: 360,
  },
  expandedInput: {
    flex: 1,
    minHeight: 360,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.5),
  },
  monospaceInput: {
    fontFamily: theme.fontFamily.mono,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
}));
