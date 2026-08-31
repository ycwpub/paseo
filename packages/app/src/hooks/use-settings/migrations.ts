import { z } from "zod";
import { readValidatedJson } from "@/storage/validated-storage";
import { APP_SETTINGS_KEY, SETTINGS_MIGRATIONS_KEY } from "./keys";
import type { AppSettings, KeyValueStorage, PersistedAppSettings } from "./storage";

const AppliedMigrationsSchema = z.strictObject({ applied: z.array(z.string()) });

/**
 * `sendBehavior` defaulted to "interrupt" for the months before steering existed, and defaults
 * are materialized into storage on first load, so a stored "interrupt" cannot be told apart from
 * a deliberate one. This flips every stored "interrupt" to "steer" exactly once; picking
 * "interrupt" afterwards sticks.
 */
const STEER_DEFAULT_MIGRATION = "steer-default";
const QUEUE_DEFAULT_MIGRATION = "queue-default";

/**
 * Brings stored settings up to date, returning what the caller should use. Owns both writes so
 * the marker can only ever be written after the settings it describes: a failed marker write
 * leaves the migration to re-run harmlessly, while a failed settings write must leave the marker
 * unwritten or the migration is lost for good.
 */
export async function migrateAppSettings(
  settings: AppSettings,
  storage: KeyValueStorage,
  stored?: PersistedAppSettings,
): Promise<AppSettings> {
  const migrationMarker = await readValidatedJson(
    storage,
    SETTINGS_MIGRATIONS_KEY,
    AppliedMigrationsSchema,
  );
  const applied = new Set(migrationMarker?.applied ?? []);
  let migrated = settings;

  if (!applied.has(STEER_DEFAULT_MIGRATION)) {
    migrated =
      migrated.sendBehavior === "interrupt" ? { ...migrated, sendBehavior: "steer" } : migrated;
    applied.add(STEER_DEFAULT_MIGRATION);
  }

  // The branch previously defaulted active-turn submissions to steering. Restore
  // the product behavior where new input queues behind the running turn. As with
  // the earlier default migration, a choice made after this marker is written is
  // preserved.
  if (!applied.has(QUEUE_DEFAULT_MIGRATION)) {
    migrated =
      migrated.sendBehavior === "steer" ? { ...migrated, sendBehavior: "queue" } : migrated;
    applied.add(QUEUE_DEFAULT_MIGRATION);
  }

  if (migrated !== settings) {
    const storedSidebarRowItems = stored?.sidebarRowItems ?? {};
    await storage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        ...stored,
        ...migrated,
        sidebarRowItems: { ...storedSidebarRowItems, ...migrated.sidebarRowItems },
      }),
    );
  }

  await storage.setItem(SETTINGS_MIGRATIONS_KEY, JSON.stringify({ applied: [...applied] }));
  return migrated;
}
