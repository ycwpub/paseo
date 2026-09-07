import type { LarkDirectoryUser } from "@getpaseo/protocol/messages";

export function normalizeLarkContactOpenId(value: string): string {
  const openId = value.trim();
  if (!openId.startsWith("ou_")) {
    throw new Error("请输入有效的 ou_id");
  }
  return openId;
}

export function normalizeLarkContactIdentityQuery(value: string): string {
  const query = value.trim();
  if (!query) {
    throw new Error("请输入用户名或邮箱");
  }
  return query;
}

export function isLarkContactEmailQuery(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim());
}

export function needsLarkContactResolution(user: LarkDirectoryUser): boolean {
  return !user.displayName?.trim() || !user.email?.trim();
}
