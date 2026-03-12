import { createClient } from "@/utils/supabase/client";

const AVATARS_BUCKET = "avatars";
const DOCUMENTS_BUCKET = "documents";

export type UploadResult = { url: string; path: string } | { error: string };

/**
 * 프로필 사진을 avatars 버킷에 업로드하고 공개 URL 반환.
 * 경로: avatars/{empId}/{timestamp}.{ext}
 */
export async function uploadAvatar(empId: string, file: File): Promise<UploadResult> {
  const supabase = createClient();
  if (!supabase.storage) return { error: "Storage not configured" };
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${empId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });
  if (error) return { error: error.message };
  const { data: urlData } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  return { url: urlData.publicUrl, path };
}

/**
 * 문서를 documents 버킷에 업로드하고 공개 URL 반환.
 * 경로: documents/{empId}/{timestamp}_{originalName}
 */
export async function uploadDocument(empId: string, file: File): Promise<UploadResult> {
  const supabase = createClient();
  if (!supabase.storage) return { error: "Storage not configured" };
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${empId}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) return { error: error.message };
  const { data: urlData } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path);
  return { url: urlData.publicUrl, path };
}

/**
 * 버킷 내 파일의 공개 URL 반환 (다운로드/링크용).
 */
export function getPublicUrl(bucket: string, path: string): string {
  const supabase = createClient();
  if (!supabase.storage) return "";
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
