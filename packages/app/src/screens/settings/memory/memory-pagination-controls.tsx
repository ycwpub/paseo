import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import type { MemoryPagination } from "./memory-pagination";
import { MEMORY_PAGE_SIZE_OPTIONS } from "./memory-pagination";

export function MemoryPaginationControls({
  pagination,
  disabled,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: MemoryPagination<unknown>;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const { t } = useTranslation();
  const pageSizeOptions = useMemo<SelectFieldOption<number>[]>(
    () =>
      MEMORY_PAGE_SIZE_OPTIONS.map((pageSize) => ({
        id: String(pageSize),
        value: pageSize,
        label: String(pageSize),
      })),
    [],
  );
  const selectedPageSize = useMemo(
    () => ({ label: String(pagination.pageSize) }),
    [pagination.pageSize],
  );
  const previousPage = useCallback(
    () => onPageChange(pagination.page - 1),
    [onPageChange, pagination.page],
  );
  const nextPage = useCallback(
    () => onPageChange(pagination.page + 1),
    [onPageChange, pagination.page],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.summary}>
        {t("memoryPolicies.contentManager.pagination.range", {
          start: pagination.startItem,
          end: pagination.endItem,
          total: pagination.totalItems,
        })}
      </Text>
      <View style={styles.actions}>
        <View style={styles.pageSize}>
          <SelectField
            label={t("memoryPolicies.contentManager.pagination.pageSize")}
            value={pagination.pageSize}
            selectedDisplay={selectedPageSize}
            options={pageSizeOptions}
            onChange={onPageSizeChange}
            placeholder={String(pagination.pageSize)}
            emptyText={t("memoryPolicies.contentManager.pagination.noPageSizes")}
            disabled={disabled}
          />
        </View>
        <Text style={styles.page}>
          {t("memoryPolicies.contentManager.pagination.page", {
            page: pagination.page,
            totalPages: pagination.totalPages,
          })}
        </Text>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || pagination.page <= 1}
          onPress={previousPage}
        >
          {t("memoryPolicies.contentManager.pagination.previous")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || pagination.page >= pagination.totalPages}
          onPress={nextPage}
        >
          {t("memoryPolicies.contentManager.pagination.next")}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  summary: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: theme.spacing[2],
  },
  pageSize: {
    width: 112,
  },
  page: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
  },
}));
