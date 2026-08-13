import React, { useCallback, useMemo, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Maximize2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const FULL_VALUE_SNAP_POINTS = ["90%"];
const DEFAULT_PREVIEW_LINES = 4;

export function WorkflowExpandableReadonlyValue({
  label,
  value,
  previewLines = DEFAULT_PREVIEW_LINES,
  testID,
}: {
  label: string;
  value: string;
  previewLines?: number;
  testID?: string;
}): ReactElement {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const openLabel = t("workflows.nodes.expandedEditor.open", { field: label });
  const header = useMemo<SheetHeader>(() => ({ title: label }), [label]);
  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        <Button variant="default" size="sm" onPress={close}>
          {t("workflows.nodes.expandedEditor.done")}
        </Button>
      </View>
    ),
    [close, t],
  );

  return (
    <>
      <View style={styles.preview}>
        <Text style={styles.value} numberOfLines={previewLines} selectable testID={testID}>
          {value}
        </Text>
        <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              leftIcon={Maximize2}
              accessibilityLabel={openLabel}
              onPress={open}
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
        visible={visible}
        header={header}
        onClose={close}
        desktopMaxWidth={960}
        snapPoints={FULL_VALUE_SNAP_POINTS}
        footer={footer}
        testID={testID ? `${testID}-full` : "workflow-run-value-full"}
      >
        <Text style={styles.fullValue} selectable>
          {value}
        </Text>
      </AdaptiveModalSheet>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  preview: {
    position: "relative",
    minWidth: 0,
    padding: theme.spacing[2],
    paddingRight: theme.spacing[16],
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface0,
  },
  value: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.45),
    fontFamily: "monospace",
  },
  expandButton: {
    position: "absolute",
    top: theme.spacing[1],
    right: theme.spacing[2],
    zIndex: 1,
    backgroundColor: theme.colors.surface0,
  },
  fullValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.5),
    fontFamily: "monospace",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
}));
