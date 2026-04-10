export type ConvertTarget = "tistory" | "naver" | "medium";

export interface BlogConvertRequest {
  content: string;
  title: string;
  target: ConvertTarget;
  faq?: { q: string; a: string }[];
  keywords?: string[];
  meta_description?: string;
  schema_markup?: string;
}

export interface BlogConvertResult {
  converted_content: string;
  platform_meta: {
    visibility?: number;
    subtitle?: string;
    [key: string]: unknown;
  };
}
