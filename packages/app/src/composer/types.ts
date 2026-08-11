import type { AttachmentMetadata, ComposerAttachment } from "@/attachments/types";

export type ImageAttachment = AttachmentMetadata;

export interface MessagePayload {
  text: string;
  attachments: ComposerAttachment[];
  cwd: string;
  forceSend?: boolean;
  selectedMcpServerIds?: string[];
  selectedSkillIds?: string[];
}

export interface TextReplacement {
  key: string;
  text: string;
}
