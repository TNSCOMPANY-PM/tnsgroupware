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
// WEBHOOK_URL 환경변수가 있으면 그것을, 없으면 localhost 우선 + 실패시 Vercel 폴백
const FORCE_WEBHOOK_URL = process.env.WEBHOOK_URL || null;
const STREAM_URL = `wss://stream.pushbullet.com/websocket/${PUSHBULLET_API_KEY}`;

// 재연결 설정
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 60000;
let reconnectDelay = RECONNECT_DELAY_MS;
let ws = null;

// 중복 방지: 최근 처리된 알림 ID 캐시 (메모리)
const recentIdens = new Set();

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
function postToWebhook(url, smsText) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ sms_text: smsText });
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
        timeout: 8000,
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

// ── 웹훅 호출 (localhost 우선, 실패 시 Vercel 자동 폴백) ────────────────────
async function callWebhook(smsText) {
  // WEBHOOK_URL 환경변수가 명시된 경우 그것만 사용
  if (FORCE_WEBHOOK_URL) {
    try {
      const json = await postToWebhook(FORCE_WEBHOOK_URL, smsText);
      log.ok(`원장 등록 완료 → ${json.amount?.toLocaleString()}원 / ${json.client_name || "미확인"} (${json.date})`);
    } catch (e) {
      log.error(`웹훅 호출 실패 [${FORCE_WEBHOOK_URL}]: ${e.message}`);
    }
    return;
  }

  // 1순위: 로컬 서버
  try {
    const json = await postToWebhook(LOCAL_WEBHOOK, smsText);
    log.ok(`원장 등록 완료 [로컬] → ${json.amount?.toLocaleString()}원 / ${json.client_name || "미확인"} (${json.date})`);
    return;
  } catch (localErr) {
    log.warn(`로컬 웹훅 실패 (${localErr.message}) → Vercel 웹훅으로 폴백 시도...`);
  }

  // 2순위: Vercel 프로덕션 (로컬 서버가 꺼져 있어도 입금 기록 유실 방지)
  try {
    const json = await postToWebhook(VERCEL_WEBHOOK, smsText);
    log.ok(`원장 등록 완료 [Vercel] → ${json.amount?.toLocaleString()}원 / ${json.client_name || "미확인"} (${json.date})`);
  } catch (vercelErr) {
    log.error(`Vercel 웹훅도 실패: ${vercelErr.message}`);
  }
}

// ── 신한은행 입금 SMS 판별 ────────────────────────────────────────────────────
function isShinhanDeposit(text) {
  return text.includes("신한") && text.includes("입금");
}

// ── WebSocket 연결 ────────────────────────────────────────────────────────────
function connect() {
  if (!PUSHBULLET_API_KEY) {
    log.error("PUSHBULLET_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요.");
    process.exit(1);
  }

  log.info(`Pushbullet 스트림 연결 중... (웹훅: ${WEBHOOK_URL})`);
  ws = new WebSocket(STREAM_URL);

  ws.on("open", () => {
    reconnectDelay = RECONNECT_DELAY_MS; // 성공 시 지연 리셋
    log.ok("Pushbullet 스트림 연결됨. 신한은행 입금 SMS 대기 중...");
  });

  ws.on("message", async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    // nop (heartbeat) 무시
    if (msg.type === "nop") return;

    // tickle(데이터변경 알림) 로그
    if (msg.type === "tickle") {
      log.info(`tickle 수신 (subtype=${msg.subtype})`);
      return;
    }

    // 모든 push 메시지 원문 출력 (디버깅)
    log.info(`메시지 수신: ${JSON.stringify(msg).slice(0, 300)}`);

    if (msg.type !== "push" || !msg.push) return;
    const push = msg.push;

    // ── sms_changed: SMS 수신 이벤트 ────────────────────────────────────────
    if (push.type === "sms_changed") {
      const notifications = Array.isArray(push.notifications) ? push.notifications : [];
      for (const notif of notifications) {
        const body = notif.body || "";
        const title = notif.title || "";
        const combined = `${title}\n${body}`;
        const dedupeKey = `sms_${notif.thread_id}_${notif.timestamp}`;

        log.recv(`SMS 수신 — [${title}] ${body.slice(0, 80)}`);

        if (!isShinhanDeposit(combined)) continue;

        if (recentIdens.has(dedupeKey)) {
          log.warn(`중복 SMS 무시: ${dedupeKey}`);
          continue;
        }
        recentIdens.add(dedupeKey);
        setTimeout(() => recentIdens.delete(dedupeKey), 3600_000);

        log.recv(`🏦 신한 입금 SMS 감지!\n${body}`);
        await callWebhook(body);
      }
      return;
    }

    // ── mirror: 앱 알림 미러링 ───────────────────────────────────────────────
    if (push.type === "mirror") {
      const iden = push.iden || "";
      const title = push.title || "";
      const body = push.body || "";
      const combined = `${title}\n${body}`;

      log.recv(`알림 수신 — [${push.application_name || "앱"}] ${title}: ${body.slice(0, 60)}`);

      if (!isShinhanDeposit(combined)) return;

      if (iden && recentIdens.has(iden)) {
        log.warn(`중복 알림 무시: ${iden}`);
        return;
      }
      if (iden) {
        recentIdens.add(iden);
        setTimeout(() => recentIdens.delete(iden), 3600_000);
      }

      log.recv(`🏦 신한 입금 SMS 감지!\n${combined}`);
      await callWebhook(combined);
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
  if (ws) ws.close();
  process.exit(0);
});

// ── 시작 ─────────────────────────────────────────────────────────────────────
connect();
