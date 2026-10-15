export interface ProjectHttpPermissionAvailability {
  editable: boolean;
  reason: string | null;
}

export function resolveProjectHttpPermissionAvailability(input: {
  featureAdvertised: boolean;
  externalProxyEnabled: boolean;
}): ProjectHttpPermissionAvailability {
  if (!input.featureAdvertised) {
    return {
      editable: false,
      reason: "当前服务器不支持 Debian 外部代理。",
    };
  }
  if (!input.externalProxyEnabled) {
    return {
      editable: false,
      reason: "服务器未开启外部代理，请先在主机设置中开启。",
    };
  }
  return { editable: true, reason: null };
}
