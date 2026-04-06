/**
 * Pushbullet WebSocket 스트림 리스너
 *
 * Pushbullet의 Realtime Event Stream에 연결하여
 * Android 폰에서 미러링된 신한은행 입금 SMS를 실시간으로 감지하고
 * 로컬 웹훅(/api/webhook/deposit)으로 자동 전달합니다.
 *
 * 실행: node scripts/pushbullet-stream.js
 * (npm run dev:full 로 Next.js와 함께 동시 실행 가능)
 */

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const https = require("https");

// ── .env.local에서 환경변수 직접 로딩 ────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const PUSHBULLET_API_KEY = process.env.PUSHBULLET_API_KEY;
const LOCAL_WEBHOOK  = "http://localhost:3000/api/webhook/deposit";
const VERCEL_WEBHOOK = "https://tnsgroupware.vercel.app/api/webhook/deposit";
const FORCE_WEBHOOK_URL = process.env.WEBHOOK_URL || null;
const WEBHOOK_URL = FORCE_WEBHOOK_URL || LOCAL_WEBHOOK;
const STREAM_URL = `wss://stream.pushbullet.com/websocket/${PUSHBULLET_API_KEY}`;

// 재연결 설정
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 60000;
let reconnectDelay = RECONNECT_DELAY_MS;
let ws = null;

// ── 성공 캐시: webhook 성공 후에만 등록 ─────────────────────────────────────
const IDEN_CACHE_FILE = path.join(__dirname, ".pb_processed_idens.json");
const IDEN_MAX_AGE_MS = 48 * 3600_000; // 48시간

function loadIdenCache() {
  try {
    if (!fs.existsSync(IDEN_CACHE_FILE)) return new Map();
    const raw = JSON.parse(fs.readFileSync(IDEN_CACHE_FILE, "utf-8"));
    const now = Date.now();
    const m = new Map();
    for (const [k, v] of Object.entries(raw)) {
      if (now - v < IDEN_MAX_AGE_MS) m.set(k, v);
    }
    return m;
  } catch { return new Map(); }
}

function saveIdenCache(map) {
  try {
    fs.writeFileSync(IDEN_CACHE_FILE, JSON.stringify(Object.fromEntries(map)));
  } catch {}
}

const successCache = loadIdenCache();

function isProcessed(iden) { return successCache.has(iden); }
function markProcessed(iden) {
  successCache.set(iden, Date.now());
  saveIdenCache(successCache);
}

// ── 실패 큐: webhook 실패 건 재시도 ─────────────────────────────────────────
const FAIL_QUEUE_FILE = path.join(__dirname, ".pb_fail_queue.json");
const FAIL_MAX_RETRIES = 10;
const FAIL_RETRY_INTERVAL_MS = 30_000; // 30초마다 재시도

function loadFailQueue() {
  try {
    if (!fs.existsSync(FAIL_QUEUE_FILE)) return [];
    return JSON.parse(fs.readFileSync(FAIL_QUEUE_FILE, "utf-8"));
  } catch { return []; }
}

function saveFailQueue(queue) {
  try {
    fs.writeFileSync(FAIL_QUEUE_FILE, JSON.stringify(queue));
  } catch {}
}

// { iden, smsText, retries, lastAttempt }
let failQueue = loadFailQueue();

function addToFailQueue(iden, smsText) {
  // 이미 큐에 있으면 무시
  if (failQueue.some((q) => q.iden === iden)) return;
  failQueue.push({ iden, smsText, retries: 0, lastAttempt: Date.now() });
  saveFailQueue(failQueue);
  log.warn(`실패 큐에 추가: ${iden} (큐 크기: ${failQueue.length})`);
}

// ── 색상 로그 헬퍼 ────────────────────────────────────────────────────────────
const log = {
  info:  (msg) => console.log(`[${ts()}] ℹ️  ${msg}`),
  ok:    (msg) => console.log(`[${ts()}] ✅ ${msg}`),
  warn:  (msg) => console.log(`[${ts()}] ⚠️  ${msg}`),
  error: (msg) => console.error(`[${ts()}] ❌ ${msg}`),
  recv:  (msg) => console.log(`[${ts()}] 📲 ${msg}`),
};
function ts() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// ── 단일 URL 웹훅 호출 ────────────────────────────────────────────────────────
function postToWebhook(url, smsText, iden) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ sms_text: smsText, iden: iden || undefined });
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const lib = isHttps ? https : require("http");

    const req = lib.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode === 200 && json.ok) {
              resolve(json);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${json.error ?? data}`));
            }
          } catch {
            reject(new Error(`파싱 실패: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}

// 로컬 호출 재시도
const LOCAL_RETRY_DELAY_MS = 2000;
const LOCAL_RETRY_COUNT = 3;

async function postToWebhookWithRetry(url, smsText, iden, retries = LOCAL_RETRY_COUNT) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await postToWebhook(url, smsText, iden);
    } catch (e) {
      if (attempt < retries) {
        log.warn(`로컬 시도 ${attempt}/${retries} 실패 (${e.message}), ${LOCAL_RETRY_DELAY_MS / 1000}초 후 재시도...`);
        await new Promise((r) => setTimeout(r, LOCAL_RETRY_DELAY_MS));
      } else {
        throw e;
      }
    }
  }
}

// ── 웹훅 호출: 성공하면 true, 실패하면 false ─────────────────────────────────
async function callWebhook(smsText, iden) {
  if (FORCE_WEBHOOK_URL) {
    try {
      const json = await postToWebhook(FORCE_WEBHOOK_URL, smsText, iden);
      log.ok(`원장 등록 완료 → ${json.amount?.toLocaleString()}원 / ${json.client_name || "미확인"} (${json.date})`);
      return true;
    } catch (e) {
      log.error(`웹훅 호출 실패 [${FORCE_WEBHOOK_URL}]: ${e.message}`);
      return false;
    }
  }

  // 1순위: 로컬 서버
  try {
    const json = await postToWebhookWithRetry(LOCAL_WEBHOOK, smsText, iden);
    log.ok(`원장 등록 완료 [로컬] → ${json.amount?.toLocaleString()}원 / ${json.client_name || "미확인"} (${json.date})`);
    return true;
  } catch (localErr) {
    log.warn(`로컬 웹훅 실패 (${localErr.message}) → Vercel 폴백...`);
  }

  // 2순위: Vercel (3회 재시도)
  for (let i = 1; i <= 3; i++) {
    try {
      const json = await postToWebhook(VERCEL_WEBHOOK, smsText, iden);
      log.ok(`원장 등록 완료 [Vercel] → ${json.amount?.toLocaleString()}원 / ${json.client_name || "미확인"} (${json.date})`);
      return true;
    } catch (vercelErr) {
      if (i < 3) {
        log.warn(`Vercel 시도 ${i}/3 실패 (${vercelErr.message}), 3초 후 재시도...`);
        await new Promise((r) => setTimeout(r, 3000));
      } else {
        log.error(`Vercel 웹훅도 3회 실패: ${vercelErr.message}`);
      }
    }
  }

  return false;
}

// ── 실패 큐 재시도 루프 ─────────────────────────────────────────────────────
async function processFailQueue() {
  if (failQueue.length === 0) return;

  log.info(`실패 큐 재시도: ${failQueue.length}건`);
  const remaining = [];

  for (const item of failQueue) {
    if (isProcessed(item.iden)) {
      log.info(`이미 성공 처리됨, 큐에서 제거: ${item.iden}`);
      continue;
    }

    if (item.retries >= FAIL_MAX_RETRIES) {
      log.error(`최대 재시도 초과, 영구 실패: ${item.iden} (${item.retries}회 시도)`);
      continue;
    }

    const success = await callWebhook(item.smsText, item.iden);
    if (success) {
      markProcessed(item.iden);
      log.ok(`실패 큐 재시도 성공: ${item.iden}`);
    } else {
      item.retries++;
      item.lastAttempt = Date.now();
      remaining.push(item);
      log.warn(`실패 큐 재시도 실패 (${item.retries}/${FAIL_MAX_RETRIES}): ${item.iden}`);
    }
  }

  failQueue = remaining;
  saveFailQueue(failQueue);
}

// 30초마다 실패 큐 재시도
setInterval(processFailQueue, FAIL_RETRY_INTERVAL_MS);

// ── 신한은행 입금 SMS 판별 ────────────────────────────────────────────────────
function isShinhanDeposit(text) {
  return text.includes("신한") && text.includes("입금");
}

// ── SMS 처리: 수신 → webhook → 성공시만 캐시 등록 ─────────────────────────────
async function handleDeposit(smsText, iden) {
  if (isProcessed(iden)) {
    log.warn(`중복 무시 (성공 캐시): ${iden}`);
    return;
  }

  log.recv(`🏦 신한 입금 SMS 감지!\n${smsText.split("\n").slice(0, 4).join(" | ")}`);

  const success = await callWebhook(smsText, iden);
  if (success) {
    markProcessed(iden);
  } else {
    // 실패 → 큐에 추가 (30초마다 재시도)
    addToFailQueue(iden, smsText);
  }
}

// ── WebSocket 연결 ────────────────────────────────────────────────────────────
function connect() {
  if (!PUSHBULLET_API_KEY) {
    log.error("PUSHBULLET_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요.");
    process.exit(1);
  }

  log.info(`Pushbullet 스트림 연결 중... (웹훅: ${WEBHOOK_URL})`);
  if (failQueue.length > 0) {
    log.warn(`실패 큐에 ${failQueue.length}건 대기 중`);
  }
  ws = new WebSocket(STREAM_URL);

  ws.on("open", () => {
    reconnectDelay = RECONNECT_DELAY_MS;
    log.ok("Pushbullet 스트림 연결됨. 신한은행 입금 SMS 대기 중...");
  });

  ws.on("message", async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === "nop") return;

    if (msg.type === "tickle") {
      log.info(`tickle 수신 (subtype=${msg.subtype})`);
      return;
    }

    log.info(`메시지 수신: ${JSON.stringify(msg).slice(0, 300)}`);

    if (msg.type !== "push" || !msg.push) return;
    const push = msg.push;

    // ── sms_changed ────────────────────────────────────────────────────────
    if (push.type === "sms_changed") {
      const notifications = Array.isArray(push.notifications) ? push.notifications : [];
      for (const notif of notifications) {
        const body = notif.body || "";
        const title = notif.title || "";
        const combined = `${title}\n${body}`;
        const dedupeKey = `sms_${notif.thread_id}_${notif.timestamp}`;

        log.recv(`SMS 수신 — [${title}] ${body.slice(0, 80)}`);

        if (!isShinhanDeposit(combined)) continue;

        await handleDeposit(body, dedupeKey);
      }
      return;
    }

    // ── mirror ─────────────────────────────────────────────────────────────
    if (push.type === "mirror") {
      const iden = push.iden || "";
      const title = push.title || "";
      const body = push.body || "";
      const combined = `${title}\n${body}`;

      log.recv(`알림 수신 — [${push.application_name || "앱"}] ${title}: ${body.slice(0, 60)}`);

      if (!isShinhanDeposit(combined)) return;

      await handleDeposit(combined, iden);
    }
  });

  ws.on("close", (code, reason) => {
    log.warn(`연결 끊김 (code=${code}). ${reconnectDelay / 1000}초 후 재연결...`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  });

  ws.on("error", (err) => {
    log.error(`WebSocket 오류: ${err.message}`);
  });
}

// ── 프로세스 종료 처리 ────────────────────────────────────────────────────────
process.on("SIGINT", () => {
  log.info("종료 중...");
  saveFailQueue(failQueue);
  saveIdenCache(successCache);
  if (ws) ws.close();
  process.exit(0);
});

// ── 시작 ─────────────────────────────────────────────────────────────────────
connect();
