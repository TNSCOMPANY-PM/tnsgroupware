import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * PR056 — frandoor 별도 supabase 프로젝트 client (ftc_brands_2024 적재).
 * URL/key 미설정 시 throw — 호출자가 try/catch 또는 isFrandoorConfigured 로 사전 점검.
 */

export function isFrandoorConfigured(): boolean {
  return !!(process.env.FRANDOOR_SUPABASE_URL && process.env.FRANDOOR_SUPABASE_SERVICE_ROLE_KEY);
}

export function createFrandoorClient(): SupabaseClient {
  const url = process.env.FRANDOOR_SUPABASE_URL?.trim();
  const key = process.env.FRANDOOR_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("FRANDOOR_SUPABASE_URL / FRANDOOR_SUPABASE_SERVICE_ROLE_KEY 미설정");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
