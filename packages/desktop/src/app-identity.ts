import path from "node:path";

const PRODUCTION_APP_NAME = "Paseo";

export interface DesktopAppIdentityInput {
  execPath: string;
  testAppNameOverride?: string;
}

export interface DesktopAppIdentity {
  appName: string;
  isTestBuild: boolean;
}

export function resolveDesktopAppIdentity({
  execPath,
  testAppNameOverride,
}: DesktopAppIdentityInput): DesktopAppIdentity {
  const executableName = path.parse(execPath).name;
  const isTestBuild = executableName.toLowerCase().includes("test");
  const override = testAppNameOverride?.trim();

  return {
    appName: isTestBuild ? override || executableName : PRODUCTION_APP_NAME,
    isTestBuild,
  };
}

export interface DesktopUserDataPathInput {
  appDataPath: string;
  appName: string;
  forcedUserDataDir?: string;
  isPackaged: boolean;
  isTestBuild: boolean;
}

export function resolveEarlyDesktopUserDataPath({
  appDataPath,
  appName,
  forcedUserDataDir,
  isPackaged,
  isTestBuild,
}: DesktopUserDataPathInput): string | null {
  const forcedPath = forcedUserDataDir?.trim();
  if (forcedPath) {
    return forcedPath;
  }

  if (isPackaged && isTestBuild) {
    return path.join(appDataPath, appName);
  }

  return null;
}
