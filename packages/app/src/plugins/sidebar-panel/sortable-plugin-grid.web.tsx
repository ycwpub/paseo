import { useMemo, type ReactElement } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { DraggableRenderItemInfo } from "@/components/draggable-list.types";
import { useDragReorderState } from "@/components/drag-reorder";

interface SortablePluginGridProps<T> {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: DraggableRenderItemInfo<T>) => ReactElement;
  onDragEnd: (data: T[]) => void;
  style?: StyleProp<ViewStyle>;
}

function SortableItem<T>({
  id,
  item,
  index,
  activeId,
  renderItem,
}: {
  id: string;
  item: T;
  index: number;
  activeId: string | null;
  renderItem: (info: DraggableRenderItemInfo<T>) => ReactElement;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = useMemo(
    () => ({
      transform: CSS.Transform.toString(
        transform && isDragging ? { ...transform, scaleX: 1, scaleY: 1 } : transform,
      ),
      transition,
      opacity: isDragging ? 0.75 : 1,
      zIndex: isDragging ? 10 : 1,
    }),
    [isDragging, transform, transition],
  );

  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={style}>
      {renderItem({
        item,
        index,
        drag: () => {},
        isActive: activeId === id,
      })}
    </div>
  );
}

export function SortablePluginGrid<T>({
  data,
  keyExtractor,
  renderItem,
  onDragEnd,
  style,
}: SortablePluginGridProps<T>) {
  const { activeId, items, handlers } = useDragReorderState({
    data,
    keyExtractor,
    onDragEnd,
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = useMemo(
    () => items.map((item, index) => keyExtractor(item, index)),
    [items, keyExtractor],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handlers.onDragStart}
      onDragCancel={handlers.onDragCancel}
      onDragEnd={handlers.onDragEnd}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <View style={style}>
          {items.map((item, index) => {
            const id = keyExtractor(item, index);
            return (
              <SortableItem
                key={id}
                id={id}
                item={item}
                index={index}
                activeId={activeId}
                renderItem={renderItem}
              />
            );
          })}
        </View>
      </SortableContext>
    </DndContext>
  );
}
