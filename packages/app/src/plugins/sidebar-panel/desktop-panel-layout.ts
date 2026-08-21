export const DESKTOP_PLUGIN_MAIN_CONTENT_MIN_WIDTH = 360;

interface DesktopPluginPanelWidthInput {
  availableWidth: number;
  isDevelopmentPanel: boolean;
}

export function resolveDesktopPluginPanelWidth({
  availableWidth,
  isDevelopmentPanel,
}: DesktopPluginPanelWidthInput): number {
  const minimumWidth = isDevelopmentPanel ? 620 : 420;
  const maximumWidth = isDevelopmentPanel ? 960 : 760;
  const preferredRatio = isDevelopmentPanel ? 0.62 : 0.46;
  const maximumWidthWithMainContent = Math.max(
    0,
    availableWidth - DESKTOP_PLUGIN_MAIN_CONTENT_MIN_WIDTH,
  );
  const effectiveMaximumWidth = Math.min(maximumWidth, maximumWidthWithMainContent);
  const effectiveMinimumWidth = Math.min(minimumWidth, effectiveMaximumWidth);
  const preferredWidth = availableWidth * preferredRatio;

  return Math.round(
    Math.max(effectiveMinimumWidth, Math.min(effectiveMaximumWidth, preferredWidth)),
  );
}
