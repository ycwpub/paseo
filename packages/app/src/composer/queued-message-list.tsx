import { useCallback, useMemo, useState, type Ref } from "react";
import { Pressable, Text, View, type AccessibilityActionEvent } from "react-native";
import { GripVertical, Pencil, Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { QueuedComposerMessage } from "@/composer/actions";
import { DraggableList, type DraggableRenderItemInfo } from "@/components/draggable-list";
import type { DraggableListDragHandleProps } from "@/components/draggable-list.types";
import { Button } from "@/components/ui/button";
import { ICON_SIZE, type Theme } from "@/styles/theme";

interface QueuedMessageListProps {
  messages: readonly QueuedComposerMessage[];
  disabled: boolean;
  onEdit: (messageId: string) => void;
  onMove: (messageId: string, direction: "up" | "down") => void;
  onRemove: (messageId: string) => void;
  onReorder: (messages: readonly QueuedComposerMessage[]) => void;
  onSteer: (messageId: string) => Promise<void>;
}

interface QueuedMessageRowProps extends Omit<QueuedMessageListProps, "messages" | "onReorder"> {
  message: QueuedComposerMessage;
  index: number;
  count: number;
  drag: () => void;
  dragHandleProps?: DraggableListDragHandleProps;
  isDragging: boolean;
}

function QueuedMessageRow({
  message,
  index,
  count,
  disabled,
  drag,
  dragHandleProps,
  isDragging,
  onEdit,
  onMove,
  onRemove,
  onSteer,
}: QueuedMessageRowProps) {
  const { t } = useTranslation();
  const [isSteering, setIsSteering] = useState(false);
  const actionsDisabled = disabled || isSteering;
  const canMoveUp = !actionsDisabled && index > 0;
  const canMoveDown = !actionsDisabled && index < count - 1;
  const handleEdit = useCallback(() => onEdit(message.id), [message.id, onEdit]);
  const handleRemove = useCallback(() => onRemove(message.id), [message.id, onRemove]);
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === "decrement" && canMoveUp) {
        onMove(message.id, "up");
      }
      if (event.nativeEvent.actionName === "increment" && canMoveDown) {
        onMove(message.id, "down");
      }
    },
    [canMoveDown, canMoveUp, message.id, onMove],
  );
  const handleSteer = useCallback(async () => {
    setIsSteering(true);
    try {
      await onSteer(message.id);
    } finally {
      setIsSteering(false);
    }
  }, [message.id, onSteer]);
  const accessibilityActions = useMemo(
    () => [
      ...(canMoveUp ? [{ name: "decrement" as const, label: t("composer.queue.moveUp") }] : []),
      ...(canMoveDown ? [{ name: "increment" as const, label: t("composer.queue.moveDown") }] : []),
    ],
    [canMoveDown, canMoveUp, t],
  );
  const dragAttributes = actionsDisabled ? undefined : dragHandleProps?.attributes;
  const dragListeners = actionsDisabled ? undefined : dragHandleProps?.listeners;

  return (
    <View
      style={[
        styles.item,
        index < count - 1 ? styles.itemSpacing : null,
        isDragging ? styles.dragging : null,
      ]}
    >
      <Pressable
        {...dragAttributes}
        {...dragListeners}
        ref={dragHandleProps?.setActivatorNodeRef as unknown as Ref<View>}
        disabled={actionsDisabled}
        delayLongPress={180}
        onLongPress={drag}
        accessibilityRole="button"
        accessibilityLabel={t("composer.queue.reorder")}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={handleAccessibilityAction}
        hitSlop={6}
        style={styles.dragHandle}
        testID={`queued-message-drag-handle-${message.id}`}
      >
        <ThemedGripVertical size={ICON_SIZE.sm} uniProps={foregroundIconMapping} />
      </Pressable>
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
  onMove,
  onRemove,
  onReorder,
  onSteer,
}: QueuedMessageListProps) {
  const draggableMessages = useMemo(() => [...messages], [messages]);
  const renderMessage = useCallback(
    ({
      item,
      index,
      drag,
      dragHandleProps,
      isActive,
    }: DraggableRenderItemInfo<QueuedComposerMessage>) => (
      <QueuedMessageRow
        message={item}
        index={index}
        count={messages.length}
        disabled={disabled}
        drag={drag}
        dragHandleProps={dragHandleProps}
        isDragging={isActive}
        onEdit={onEdit}
        onMove={onMove}
        onRemove={onRemove}
        onSteer={onSteer}
      />
    ),
    [disabled, messages.length, onEdit, onMove, onRemove, onSteer],
  );
  if (messages.length === 0) return null;
  return (
    <DraggableList
      data={draggableMessages}
      keyExtractor={queuedMessageKey}
      renderItem={renderMessage}
      onDragEnd={onReorder}
      scrollEnabled={false}
      useDragHandle
      extraData={disabled}
      containerStyle={styles.track}
      testID="composer-message-queue"
    />
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
  itemSpacing: {
    marginBottom: theme.spacing[2],
  },
  dragging: {
    opacity: 0.75,
  },
  dragHandle: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 20,
    alignSelf: "stretch",
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
const ThemedGripVertical = withUnistyles(GripVertical);
const foregroundIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function queuedMessageKey(message: QueuedComposerMessage): string {
  return message.id;
}
