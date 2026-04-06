/**
 * ChatGPT 페이지 내에서 동작하는 content script
 * popup.js에서 메시지를 받아 질문 입력 → 응답 대기 → 스크린샷
 */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "ask_question") {
    handleQuestion(msg.question, msg.index).then(sendResponse);
    return true; // async response
  }
});

async function handleQuestion(question, index) {
  try {
    // 새 대화 시작 (+ 버튼 또는 URL)
    await startNewChat();
    await sleep(2000);

    // 입력창 찾기
    const input = await waitForElement(
      '#prompt-textarea, div[contenteditable="true"][data-placeholder], textarea[placeholder]',
      10000
    );
    if (!input) return { success: false, error: "입력창을 찾을 수 없습니다" };

    // 질문 입력
    input.focus();

    // contenteditable인 경우
    if (input.getAttribute("contenteditable") === "true") {
      input.innerHTML = "";
      const p = document.createElement("p");
      p.textContent = question;
      input.appendChild(p);
    } else {
      // textarea인 경우
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      ).set;
      nativeSetter.call(input, question);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await sleep(500);

    // 전송 버튼 클릭
    const sendBtn = document.querySelector(
      'button[data-testid="send-button"], button[aria-label="Send prompt"], button.bottom-1'
    );
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
    } else {
      // Enter 키로 전송
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }

    await sleep(3000);

    // 응답 완료 대기
    await waitForResponseComplete(90000);
    await sleep(2000);

    // 응답 텍스트 추출
    const responseText = extractLastResponse();

    // 스크린샷 (전체 대화 영역)
    let screenshot = null;
    try {
      const chatArea = document.querySelector('main, [role="presentation"], .flex.flex-col');
      if (chatArea) {
        // html2canvas 없이 간단한 방법: 전체 페이지 캡처는 extension API로
        // content script에서는 텍스트만 반환
      }
    } catch {}

    return { success: true, response: responseText, screenshot };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function startNewChat() {
  // "새 대화" 버튼 찾기
  const newChatBtn = document.querySelector(
    'a[href="/"], button[aria-label*="New chat"], a[data-testid="create-new-chat-button"]'
  );
  if (newChatBtn) {
    newChatBtn.click();
    await sleep(1500);
    return;
  }
  // URL로 이동
  window.location.href = "https://chatgpt.com/";
  await sleep(3000);
}

function extractLastResponse() {
  // 어시스턴트 메시지 중 마지막 것
  const msgs = document.querySelectorAll(
    '[data-message-author-role="assistant"], .agent-turn .markdown'
  );
  if (msgs.length === 0) return "";
  const last = msgs[msgs.length - 1];
  return last.innerText || last.textContent || "";
}

async function waitForResponseComplete(timeout = 60000) {
  const start = Date.now();
  // 먼저 응답이 시작될 때까지 대기
  await sleep(2000);

  while (Date.now() - start < timeout) {
    // "Stop generating" 버튼이 있으면 아직 생성 중
    const stopBtn = document.querySelector(
      'button[aria-label="Stop generating"], button[data-testid="stop-button"]'
    );
    if (!stopBtn) {
      // 생성 완료됨
      return true;
    }
    await sleep(1000);
  }
  return false; // timeout
}

function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) { resolve(el); return; }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { observer.disconnect(); resolve(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
