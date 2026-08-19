import type { ReactNode } from "react";
import type { PluginAppComponent } from "@getpaseo/protocol/messages";

export interface PluginAppComponentSlotContext {
  component: PluginAppComponent;
  form: Readonly<Record<string, unknown>>;
  value: unknown;
  onChange: (value: unknown) => void;
}

export type PluginAppComponentSlot =
  | ReactNode
  | ((context: PluginAppComponentSlotContext) => ReactNode);

export type PluginAppComponentSlots = Readonly<Record<string, PluginAppComponentSlot>>;

export function resolvePluginAppComponentSlot(
  slot: PluginAppComponentSlot,
  context: PluginAppComponentSlotContext,
): ReactNode {
  return typeof slot === "function" ? slot(context) : slot;
}
