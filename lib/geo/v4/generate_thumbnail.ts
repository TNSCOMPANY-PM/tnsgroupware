/**
 * v4-22 — gpt-image-1 (DALL-E 3 후속) 호출 + Supabase Storage 업로드.
 *
 * 비용: standard 1024x1024 = $0.04/이미지.
 * 시간: ~12-18s.
 * Storage bucket "geo-thumbnails" (public) — 사용자가 frandoor Supabase 에 1회 생성.
 */

import "server-only";
import OpenAI from "openai";
import { createFrandoorClient } from "@/utils/supabase/frandoor";

const STORAGE_BUCKET = "geo-thumbnails";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 미설정");
  _openai = new OpenAI({ apiKey });
  return _openai;
}

export type ThumbnailResult = {
  url: string;
  prompt: string;
  bucket: string;
  path: string;
};

/**
 * gpt-image-1 호출 + Supabase Storage 업로드. publicUrl 반환.
 *
 * @param input.draft_id — Storage object 이름 (`{draft_id}.png`).
 * @param input.prompt   — 영어 prompt (build_image_prompt.ts).
 */
export async function generateAndUploadThumbnail(input: {
  draft_id: string;
  prompt: string;
}): Promise<ThumbnailResult> {
  const openai = getOpenAI();

  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt: input.prompt,
    n: 1,
    size: "1024x1024",
    // gpt-image-1 quality 옵션 — "standard" 가 default 가 아닐 수 있어 명시 X (모델 default 사용).
  });

  const item = response.data?.[0];
  if (!item) throw new Error("OpenAI images.generate returned empty data");

  let imageBuffer: Buffer;
  if (item.b64_json) {
    imageBuffer = Buffer.from(item.b64_json, "base64");
  } else if (item.url) {
    const resp = await fetch(item.url);
    if (!resp.ok) throw new Error(`image fetch failed: ${resp.status}`);
    imageBuffer = Buffer.from(await resp.arrayBuffer());
  } else {
    throw new Error("OpenAI returned neither b64_json nor url");
  }

  const fra = createFrandoorClient();
  const path = `${input.draft_id}.png`;
  const { error: upErr } = await fra.storage
    .from(STORAGE_BUCKET)
    .upload(path, imageBuffer, {
      contentType: "image/png",
      upsert: true,
    });
  if (upErr) {
    throw new Error(`Supabase Storage upload (${STORAGE_BUCKET}/${path}): ${upErr.message}`);
  }

  const { data } = fra.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return {
    url: data.publicUrl,
    prompt: input.prompt,
    bucket: STORAGE_BUCKET,
    path,
  };
}
