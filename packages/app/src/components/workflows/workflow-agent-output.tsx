import { Text, View } from "react-native";
import { Bot, UserRound } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { ReactElement } from "react";
import { parseLegacyWorkflowAgentOutput } from "@/workflows/run-output";

interface WorkflowAgentOutputProps {
  prompt: string | null;
  response: string | null;
  processOutput: string | null;
  legacyOutput: string | null;
}

export function WorkflowAgentOutput({
  prompt,
  response,
  processOutput,
  legacyOutput,
}: WorkflowAgentOutputProps) {
  const { t } = useTranslation();
  const legacy = legacyOutput
    ? parseLegacyWorkflowAgentOutput(legacyOutput)
    : { prompt: null, response: null, fallback: null };
  const displayedPrompt = prompt ?? legacy.prompt;
  const displayedResponse = response ?? legacy.response;
  const hasStructuredConversation = Boolean(displayedPrompt || displayedResponse);

  if (!hasStructuredConversation) {
    return legacy.fallback ? (
      <WorkflowAgentSection label={t("workflows.run.nodeOutput")} value={legacy.fallback} />
    ) : null;
  }

  return (
    <View style={styles.container}>
      {displayedPrompt ? (
        <WorkflowAgentSection
          label={t("workflows.run.userInput")}
          value={displayedPrompt}
          variant="user"
        />
      ) : null}
      {processOutput ? (
        <WorkflowAgentSection label={t("workflows.run.agentProcess")} value={processOutput} />
      ) : null}
      {displayedResponse ? (
        <WorkflowAgentSection
          label={t("workflows.run.agentAnswer")}
          value={displayedResponse}
          variant="agent"
        />
      ) : null}
    </View>
  );
}

function WorkflowAgentSection({
  label,
  value,
  variant = "process",
}: {
  label: string;
  value: string;
  variant?: "user" | "agent" | "process";
}) {
  let roleIcon: ReactElement | null = null;
  if (variant === "user") {
    roleIcon = <UserRound size={14} color={styles.userIcon.color} />;
  } else if (variant === "agent") {
    roleIcon = <Bot size={14} color={styles.agentIcon.color} />;
  }
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        {roleIcon}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text
        style={[
          styles.content,
          variant === "user" && styles.userContent,
          variant === "agent" && styles.agentContent,
        ]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[3],
  },
  section: {
    minWidth: 0,
    gap: theme.spacing[1],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  content: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: Math.round(theme.fontSize.xs * 1.45),
    fontFamily: theme.fontFamily.mono,
    padding: theme.spacing[2],
    borderRadius: theme.borderRadius.sm,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  userContent: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.foregroundMuted,
  },
  agentContent: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.statusSuccess,
  },
  userIcon: {
    color: theme.colors.foregroundMuted,
  },
  agentIcon: {
    color: theme.colors.statusSuccess,
  },
}));
