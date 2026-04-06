const $ = (id) => document.getElementById(id);

let running = false;

// 저장된 설정 로드
chrome.storage.local.get(["apiUrl"], (data) => {
  if (data.apiUrl) $("apiUrl").value = data.apiUrl;
  loadBrands();
});

// ChatGPT 탭인지 확인
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (tab?.url?.includes("chatgpt.com")) {
    $("status").textContent = "ChatGPT 페이지 감지됨";
    $("status").className = "status status-ready";
    $("startBtn").disabled = false;
  }
});

async function loadBrands() {
  const apiUrl = $("apiUrl").value.replace(/\/$/, "");
  try {
    const res = await fetch(`${apiUrl}/api/geo/brands`);
    if (!res.ok) return;
    const brands = await res.json();
    const select = $("brandSelect");
    select.innerHTML = "";
    brands.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.name;
      select.appendChild(opt);
    });
  } catch (e) {
    $("brandSelect").innerHTML = '<option value="">연결 실패</option>';
  }
}

$("apiUrl").addEventListener("change", () => {
  chrome.storage.local.set({ apiUrl: $("apiUrl").value });
  loadBrands();
});

$("startBtn").addEventListener("click", startCheck);
$("stopBtn").addEventListener("click", () => { running = false; });

async function startCheck() {
  const apiUrl = $("apiUrl").value.replace(/\/$/, "");
  const brandId = $("brandSelect").value;
  if (!brandId) { alert("브랜드를 선택하세요"); return; }

  running = true;
  $("startBtn").classList.add("hidden");
  $("stopBtn").classList.remove("hidden");
  $("progressSection").classList.remove("hidden");
  $("resultSection").classList.add("hidden");

  // 1. run 생성
  const createRes = await fetch(`${apiUrl}/api/geo/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brand_id: brandId }),
  });
  if (!createRes.ok) {
    alert("체크 시작 실패");
    resetUI();
    return;
  }
  const { run_id, brand_name, prompts } = await createRes.json();

  // 2. 프롬프트 하나씩 실행
  for (let i = 0; i < prompts.length; i++) {
    if (!running) break;

    const p = prompts[i];
    updateProgress(i + 1, prompts.length, p.prompt_text);

    // content script에 질문 전달
    const tab = await getActiveTab();
    const result = await sendToContent(tab.id, {
      action: "ask_question",
      question: p.prompt_text,
      index: i,
    });

    // API에 결과 저장
    await fetch(`${apiUrl}/api/geo/check`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id,
        prompt_id: p.id,
        prompt_text: p.prompt_text,
        brand_name,
        category: p.category,
      }),
    });

    // 스크린샷은 content script에서 처리
    if (result?.screenshot) {
      // base64 스크린샷을 서버에 업로드할 수도 있지만 일단 로컬 저장
      chrome.storage.local.get(["screenshots"], (data) => {
        const screenshots = data.screenshots || {};
        screenshots[`${run_id}_Q${String(i + 1).padStart(2, "0")}`] = result.screenshot;
        chrome.storage.local.set({ screenshots });
      });
    }
  }

  // 3. 최종 점수 업데이트
  if (running) {
    await fetch(`${apiUrl}/api/geo/check`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id }),
    });
  }

  // 완료
  $("resultSection").classList.remove("hidden");
  $("resultText").textContent = running
    ? `완료! ${prompts.length}개 질문 처리됨. 그룹웨어에서 결과를 확인하세요.`
    : `중지됨. ${$("progressLabel").textContent} 처리됨.`;
  resetUI();
}

function updateProgress(current, total, question) {
  const pct = Math.round((current / total) * 100);
  $("progressLabel").textContent = `${current}/${total}`;
  $("progressPct").textContent = `${pct}%`;
  $("progressFill").style.width = `${pct}%`;
  $("progressQ").textContent = `Q${current}: ${question}`;
}

function resetUI() {
  running = false;
  $("startBtn").classList.remove("hidden");
  $("stopBtn").classList.add("hidden");
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

function sendToContent(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      resolve(response || {});
    });
  });
}
