export interface LarkSubstituteScanDispatchOptions {
  bypassSubstituteDelay: true;
  modeId: string;
}

export function createLarkSubstituteScanDispatchOptions(
  modeId: string,
): LarkSubstituteScanDispatchOptions {
  return {
    bypassSubstituteDelay: true,
    modeId,
  };
}
