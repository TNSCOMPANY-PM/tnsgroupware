export type PublishChannel = "medium" | "tistory";

export type PublishMode = "import" | "paste";

export type PublishVisibility = "draft" | "public" | "unlisted";

export interface Article {
  channel: PublishChannel;
  mode: PublishMode;
  title: string;
  contentHtml?: string;
  sourceUrl?: string;
  canonicalUrl?: string;
  tags?: string[];
  visibility?: PublishVisibility;
}

export interface PublishResult {
  channel: PublishChannel;
  success: boolean;
  postUrl?: string;
  error?: string;
  startedAt: string;
  finishedAt: string;
}

export interface AuthSessionPath {
  channel: PublishChannel;
  storageStatePath: string;
}
