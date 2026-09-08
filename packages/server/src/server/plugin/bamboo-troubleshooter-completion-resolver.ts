import type { AlertTroubleshooterCompletionContext } from "./alert-troubleshooter-manager.js";
import type { AlertTroubleshooterCompletion } from "./alert-troubleshooter-manager.js";
import { parseBambooTroubleshooterCompletion } from "./bamboo-troubleshooter-completion.js";
import {
  publishBambooTroubleshooterDocument,
  type BambooTroubleshooterDocumentPublication,
} from "./bamboo-troubleshooter-document-publisher.js";

export async function resolveBambooTroubleshooterCompletion(
  input: AlertTroubleshooterCompletionContext,
  publishDocument?: (input: {
    config: AlertTroubleshooterCompletionContext["config"];
    record: AlertTroubleshooterCompletionContext["record"];
    workspaceCwd: string;
    wikiTarget: { spaceId: string; parentNodeToken: string };
  }) => Promise<BambooTroubleshooterDocumentPublication>,
): Promise<AlertTroubleshooterCompletion> {
  const result = parseBambooTroubleshooterCompletion(input.message);
  if (result.status !== "succeeded") {
    return {
      status: result.status,
      summary: result.summary,
      ...(result.feishu_doc_url ? { documentUrl: result.feishu_doc_url } : {}),
    };
  }
  if (!input.wikiTarget) {
    if (result.feishu_doc_url?.includes("/wiki/")) {
      return {
        status: result.status,
        summary: result.summary,
        documentUrl: result.feishu_doc_url,
      };
    }
    throw new Error("无法解析当前日报 Base 的 Wiki 节点，不能归档排查文档");
  }
  const publication = await (publishDocument ?? publishBambooTroubleshooterDocument)({
    config: input.config,
    record: input.record,
    workspaceCwd: input.workspaceCwd,
    wikiTarget: input.wikiTarget,
  });
  return {
    status: result.status,
    summary: result.summary,
    documentUrl: publication.documentUrl,
  };
}
