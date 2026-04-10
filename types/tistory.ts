export interface TistoryPublishRequest {
  title: string;
  content: string;          // HTML string
  tags?: string[];
  category_id?: number;
  visibility?: 0 | 3;      // 0: 비공개, 3: 발행
}

export interface TistoryPublishResponse {
  postUrl: string;
  postId: string;
}

export interface TistoryUploadResponse {
  url: string;              // CDN URL
  originalUrl: string;
}
