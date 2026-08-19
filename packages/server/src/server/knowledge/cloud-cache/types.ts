export type CloudKnowledgeScope = "global" | "project";

export interface CloudDocumentCacheTarget {
  scope: CloudKnowledgeScope;
  projectId?: string;
  source: string;
}

export interface CloudDocumentAuthenticationIssue {
  kind: "authentication_required";
  source: string;
  message: string;
  loginUrl: string | null;
  authCommand: string | null;
}

export interface CloudDocumentCacheMetadata {
  version: 1;
  source: string;
  cachedAt: string;
  checkedAt: string;
  contentHash: string;
  etag: string | null;
  lastModified: string | null;
  contentPath: string;
}

export interface CloudDocumentCacheStatus {
  source: string;
  cached: boolean;
  cachedAt: string | null;
  checkedAt: string | null;
  localPath: string | null;
  stale: boolean;
  error: string | null;
  authIssue: CloudDocumentAuthenticationIssue | null;
}

export interface ResolvedCloudDocument extends CloudDocumentCacheStatus {
  content: string | null;
}

export interface CloudDocumentFetchResult {
  content: string;
  etag: string | null;
  lastModified: string | null;
  notModified: boolean;
}
