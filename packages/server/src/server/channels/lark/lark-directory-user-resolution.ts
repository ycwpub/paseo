export interface ResolvedLarkDirectoryUser {
  email: string | null;
  openId: string;
  displayName: string | null;
}

export function resolveLarkDirectoryUserIdentity(input: {
  requestedOpenId: string;
  user:
    | {
        open_id?: string | null;
        email?: string | null;
        enterprise_email?: string | null;
        name?: string | null;
      }
    | null
    | undefined;
}): ResolvedLarkDirectoryUser | null {
  if (!input.user) return null;
  const openId = input.user.open_id?.trim() || input.requestedOpenId.trim();
  if (!openId) return null;
  return {
    email: input.user.email?.trim() || input.user.enterprise_email?.trim() || null,
    openId,
    displayName: input.user.name?.trim() || null,
  };
}
