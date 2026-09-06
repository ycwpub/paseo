import { useCallback, type ReactElement } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import type { DraggableRenderItemInfo } from "@/components/draggable-list.types";

interface SortablePluginGridProps<T> {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: DraggableRenderItemInfo<T>) => ReactElement;
  onDragEnd: (data: T[]) => void;
  style?: StyleProp<ViewStyle>;
}

export function SortablePluginGrid<T>({
  data,
  keyExtractor,
  renderItem,
  onDragEnd,
  style,
}: SortablePluginGridProps<T>) {
  const handleDragEnd = useCallback(
    ({ data: reordered }: { data: T[] }) => onDragEnd(reordered),
    [onDragEnd],
  );
  const handleRenderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<T>) =>
      renderItem({
        item,
        index: getIndex() ?? 0,
        drag,
        isActive,
      }),
    [renderItem],
  );

  return (
    <View style={style}>
      <DraggableFlatList
        data={data}
        keyExtractor={keyExtractor}
        numColumns={4}
        scrollEnabled={false}
        activationDistance={12}
        onDragEnd={handleDragEnd}
        renderItem={handleRenderItem}
      />
    </View>
  );
}
