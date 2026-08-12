import { useCallback, useMemo, type ReactElement, type ReactNode } from "react";
import { Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Copy } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/toast-context";
import { buildWorkflowUsageExamples } from "@/workflows/usage-guide";

export function WorkflowUsageGuide({
  visible,
  scriptPath,
  onClose,
}: {
  visible: boolean;
  scriptPath: string | null;
  onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const examples = useMemo(() => buildWorkflowUsageExamples(scriptPath), [scriptPath]);
  const header = useMemo<SheetHeader>(() => ({ title: t("workflows.guide.title") }), [t]);

  const copy = useCallback(
    async (value: string) => {
      await Clipboard.setStringAsync(value);
      toast.show(t("common.states.copied"), { variant: "success" });
    },
    [t, toast],
  );

  return (
    <AdaptiveModalSheet
      visible={visible}
      header={header}
      onClose={onClose}
      desktopMaxWidth={760}
      snapPoints={["80%", "95%"]}
      testID="workflow-usage-guide"
    >
      <View style={styles.content}>
        <Text style={styles.intro}>{t("workflows.guide.intro")}</Text>

        <GuideSection title={t("workflows.guide.contract.title")}>
          <Text style={styles.body}>{t("workflows.guide.contract.description")}</Text>
          <CodeExample
            value={'{\n  "control": "",\n  "filePath": "/absolute/path/input.txt"\n}'}
            onCopy={copy}
          />
          <Text style={styles.note}>{t("workflows.guide.contract.note")}</Text>
        </GuideSection>

        <GuideSection title={t("workflows.guide.internal.title")}>
          <GuideStep title={t("workflows.guide.internal.visualTitle")}>
            {t("workflows.guide.internal.visualDescription")}
          </GuideStep>
          <GuideStep title={t("workflows.guide.internal.agentTitle")}>
            {t("workflows.guide.internal.agentDescription")}
          </GuideStep>
          <Text style={styles.codeLabel}>run_workflow</Text>
          <CodeExample value={examples.agentTool} onCopy={copy} />
          <Text style={styles.codeLabel}>run_workflow · targetNodeId</Text>
          <CodeExample value={examples.agentToolNode} onCopy={copy} />
          <GuideStep title={t("workflows.guide.internal.serverTitle")}>
            {t("workflows.guide.internal.serverDescription")}
          </GuideStep>
          <CodeExample value={examples.server} onCopy={copy} />
          <Text style={styles.codeLabel}>WorkflowService · targetNodeId</Text>
          <CodeExample value={examples.serverNode} onCopy={copy} />
        </GuideSection>

        <GuideSection title={t("workflows.guide.external.title")}>
          <GuideStep title={t("workflows.guide.external.cliTitle")}>
            {t("workflows.guide.external.cliDescription")}
          </GuideStep>
          <CodeExample value={examples.cli} onCopy={copy} />
          <CodeExample value={examples.cliNode} onCopy={copy} />
          <GuideStep title={t("workflows.guide.external.backgroundTitle")}>
            {t("workflows.guide.external.backgroundDescription")}
          </GuideStep>
          <CodeExample value={examples.cliBackground} onCopy={copy} />
          <Text style={styles.note}>{t("workflows.guide.external.hostNote")}</Text>
        </GuideSection>

        <GuideSection title={t("workflows.guide.nodes.title")}>
          <Text style={styles.body}>{t("workflows.guide.nodes.bash")}</Text>
          <Text style={styles.body}>{t("workflows.guide.nodes.python")}</Text>
          <Text style={styles.body}>{t("workflows.guide.nodes.agent")}</Text>
          <Text style={styles.body}>{t("workflows.guide.nodes.switch")}</Text>
          <Text style={styles.body}>{t("workflows.guide.nodes.for")}</Text>
        </GuideSection>
      </View>
    </AdaptiveModalSheet>
  );
}

function GuideSection({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function GuideStep({ title, children }: { title: string; children: string }): ReactElement {
  return (
    <View style={styles.step}>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

function CodeExample({
  value,
  onCopy,
}: {
  value: string;
  onCopy: (value: string) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const handleCopy = useCallback(() => {
    void onCopy(value);
  }, [onCopy, value]);
  return (
    <View style={styles.codeCard}>
      <Text style={styles.code} selectable>
        {value}
      </Text>
      <Button
        variant="ghost"
        size="xs"
        leftIcon={Copy}
        onPress={handleCopy}
        style={styles.copyButton}
      >
        {t("common.actions.copy")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[6],
  },
  intro: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 21,
  },
  section: {
    gap: theme.spacing[3],
  },
  sectionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  step: {
    gap: theme.spacing[1],
  },
  stepTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  body: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 21,
  },
  note: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 19,
  },
  codeLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
  },
  codeCard: {
    position: "relative",
    padding: theme.spacing[3],
    paddingRight: 90,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
  },
  code: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    lineHeight: 19,
    fontFamily: theme.fontFamily.mono,
  },
  copyButton: {
    position: "absolute",
    top: theme.spacing[2],
    right: theme.spacing[2],
  },
}));
