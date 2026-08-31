import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Pencil, Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { QueuedComposerMessage } from "@/composer/actions";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/styles/theme";

interface QueuedMessageListProps {
  messages: readonly QueuedComposerMessage[];
  disabled: boolean;
  onEdit: (messageId: string) => void;
  onRemove: (messageId: string) => void;
  onSteer: (messageId: string) => Promise<void>;
}

interface QueuedMessageRowProps extends Omit<QueuedMessageListProps, "messages"> {
  message: QueuedComposerMessage;
}

function QueuedMessageRow({ message, disabled, onEdit, onRemove, onSteer }: QueuedMessageRowProps) {
  const { t } = useTranslation();
  const [isSteering, setIsSteering] = useState(false);
  const actionsDisabled = disabled || isSteering;
  const handleEdit = useCallback(() => onEdit(message.id), [message.id, onEdit]);
  const handleRemove = useCallback(() => onRemove(message.id), [message.id, onRemove]);
  const handleSteer = useCallback(async () => {
    setIsSteering(true);
    try {
      await onSteer(message.id);
    } finally {
      setIsSteering(false);
    }
  }, [message.id, onSteer]);

  return (
    <View style={styles.item}>
      <Text style={styles.text} numberOfLines={2} ellipsizeMode="tail">
        {message.text}
      </Text>
      <View style={styles.actions}>
        <Button
          variant="ghost"
          size="xs"
          leftIcon={Pencil}
          disabled={actionsDisabled}
          onPress={handleEdit}
          accessibilityLabel={t("composer.queue.edit")}
        />
        <Button
          variant="ghost"
          size="xs"
          leftIcon={Trash2}
          disabled={actionsDisabled}
          onPress={handleRemove}
          accessibilityLabel={t("composer.queue.remove")}
        />
        <Button
          variant="default"
          size="xs"
          loading={isSteering}
          disabled={actionsDisabled}
          onPress={handleSteer}
          accessibilityLabel={t("composer.queue.steer")}
        >
          {t("composer.queue.steer")}
        </Button>
      </View>
    </View>
  );
}

export function QueuedMessageList({
  messages,
  disabled,
  onEdit,
  onRemove,
  onSteer,
}: QueuedMessageListProps) {
  if (messages.length === 0) return null;
  return (
    <View style={styles.track} testID="composer-message-queue">
      {messages.map((message) => (
        <QueuedMessageRow
          key={message.id}
          message={message}
          disabled={disabled}
          onEdit={onEdit}
          onRemove={onRemove}
          onSteer={onSteer}
        />
      ))}
    </View>
  );
}

export function QueuedMessageEditNotice({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.editNotice} testID="queued-message-edit-notice">
      <View style={styles.editNoticeLabel}>
        <ThemedPencil size={14} uniProps={foregroundIconMapping} />
        <Text style={styles.editNoticeText}>{t("composer.queue.editing")}</Text>
      </View>
      <Button
        variant="ghost"
        size="xs"
        onPress={onCancel}
        accessibilityLabel={t("composer.queue.cancelEdit")}
      >
        {t("common.actions.cancel")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    flexDirection: "column",
    gap: theme.spacing[2],
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    gap: theme.spacing[2],
  },
  text: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  editNotice: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: theme.spacing[3],
    paddingRight: theme.spacing[1],
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  editNoticeLabel: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  editNoticeText: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));

const ThemedPencil = withUnistyles(Pencil);
const foregroundIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
