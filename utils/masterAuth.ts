const MASTER_EMP = "REDACTED_MASTER_EMP";
const MASTER_PW = "REDACTED_MASTER_PW";
const COOKIE_NAME = "tns_master_session";

function getSecret(): string {
  const s =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.MASTER_SESSION_SECRET;
  return s || "tns-master-fallback-secret";
}

export function getMasterCredentials() {
  return { empNumber: MASTER_EMP, password: MASTER_PW };
}

export function isMasterLogin(empNumber: string, password: string): boolean {
  return empNumber.trim() === MASTER_EMP && password === MASTER_PW;
}

/** Node에서 createHmac 사용 (Vercel 서버리스 호환), 그 외에는 Web Crypto */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  try {
    const nodeCrypto = await import("node:crypto");
    return nodeCrypto.createHmac("sha256", secret).update(message).digest("hex");
  } catch {
    // Edge/브라우저: Web Crypto API
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(message)
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createMasterToken(): Promise<string> {
  return hmacSha256Hex(getSecret(), MASTER_EMP);
}

export async function verifyMasterToken(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const expected = await hmacSha256Hex(getSecret(), MASTER_EMP);
    if (token.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < token.length; i++)
      diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

export function getMasterCookieName() {
  return COOKIE_NAME;
}
