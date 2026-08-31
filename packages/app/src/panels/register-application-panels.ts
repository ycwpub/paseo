import { ensureFeaturePanelsRegistered } from "@/panels/register-feature-panels";
import { ensurePanelsRegistered } from "@/panels/register-panels";

let applicationPanelsRegistered = false;

/**
 * Registers the stable panel catalog first, then applies product extensions.
 * App bootstrap owns this composition so the upstream registry stays generic.
 */
export function ensureApplicationPanelsRegistered(): void {
  if (applicationPanelsRegistered) return;
  ensurePanelsRegistered();
  ensureFeaturePanelsRegistered();
  applicationPanelsRegistered = true;
}
