import type { PaseoConfigRaw } from "@getpaseo/protocol/messages";

const LARK_DOCUMENT_HOST_SUFFIXES = [".feishu.cn", ".larksuite.com"] as const;

export function normalizeProjectLarkDocumentLinks(links: readonly string[]): string[] {
  return [...new Set(links.map((link) => link.trim()).filter(Boolean))];
}

export function projectLarkDocumentLinks(config: PaseoConfigRaw | null | undefined): string[] {
  return normalizeProjectLarkDocumentLinks(config?.project?.larkDocumentLinks ?? []);
}

export function validateProjectLarkDocumentLink(link: string): boolean {
  const trimmed = link.trim();
  if (!trimmed) return true;
  try {
    const url = new URL(trimmed);
    return (
      url.protocol === "https:" &&
      LARK_DOCUMENT_HOST_SUFFIXES.some(
        (suffix) => url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix),
      )
    );
  } catch {
    return false;
  }
}

export function projectLarkDocumentLinksError(links: readonly string[]): string | null {
  const invalidIndex = links.findIndex((link) => !validateProjectLarkDocumentLink(link));
  if (invalidIndex >= 0) {
    return `第 ${invalidIndex + 1} 个链接不是有效的飞书或 Lark HTTPS 地址。`;
  }
  return null;
}
