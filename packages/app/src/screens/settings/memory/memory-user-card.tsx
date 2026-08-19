import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { PaseoMemoryUser, PaseoMemoryUserOperation } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { settingsStyles } from "@/styles/settings";

export function MemoryUserCard({
  users,
  activeUserId,
  disabled,
  onChange,
}: {
  users: readonly PaseoMemoryUser[];
  activeUserId: string;
  disabled: boolean;
  onChange: (operation: PaseoMemoryUserOperation) => Promise<void>;
}) {
  const { t } = useTranslation();
  const activeUser = users.find((user) => user.id === activeUserId) ?? users[0]!;
  const [name, setName] = useState(activeUser.name);
  const [newUserName, setNewUserName] = useState("");
  useEffect(() => setName(activeUser.name), [activeUser.id, activeUser.name]);

  const options = useMemo<SelectFieldOption<string>[]>(
    () =>
      users.map((user) => ({
        id: user.id,
        value: user.id,
        label: user.name,
        description: user.id,
      })),
    [users],
  );
  const selectedDisplay = useMemo(
    () => ({ label: activeUser.name, description: activeUser.id }),
    [activeUser.id, activeUser.name],
  );
  const selectUser = useCallback(
    (id: string) => {
      void onChange({ type: "select", id });
    },
    [onChange],
  );
  const renameUser = useCallback(() => {
    void onChange({ type: "rename", id: activeUser.id, name: name.trim() });
  }, [activeUser.id, name, onChange]);
  const createUser = useCallback(async () => {
    await onChange({ type: "create", name: newUserName.trim() });
    setNewUserName("");
  }, [newUserName, onChange]);
  const deleteUser = useCallback(() => {
    void onChange({ type: "delete", id: activeUser.id });
  }, [activeUser.id, onChange]);

  return (
    <View style={settingsStyles.card}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("memoryPolicies.users.title")}</Text>
            <Text style={settingsStyles.rowHint}>{t("memoryPolicies.users.description")}</Text>
          </View>
        </View>
        <View style={styles.grid}>
          <View style={styles.field}>
            <SelectField
              label={t("memoryPolicies.users.currentUser")}
              value={activeUser.id}
              selectedDisplay={selectedDisplay}
              options={options}
              onChange={selectUser}
              placeholder={t("memoryPolicies.users.selectUser")}
              emptyText={t("memoryPolicies.users.noUsers")}
              disabled={disabled}
            />
          </View>
          <View style={styles.field}>
            <Field label={t("memoryPolicies.users.userName")}>
              <FormTextInput value={name} onChangeText={setName} editable={!disabled} />
            </Field>
          </View>
        </View>
        <View style={styles.actions}>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || !name.trim() || name.trim() === activeUser.name}
            onPress={renameUser}
          >
            {t("memoryPolicies.users.saveName")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || users.length <= 1}
            onPress={deleteUser}
          >
            {t("memoryPolicies.users.deleteUser")}
          </Button>
        </View>
        <View style={styles.create}>
          <View style={styles.field}>
            <Field label={t("memoryPolicies.users.newUserName")}>
              <FormTextInput
                value={newUserName}
                onChangeText={setNewUserName}
                editable={!disabled}
                placeholder={t("memoryPolicies.users.newUserPlaceholder")}
              />
            </Field>
          </View>
          <Button size="sm" disabled={disabled || !newUserName.trim()} onPress={createUser}>
            {t("memoryPolicies.users.createAndSwitch")}
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  field: {
    flex: 1,
    minWidth: 240,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  create: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: theme.spacing[3],
  },
}));
