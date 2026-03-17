/**
 * TNS Workspace - Pushbullet SMS 리스너 (Railway 워커)
 *
 * Railway 환경변수 필요:
 *   PUSHBULLET_API_KEY  = o.xxx...
 *   WEBHOOK_URL         = https://tnsgroupware.vercel.app/api/webhook/deposit
 */

const WebSocket = require("ws");
const https = require("https");
const http = require("http");

const PUSHBULLET_API_KEY = process.env.PUSHBULLET_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://tnsgroupware.vercel.app/api/webhook/deposit";
const STREAM_URL = `wss://stream.pushbullet.com/websocket/${PUSHBULLET_API_KEY}`;

const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;
let reconnectDelay = RECONNECT_BASE_MS;
let ws = null;

const recentIdens = new Set();

// ── 로그 헬퍼 ─────────────────────────────────────────────────────────────────
const ts = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = {
  info:  (m) => console.log(`[${ts()}] ℹ  ${m}`),
  ok:    (m) => console.log(`[${ts()}] ✓  ${m}`),
  warn:  (m) => console.log(`[${ts()}] ⚠  ${m}`),
  error: (m) => console.error(`[${ts()}] ✗  ${m}`),
  recv:  (m) => console.log(`[${ts()}] ★  ${m}`),
};

// ── 웹훅 POST ────────────────────────────────────────────────────────────────
function callWebhook(smsText) {
  return new Promise((resolve) => {
    if (!WEBHOOK_URL) {
      log.error("WEBHOOK_URL 환경변수가 없습니다.");
      return resolve();
    }
    const body = JSON.stringify({ sms_text: smsText });
    const urlObj = new URL(WEBHOOK_URL);
    const lib = urlObj.protocol === "https:" ? https : http;

    const req = lib.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: urlObj.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode === 200 && json.ok) {
              log.ok(`원장 등록 → ${json.amount?.toLocaleString()}원 / ${json.client_name ?? "미확인"} (${json.date})`);
            } else {
              log.warn(`웹훅 응답 ${res.statusCode}: ${json.error ?? data}`);
            }
          } catch {
            log.warn(`웹훅 파싱 실패: ${data}`);
          }
          resolve();
        });
      }
    );
    req.on("error", (e) => {
      log.error(`웹훅 호출 실패: ${e.message}`);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

// ── 신한은행 입금 SMS 판별 ─────────────────────────────────────────────────────
const isShinhan = (t) => t.includes("신한") && t.includes("입금");

// ── WebSocket 연결 ────────────────────────────────────────────────────────────
function connect() {
  if (!PUSHBULLET_API_KEY) {
    log.error("PUSHBULLET_API_KEY 환경변수가 없습니다. Railway 환경변수를 확인하세요.");
    process.exit(1);
  }

  log.info(`Pushbullet 스트림 연결 중... → ${WEBHOOK_URL}`);
  ws = new WebSocket(STREAM_URL);

  ws.on("open", () => {
    reconnectDelay = RECONNECT_BASE_MS;
    log.ok("Pushbullet 연결 완료. 신한은행 입금 SMS 대기 중...");
  });

  ws.on("message", async (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === "nop") return;
    if (msg.type === "tickle") { log.info(`tickle (${msg.subtype})`); return; }
    if (msg.type !== "push" || !msg.push) return;

    const push = msg.push;

    // SMS 수신 이벤트
    if (push.type === "sms_changed") {
      const notifications = Array.isArray(push.notifications) ? push.notifications : [];
      for (const notif of notifications) {
        const body = notif.body || "";
        const title = notif.title || "";
        const combined = `${title}\n${body}`;
        const key = `sms_${notif.thread_id}_${notif.timestamp}`;

        log.recv(`SMS [${title}] ${body.slice(0, 80)}`);
        if (!isShinhan(combined)) continue;
        if (recentIdens.has(key)) { log.warn(`중복 무시: ${key}`); continue; }

        recentIdens.add(key);
        setTimeout(() => recentIdens.delete(key), 3_600_000);
        log.recv(`신한 입금 감지! → ${body}`);
        await callWebhook(body);
      }
      return;
    }

    // 앱 알림 미러링
    if (push.type === "mirror") {
      const iden = push.iden || "";
      const title = push.title || "";
      const body = push.body || "";
      const combined = `${title}\n${body}`;

      log.recv(`알림 [${push.application_name || "앱"}] ${title}: ${body.slice(0, 60)}`);
      if (!isShinhan(combined)) return;
      if (iden && recentIdens.has(iden)) { log.warn(`중복 무시: ${iden}`); return; }
      if (iden) {
        recentIdens.add(iden);
        setTimeout(() => recentIdens.delete(iden), 3_600_000);
      }
      log.recv(`신한 입금 감지! → ${combined}`);
      await callWebhook(combined);
    }
  });

  ws.on("close", (code) => {
    log.warn(`연결 끊김 (${code}). ${reconnectDelay / 1000}초 후 재연결...`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  });

  ws.on("error", (err) => log.error(`WebSocket 오류: ${err.message}`));
}

process.on("SIGINT",  () => { log.info("종료..."); ws?.close(); process.exit(0); });
process.on("SIGTERM", () => { log.info("종료..."); ws?.close(); process.exit(0); });

connect();
