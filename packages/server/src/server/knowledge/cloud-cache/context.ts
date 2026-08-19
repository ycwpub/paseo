import { CloudDocumentCacheStore } from "./store.js";
import type { CloudDocumentCacheService } from "./service.js";
import type {
  CloudDocumentAuthenticationIssue,
  CloudDocumentCacheTarget,
  ResolvedCloudDocument,
} from "./types.js";

export interface CloudKnowledgeResolution {
  documents: ResolvedCloudDocument[];
  authIssues: CloudDocumentAuthenticationIssue[];
}

export async function refreshCloudKnowledgeDocuments(input: {
  service: CloudDocumentCacheService;
  targets: readonly CloudDocumentCacheTarget[];
}): Promise<CloudKnowledgeResolution> {
  const documents = await Promise.all(input.targets.map((target) => input.service.resolve(target)));
  return {
    documents,
    authIssues: documents.flatMap((document) => (document.authIssue ? [document.authIssue] : [])),
  };
}

export function readCachedCloudKnowledgeDocument(input: {
  paseoHome: string;
  target: CloudDocumentCacheTarget;
}): ResolvedCloudDocument {
  const store = new CloudDocumentCacheStore(input.paseoHome);
  const cached = store.readSync(input.target);
  return store.toResolved(cached, input.target, false);
}
