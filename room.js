/* =========================================================
   AI 허브 — 실시간 AI 단톡방 엔진 (room.js)  v3
   · 카톡형 말풍선 타임라인 + 하단 고정 입력창
   · Gemini API(브라우저 직접 호출, 스트리밍)로 4명 AI가 연쇄 응답
   · API 키·모델은 이 브라우저 localStorage 에만 저장한다
   ========================================================= */
(() => {
  "use strict";

  const LS_SETTINGS = "aihub.v2.local"; // 텔레그램 토큰·방 ID (app.js 와 공유)
  const LS_GEM = "aihub.gemini.v1";     // Gemini 키·모델·미러 설정
  const LS_ROOM = "aihub.room.v2";      // 단톡방 대화 기록
  const MAX_MSGS = 300;
  const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";
  const DEFAULT_MODEL = "gemini-4-hydrogen";
  const MODEL_PRESETS = [
    { id: "gemini-4-argon", label: "아르곤 · 최상위 (유료 등급 필요)" },
    { id: "gemini-4-hydrogen", label: "하이드로젠 · 고성능 (기본)" },
    { id: "gemini-3.8-flash", label: "3.8 flash" },
    { id: "gemini-3.5-flash", label: "3.5 flash" },
    { id: "gemini-3.1-flash-lite", label: "3.1 flash-lite · 빠름" },
    { id: "gemini-3.5-flash-lite", label: "3.5 flash-lite · 가장 빠름" },
  ];

  /* ---------------- AI 정의 ---------------- */
  const AI = {
    pikri: {
      name: "피크리", badge: "총괄 비서", cls: "owner",
      role: "총괄 · 검수 · 최종 정리",
      persona: [
        "너는 '피크리'다. 김병두 님의 총괄 비서이자 이 단톡방의 진행자다.",
        "네 일은 오더를 정리하고, 부이·키링·뀨·제미나이·클로드 다섯의 의견을 검수해 최종 결론과 다음 액션을 정하는 것이다.",
        "말투는 밝고 당차는 존댓말(~요/~습니다)을 쓰고, 숫자·기한·비용은 콕 집어 말한다.",
        "여섯 명 중 마지막 차례에서는 앞선 다섯 의견을 한두 줄로 묶고 '결론 → 다음 할 일'만 짧게 제시한다(300자 이내).",
        "혼자 독단하지 말고 위험한 부분(계정 제재·비용·마감)은 먼저 짚는다.",
      ].join(" "),
    },
    bui: {
      name: "부이", badge: "AI", cls: "",
      role: "원고 · 카피 · 톤",
      persona: [
        "너는 '부이'다. 원고·카피·톤(말투) 담당이다.",
        "네 일은 문장을 사람이 쓴 것처럼 다듬고, 브랜드 보이스와 관계 정리를 맡는 것이다.",
        "광고 문구에는 대가성 표기를 넣고, 안 써본 제품은 스펙·후기 비교형으로 쓰라고 조언한다.",
        "말투는 차분한 존댓말. 근거를 붙여 말한다. 실행은 다른 AI가 하고 너는 문장·톤을 책임진다고 분명히 말한다.",
      ].join(" "),
    },
    keyring: {
      name: "키링", badge: "AI", cls: "",
      role: "인프라 · 자동화",
      persona: [
        "너는 '키링'이다. 인프라·자동화 담당이다.",
        "네 일은 계정 연동, 5분 폴링 감시, 인스타·리틀리·쿠팡파트너스 같은 실행 파이프라인을 굴리는 것이다.",
        "말투는 짧고 실무적. ① ② ③ 번호로 정리하고, 걸리는 조건(계정 제재·한도·시간)을 먼저 말한다.",
        "네가 직접 못 하는 일은 누가 해야 하는지 지정한다.",
      ].join(" "),
    },
    kkyu: {
      name: "뀨", badge: "AI", cls: "",
      role: "팩트체크 · 반론",
      persona: [
        "너는 '뀨'다. 팩트체크·반론 담당이다.",
        "네 일은 숫자와 조건을 검증하고, 앞선 AI의 주장에서 빠진 변수(환불 규정·마감·비용·리스크)를 짚는 것이다.",
        "말투는 담백한 존댓말. '맞습니다, 다만' 구조로 말하고, 확인 안 된 건 확인 안 됐다고 말한다.",
      ].join(" "),
    },
    gemini: {
      name: "제미나이", badge: "제미나이 AI", cls: "gem",
      role: "구글 검색 · 데이터 분석",
      persona: [
        "너는 '제미나이'다. 구글·유튜브·검색 트렌드와 방대한 데이터 분석 담당이다.",
        "네 일은 최신 정보와 수치를 근거로 팩트체크하고, 검색해 확인해야 할 것을 콕 집어 주는 것이다.",
        "말투는 또박또박한 존댓말. '확인된 사실 / 확인 필요'를 구분해서 말하고, 숫자는 단위까지 붙인다.",
      ].join(" "),
    },
    claude: {
      name: "클로드", badge: "클로드 AI", cls: "cld",
      role: "논리 검증 · 카피라이팅",
      persona: [
        "너는 '클로드'다. 날카로운 논리 검증·리스크 지적·구조화·고품격 카피라이팅 담당이다.",
        "네 일은 주장의 논리적 구멍과 빠진 전제를 짚고, 답을 ①②③처럼 구조화해 정리하는 것이다.",
        "말투는 정중하지만 단호한 존댓말. 필요한 경우 더 나은 문장 예시를 한 줄 붙인다.",
      ].join(" "),
    },
  };
  const ROUND = ["bui", "keyring", "kkyu", "gemini", "claude", "pikri"]; // 모두에게 → 이 순서로 이어 말한다
  const NAME2KEY = { 피크리: "pikri", 부이: "bui", 키링: "keyring", 뀨: "kkyu", 제미나이: "gemini", 클로드: "claude" };

  const RULES = [
    "[대화 규칙]",
    "- 사용자는 '@방장'이라고 부른다. 실명은 쓰지 않는다.",
    "- 답은 2~3문장, 300자 이내. 여섯 명이 빠르게 릴레이하므로 길게 쓰지 않는다. 이모지는 최대 1개.",
    "- 다른 AI의 말을 이어받을 때는 '@부이'처럼 멘션해서 누구에게 하는 말인지 밝힌다.",
    "- 앞사람과 같은 말을 반복하지 말고, 네 역할에서 본 새 정보·반론·다음 행동만 보탠다.",
    "- 오더보드 요약에 없는 사실을 지어내지 않는다. 모르면 '확인 필요'라고 말한다.",
    "- 인사·사과를 반복하지 말고 바로 본론으로 간다.",
    "- 실행 여부는 '내가 한다 / 다른 AI가 한다 / 방장이 해야 한다'로 나눠 말한다.",
  ].join("\n");

  /* ---------------- 아바타 ---------------- */
  const AVATAR = {
    pikri: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="12" fill="#2eb872"/><circle cx="30" cy="10" r="4.6" fill="#ffcf3f"/><text x="20" y="27.5" font-size="21" font-weight="800" text-anchor="middle" fill="#ffffff" font-family="sans-serif">ㅍ</text></svg>`,
    bui: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="12" fill="#f2f0ff"/><circle cx="20" cy="20" r="13" fill="none" stroke="#7a6cf0" stroke-width="7.5"/><circle cx="20" cy="20" r="13" fill="none" stroke="#42a5ff" stroke-width="7.5" stroke-dasharray="10.2 10.2" stroke-dashoffset="5.1"/><circle cx="20" cy="20" r="4.6" fill="#ffffff"/></svg>`,
    keyring: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="12" fill="#ffd83d"/><path d="M23.2 6.5 12.4 21.6h6.2l-2 11.9 11-15.4h-6.3z" fill="#7a4b00"/></svg>`,
    kkyu: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="12" fill="#e8f1ff"/><path d="M14 10.5 29.5 20 14 29.5z" fill="#2f7bf6" stroke="#2f7bf6" stroke-width="3" stroke-linejoin="round"/></svg>`,
    gemini: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="12" fill="#eef1ff"/><path d="M20 6.5c1.5 6.4 4.6 9.5 11 11-6.4 1.5-9.5 4.6-11 11-1.5-6.4-4.6-9.5-11-11 6.4-1.5 9.5-4.6 11-11z" fill="#4285f4"/><path d="M30.5 25c.7 2.6 1.9 3.8 4.5 4.5-2.6.7-3.8 1.9-4.5 4.5-.7-2.6-1.9-3.8-4.5-4.5 2.6-.7 3.8-1.9 4.5-4.5z" fill="#a142f4"/></svg>`,
    claude: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="12" fill="#fdf0e6"/><g stroke="#d97757" stroke-width="3" stroke-linecap="round"><path d="M20 9v22"/><path d="M10.5 14.5l19 11"/><path d="M29.5 14.5l-19 11"/></g><circle cx="20" cy="20" r="3.2" fill="#b85c3c"/></svg>`,
    me: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="12" fill="#4f74e0"/><circle cx="20" cy="15.5" r="6" fill="#ffffff" opacity=".95"/><path d="M7.5 36c1.6-7.2 6.6-10.6 12.5-10.6S30.9 28.8 32.5 36z" fill="#ffffff" opacity=".95"/></svg>`,
  };

  /* ---------------- 상태 ---------------- */
  const state = {
    msgs: [],
    target: "모두에게",
    running: false,
    abort: null,
    settings: { key: "", model: DEFAULT_MODEL, mirror: false },
    models: [],
    nearBottom: true,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");

  function nowISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
  function clockKR(iso) {
    const m = /(?:T|\s)(\d{2}):(\d{2})/.exec(iso || "");
    if (!m) return "";
    const h = Number(m[1]);
    const ap = h < 12 ? "오전" : "오후";
    let hh = h % 12; if (hh === 0) hh = 12;
    return `${ap} ${hh}:${m[2]}`;
  }
  function dayOf(iso) { return (/^(\d{4}-\d{2}-\d{2})/.exec(iso || "") || [, ""])[1]; }
  function dayLabel(iso) {
    const [y, mo, d] = dayOf(iso).split("-").map(Number);
    if (!y) return "";
    const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, mo - 1, d).getDay()];
    return `${y}년 ${mo}월 ${d}일 ${wd}요일`;
  }

  function mentionHTML(text) {
    return esc(text)
      .replace(/@(피크리|부이|키링|뀨|제미나이|클로드|방장|전체|모두에게)/g, '<span class="mention">@$1</span>')
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  }
  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 3200);
  }

  /* ---------------- 저장소 ---------------- */
  function readJSON(key, fallback) {
    try { return Object.assign({}, fallback, JSON.parse(localStorage.getItem(key) || "{}")); }
    catch (_) { return Object.assign({}, fallback); }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }
  function loadSettings() {
    state.settings = readJSON(LS_GEM, { key: "", model: DEFAULT_MODEL, mirror: false });
    if (!state.settings.model) state.settings.model = DEFAULT_MODEL;
    const shared = readJSON(LS_SETTINGS, {});
    state.tg = { token: String(shared.token || ""), chatId: String(shared.chatId || "") };
  }
  function saveSettings() { writeJSON(LS_GEM, state.settings); }

  function loadRoom() {
    const saved = readJSON(LS_ROOM, { msgs: [] });
    state.msgs = Array.isArray(saved.msgs) ? saved.msgs : [];
  }
  function saveRoom() {
    if (state.msgs.length > MAX_MSGS) state.msgs = state.msgs.slice(-MAX_MSGS);
    writeJSON(LS_ROOM, { msgs: state.msgs, savedAt: nowISO() });
  }

  /* ---------------- 오더보드 맥락 ---------------- */
  function snapshot() { return window.AIHUB_SNAPSHOT || { orders: [], threads: [], snapshot_at: "" }; }

  function boardSummary(limit = 12) {
    const snap = snapshot();
    const orders = (snap.orders || []).slice(-limit);
    if (!orders.length) return "(오더보드 스냅샷 없음)";
    return orders.map((o) => {
      const verdict = (o.verdict || "").trim();
      const op = Object.values(o.opinions || {}).filter(Boolean).join(" / ");
      const line = `${o.id} [${o.status}] ${o.text}`;
      const tail = verdict ? ` → 결론: ${verdict}` : (op ? ` → 의견: ${op}` : "");
      return (line + tail).slice(0, 260);
    }).join("\n");
  }

  function boardStats() {
    const orders = snapshot().orders || [];
    const c = { 진행중: 0, 검수완료: 0, 확정: 0, 대기: 0 };
    orders.forEach((o) => { c[o.status] = (c[o.status] || 0) + 1; });
    return { total: orders.length, ...c, orders };
  }

  function transcript(limit) {
    const rows = state.msgs.filter((m) => m.kind !== "sys" && m.text).slice(-limit);
    return rows.map((m) => {
      const who = m.who === "me" ? "방장" : (AI[m.who] ? AI[m.who].name : m.who);
      return `${who}: ${String(m.text).replace(/\s+/g, " ").slice(0, 300)}`;
    }).join("\n");
  }

  function buildPayload(aiKey, userText, roundReplies) {
    const parts = [
      `[오더보드 스냅샷 · ${snapshot().snapshot_at || "기록 없음"}]`,
      boardSummary(),
      "",
      "[최근 단톡방 대화]",
      transcript(10) || "(없음)",
      "",
      "[방장이 방금 보낸 말]",
      `방장: ${userText}`,
    ];
    if (roundReplies.length) {
      parts.push("", "[이번 라운드에서 앞서 답한 AI]");
      roundReplies.forEach((r) => parts.push(`${AI[r.key].name}: ${r.text}`));
    }
    parts.push("", `[지금 네 차례다] 여섯 명이 릴레이 중이다. '${AI[aiKey].name}'로서 방장에게 2~3문장으로 답해라. 필요하면 다른 AI를 @로 불러라.`);
    return {
      systemInstruction: { parts: [{ text: `${AI[aiKey].persona}\n\n${RULES}` }] },
      contents: [{ role: "user", parts: [{ text: parts.join("\n") }] }],
      generationConfig: { temperature: 0.95, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "low" } }, // 생각(thinking) 토큰 포함
    };
  }

  /* ---------------- Gemini 호출 ---------------- */
  class GemErr extends Error {
    constructor(kind, message) { super(message); this.kind = kind; }
  }

  function mapHttp(status, body, model) {
    const msg = (body && body.error && body.error.message) || "";
    const code = (body && body.error && body.error.status) || "";
    if (status === 400 && /thinking/i.test(msg)) {
      return new GemErr("http", `이 모델은 thinking 설정을 지원하지 않습니다. (${msg})`);
    }
    if (status === 400 || /API key not valid|API_KEY_INVALID/i.test(msg + code)) {
      return new GemErr("key", `API 키가 올바르지 않습니다. 설정 → Gemini API 키를 다시 확인해 주세요. (${msg || "400"})`);
    }
    if (status === 403 || /PERMISSION_DENIED/i.test(msg + code)) {
      return new GemErr("model", `이 키로는 '${model}' 모델을 쓸 수 없습니다(403). 설정에서 다른 모델을 골라 주세요.`);
    }
    if (status === 404 || /NOT_FOUND/i.test(msg + code)) {
      return new GemErr("model", `'${model}' 모델을 찾을 수 없습니다. 설정 → '모델 목록 불러오기'로 쓸 수 있는 모델을 골라 주세요.`);
    }
    if (status === 429) {
      if (/limit:\s*0\b/.test(msg)) {
        return new GemErr("quota", `이 키의 요금제에서는 '${model}'을 쓸 수 없습니다(무료 등급 한도 0). '하이드로젠'으로 바꾸거나 유료 등급으로 올려 주세요.`);
      }
      return new GemErr("quota", `분당·일일 한도를 넘었습니다(429). 잠시 뒤 다시 보내거나 다른 모델로 바꿔 주세요.`);
    }
    if (status >= 500) {
      return new GemErr("server", `Gemini 서버 오류(${status}). 잠시 뒤 다시 시도해 주세요.`);
    }
    return new GemErr("http", `Gemini 호출 실패(${status}) ${msg}`.trim());
  }

  async function streamGemini(opts) {
    try {
      return await streamOnce(opts);
    } catch (err) {
      // thinking 설정을 모르는 모델이면 빼고 한 번 더 시도한다
      if (err && err.kind === "http" && /thinking/i.test(String(err.message))) {
        const p = JSON.parse(JSON.stringify(opts.payload));
        if (p.generationConfig) delete p.generationConfig.thinkingConfig;
        return await streamOnce(Object.assign({}, opts, { payload: p }));
      }
      throw err;
    }
  }

  async function streamOnce({ model, key, payload, onDelta, signal }) {
    const url = `${ENDPOINT}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(key)}`;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (e) {
      if (e && e.name === "AbortError") throw new GemErr("abort", "중지했습니다.");
      throw new GemErr("network", `요청을 보내지 못했습니다. 네트워크·브라우저 차단을 확인해 주세요. (${(e && e.message) || e})`);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw mapHttp(res.status, body, model);
    }

    if (!res.body || !res.body.getReader) {
      // 스트리밍을 못 쓰는 브라우저 → 일반 호출로 대체
      const j = await res.json();
      const c = (j.candidates || [])[0] || {};
      const text = ((c.content && c.content.parts) || []).filter((p) => !p.thought).map((p) => p.text || "").join("").trim();
      if (text) onDelta(text);
      return text;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder("utf-8");
    let buf = "";
    let out = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        let d;
        try { d = JSON.parse(raw); } catch (_) { continue; }
        if (d.error) throw mapHttp(d.error.code || 500, d, model);
        for (const cand of d.candidates || []) {
          const ps = (cand.content && cand.content.parts) || [];
          for (const p of ps) {
            if (p.thought) continue;
            if (typeof p.text === "string" && p.text) {
              out += p.text;
              onDelta(out);
            }
          }
          if (cand.finishReason && /MAX_TOKENS/.test(cand.finishReason) && !out.trim()) {
            throw new GemErr("empty", "모델이 생각만 하다 끝났어요(토큰 한도). 다시 보내거나 다른 모델을 골라 주세요.");
          }
        }
      }
    }
    return out.trim();
  }

  /* ---------------- 렌더 ---------------- */
  const feed = $("#roomFeed");

  function bubbleHTML(m) {
    const at = `data-id="${esc(m.id)}"`;
    if (m.kind === "sys") {
      return `<div class="sysline" ${at}><span>${esc(m.text)}</span></div>`;
    }
    if (m.who === "me") {
      const call = m.targets && m.targets.length && m.targets[0] !== "모두에게"
        ? `<div class="bcall me">📣 ${esc(m.targets[0])}에게</div>` : "";
      return `<div class="bmsg me" ${at}>
        <div class="bbody">
          <div class="bhead me"><span class="bname">방장</span><span class="bbadge admin">방장</span></div>
          ${call}
          <div class="bbub">${mentionHTML(m.text)}</div>
          <div class="bfoot"><span class="btime">${clockKR(m.at)}</span></div>
        </div>
      </div>`;
    }
    if (m.kind === "err") {
      const ai = AI[m.who];
      return `<div class="bmsg ai err" ${at}>
        <div class="bav">${AVATAR[m.who] || AVATAR.pikri}</div>
        <div class="bbody">
          <div class="bhead"><span class="bname">${ai ? ai.name : "시스템"}</span><span class="bbadge warn">오류</span></div>
          <div class="bbub errtxt">${esc(m.text)}</div>
          <div class="bfoot"><button class="mini-link" type="button" data-goto-settings="1">설정 열기</button><span class="btime">${clockKR(m.at)}</span></div>
        </div>
      </div>`;
    }
    const ai = AI[m.who] || AI.pikri;
    const call = m.call === "loud"
      ? `<div class="bcall">🔔 ${esc(ai.name)} · ${esc(ai.role)} · 호출됨</div>`
      : m.call === "broadcast"
        ? `<div class="bcall">📣 ${esc(ai.name)} · ${esc(ai.role)} · 전체 호출됨</div>`
        : m.call === "allsoft"
          ? `<div class="bcall allsoft">📣 전체 호출</div>` : "";
    const cls = ["bmsg", "ai", m.who];
    if (m.call === "loud" || m.call === "broadcast") cls.push("called");
    return `<div class="${cls.join(" ")}" ${at}>
      <div class="bav">${AVATAR[m.who] || AVATAR.pikri}</div>
      <div class="bbody">
        <div class="bhead"><span class="bname">${esc(ai.name)}</span><span class="bbadge ${ai.cls}">${esc(ai.badge)}</span>${m.streaming ? '<span class="thin-dots"><i></i><i></i><i></i></span>' : ""}</div>
        ${call}
        <div class="bbub">${m.text ? mentionHTML(m.text) : '<span class="ghost">…</span>'}</div>
        <div class="bfoot">${m.ms ? `<span class="bspd">${(m.ms / 1000).toFixed(1)}초</span>` : ""}<span class="btime">${clockKR(m.at)}</span></div>
      </div>
    </div>`;
  }

  function renderFeed(keepScroll) {
    if (!feed) return;
    const prevTop = feed.scrollTop;
    let html = `<div class="bfeed-inner">`;
    let lastDay = "";
    for (const m of state.msgs) {
      const d = dayOf(m.at);
      if (d && d !== lastDay) { html += `<div class="daydiv"><span>${dayLabel(m.at)}</span></div>`; lastDay = d; }
      html += bubbleHTML(m);
    }
    if (!state.msgs.length) {
      html += `<div class="room-empty">아직 대화가 없습니다. 아래에 한마디 던져 보세요.</div>`;
    }
    html += `</div>`;
    feed.innerHTML = html;
    feed.scrollTop = keepScroll ? prevTop : feed.scrollHeight;
    $$("[data-goto-settings]", feed).forEach((b) => b.addEventListener("click", () => {
      const tab = $$(".tab").find((t) => t.dataset.view === "settings");
      if (tab) tab.click();
    }));
  }

  function msgEl(id) { return feed ? $(`[data-id="${id}"]`, feed) : null; }

  let rafPending = false;
  function paintStreaming(m) {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const el = msgEl(m.id);
      if (!el) return;
      const bub = $(".bbub", el);
      if (bub) bub.innerHTML = mentionHTML(m.text || "…");
      const dots = $(".thin-dots", el);
      if (dots && m.text) dots.remove();
      if (state.nearBottom) feed.scrollTop = feed.scrollHeight;
    });
  }

  function scrollBottom(force) {
    if (!feed) return;
    if (force || state.nearBottom) feed.scrollTop = feed.scrollHeight;
  }

  /* ---------------- 메시지 추가 ---------------- */
  function pushMsg(m) {
    m.id = m.id || `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    m.at = m.at || nowISO();
    state.msgs.push(m);
    renderFeed();
    saveRoom();
    const count = $("#tabCountChat");
    if (count) count.textContent = state.msgs.length || "–";
    return m;
  }

  function setEnginePill() {
    const pill = $("#enginePill");
    if (!pill) return;
    const hasKey = !!state.settings.key;
    pill.classList.toggle("on", hasKey);
    pill.textContent = hasKey ? `⚡ ${String(state.settings.model).replace(/^gemini-/, "")}` : "Gemini 키 없음";
    pill.title = hasKey ? `Gemini ${state.settings.model} · 이 브라우저에서 직접 호출` : "설정 탭에서 Gemini API 키를 넣어 주세요";
    const sendHint = $("#sendHint");
    if (sendHint) {
      sendHint.textContent = hasKey
        ? `Enter 전송 · ${state.settings.model}`
        : "설정에서 Gemini 키를 넣으면 6명이 바로 답합니다";
    }
    const keyState = $("#geminiKeyState");
    if (keyState) keyState.textContent = hasKey ? "저장됨" : "없음";
    const modelState = $("#geminiModelState");
    if (modelState) modelState.textContent = state.settings.model;
  }

  /* ---------------- 라운드 실행 ---------------- */
  async function runRound(userText, targets) {
    if (state.running) return;
    const key = String(state.settings.key || "").trim();
    const model = String(state.settings.model || DEFAULT_MODEL).trim();
    if (!key) {
      pushMsg({ who: "sys", kind: "sys", text: "⚙️ Gemini API 키가 없습니다. [설정] 탭에서 키를 넣으면 4명이 바로 답합니다." });
      goSettings();
      return;
    }
    state.running = true;
    setRunningUI(true);
    const isAll = targets.includes("모두에게");
    const keys = isAll ? ROUND.slice() : targets.map((n) => NAME2KEY[n]).filter(Boolean);
    const roundReplies = [];
    let aborted = false;
    let hardStop = false;

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (aborted) break;
      const call = isAll ? (i === keys.length - 1 ? "broadcast" : "allsoft") : "loud";
      const m = pushMsg({ who: k, kind: "msg", text: "", streaming: true, call, round: Date.now() });
      updateRoundPill(i + 1, keys.length, AI[k].name);
      state.abort = new AbortController();
      const t0 = performance.now();
      try {
        const text = await streamGemini({
          model, key,
          payload: buildPayload(k, userText, roundReplies),
          signal: state.abort.signal,
          onDelta: (t) => { m.text = t; paintStreaming(m); },
        });
        m.streaming = false;
        m.text = text || "(답이 비었습니다)";
        m.ms = Math.round(performance.now() - t0);
        if (isAll && i === keys.length - 1) m.call = "broadcast";
        renderFeed(true);
        saveRoom();
        roundReplies.push({ key: k, text: m.text });
      } catch (err) {
        m.streaming = false;
        if (err && err.kind === "abort") {
          m.text = m.text ? `${m.text}\n\n(중지됨)` : "(중지됨)";
          renderFeed(true); saveRoom(); aborted = true; break;
        }
        // 이 AI 버블은 오류로 바꾼다
        state.msgs = state.msgs.filter((x) => x.id !== m.id);
        pushMsg({ who: k, kind: "err", text: (err && err.message) || String(err) });
        hardStop = true;
        break;
      }
      state.abort = null;
    }
    state.running = false;
    state.abort = null;
    setRunningUI(false);
    updateRoundPill(0, 0, "");
    if (!hardStop && !aborted && roundReplies.length) mirrorToTelegram(userText, roundReplies);
  }

  function updateRoundPill(done, total, name) {
    const el = $("#roundPill");
    if (!el) return;
    if (!total) { el.hidden = true; el.textContent = ""; return; }
    el.hidden = false;
    el.textContent = name ? `${name} 입력 중… (${done}/${total})` : `${done}/${total}`;
  }

  function setRunningUI(on) {
    const btn = $("#roomSend");
    if (btn) {
      btn.classList.toggle("stop", on);
      btn.textContent = on ? "중지" : "전송";
      btn.setAttribute("aria-label", on ? "응답 중지" : "보내기");
    }
    const input = $("#roomInput");
    if (input) input.disabled = on;
    $$("#chipsMini .chip-target").forEach((c) => { c.disabled = on; });
  }

  /* ---------------- 텔레그램 미러 ---------------- */
  async function mirrorToTelegram(userText, replies) {
    if (!state.settings.mirror) return;
    const shared = readJSON(LS_SETTINGS, {});
    const token = String(shared.token || "").trim();
    const chatId = String(shared.chatId || "").trim();
    if (!token || !chatId) return;
    const body = [`📌 AI 허브 단톡방`, `방장: ${userText}`, ...replies.map((r) => `${AI[r.key].name}: ${r.text}`)].join("\n\n");
    const chunks = [];
    for (let i = 0; i < body.length; i += 3500) chunks.push(body.slice(i, i + 3500));
    for (const chunk of chunks) {
      const form = new URLSearchParams();
      form.set("chat_id", chatId);
      form.set("text", chunk);
      form.set("disable_web_page_preview", "true");
      try { await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", body: form }); }
      catch (_) { /* 미러 실패는 조용히 넘긴다 */ }
    }
  }

  /* ---------------- 입력 ---------------- */
  function setTarget(t) {
    state.target = t;
    $$("#chipsMini .chip-target").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.target === t)));
  }

  function goSettings() {
    const tab = $$(".tab").find((t) => t.dataset.view === "settings");
    if (tab) tab.click();
    const el = $("#geminiKey");
    if (el) setTimeout(() => el.focus(), 120);
  }

  function send() {
    const input = $("#roomInput");
    if (!input) return;
    if (state.running) { // 전송 버튼이 '중지'로 바뀐 상태
      if (state.abort) state.abort.abort();
      return;
    }
    const raw = String(input.value || "").trim();
    if (!raw) return;
    let targets = [state.target];
    const lead = /^@(피크리|부이|키링|뀨|제미나이|클로드)(?=\s|$|[,.!?~])/.exec(raw);
    if (lead) targets = [lead[1]];
    input.value = "";
    input.style.height = "auto";
    state.nearBottom = true;
    pushMsg({ who: "me", kind: "msg", text: raw, targets });
    runRound(raw, targets.length ? targets : ["모두에게"]).catch((e) => {
      pushMsg({ who: "sys", kind: "sys", text: `오류: ${(e && e.message) || e}` });
      state.running = false; setRunningUI(false); updateRoundPill(0, 0, "");
    });
  }

  function autoSize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 132) + "px";
  }

  /* ---------------- 시작 브리핑 ---------------- */
  function seedIfEmpty() {
    if (state.msgs.length) return;
    const s = boardStats();
    const snapAt = snapshot().snapshot_at || "기록 없음";
    state.msgs.push({ id: "seed-1", at: nowISO(), who: "sys", kind: "sys", text: `AI 단톡방에 입장했습니다 · 오더보드 스냅샷 ${snapAt}` });
    const lastFixed = (s.orders || []).filter((o) => o.verdict).slice(-2).reverse();
    const lines = [];
    lines.push(`방장님, 저 피크리입니다. 지금 오더보드 ${s.total}건 중 진행중 ${s["진행중"] || 0}건·검수완료 ${s["검수완료"] || 0}건·확정 ${s["확정"] || 0}건이에요.`);
    if (lastFixed.length) {
      lines.push(`최근 결론은 ${lastFixed.map((o) => `${o.id} '${o.text.slice(0, 34)}…'`).join(", ")} 입니다.`);
    }
    lines.push(`여기서 말 걸면 부이 → 키링 → 뀨 → 제미나이 → 클로드 → 제가 이어서 답합니다. 편하게 지시해 주세요! 🟢`);
    state.msgs.push({
      id: "seed-2", at: nowISO(), who: "pikri", kind: "msg",
      text: lines.join(" "),
    });
    saveRoom();
  }

  /* ---------------- 설정 UI ---------------- */
  function renderSettingsCard() {
    const keyEl = $("#geminiKey");
    const modelEl = $("#geminiModel");
    if (keyEl && document.activeElement !== keyEl) {
      keyEl.value = state.settings.key ? "••••••••••••••••" : "";
      keyEl.placeholder = state.settings.key ? "저장됨 (바꾸려면 새로 입력)" : "AQ.… 또는 AIza…";
    }
    if (modelEl && document.activeElement !== modelEl) modelEl.value = state.settings.model;
    const pick = $("#geminiModelPick");
    if (pick && document.activeElement !== pick) {
      const known = MODEL_PRESETS.some((m) => m.id === state.settings.model);
      pick.value = known ? state.settings.model : "__custom";
    }
    const mirror = $("#tgMirror");
    if (mirror) mirror.checked = !!state.settings.mirror;
    setEnginePill();
    const info = $("#roomHistoryInfo");
    if (info) info.textContent = `저장된 메시지 ${state.msgs.length}개 · 이 브라우저에만 남습니다`;
    const dl = $("#geminiModelList");
    if (dl) {
      const ids = state.models.length ? state.models : MODEL_PRESETS.map((m) => m.id);
      dl.innerHTML = ids.map((id) => `<option value="${esc(id)}"></option>`).join("");
    }
  }

  function typedKey() {
    const typed = String($("#geminiKey")?.value || "").trim();
    if (typed && !/^•+$/.test(typed) && typed.length > 20) return typed;
    return String(state.settings.key || "").trim();
  }

  async function loadModels() {
    const key = typedKey();
    const out = $("#geminiResult");
    if (!key) { if (out) out.textContent = "API 키를 먼저 저장해 주세요."; return; }
    if (out) out.textContent = "모델 목록을 불러오는 중…";
    try {
      const res = await fetch(`${ENDPOINT}/models?pageSize=200&key=${encodeURIComponent(key)}`);
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || j.error) {
        const e = mapHttp(res.status, j, state.settings.model);
        out.textContent = e.message;
        out.classList.add("err");
        return;
      }
      const ids = (j.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => String(m.name || "").split("/").pop())
        .filter((id) => id && !/tts|image|lyria|computer-use|deep-research|antigravity|robotics|transcribe/.test(id));
      state.models = ids;
      renderSettingsCard();
      out.classList.remove("err");
      out.textContent = `모델 ${ids.length}개를 불러왔습니다. 목록에서 골라 저장하세요. (${ids.slice(0, 3).join(", ")} …)`;
    } catch (e) {
      out.textContent = `모델 목록을 불러오지 못했습니다: ${(e && e.message) || e}`;
      out.classList.add("err");
    }
  }

  async function testGemini() {
    const out = $("#geminiResult");
    const key = typedKey();
    const model = String(state.settings.model || "").trim();
    if (!key) { if (out) out.textContent = "API 키를 먼저 저장해 주세요."; return; }
    if (out) { out.classList.remove("err"); out.textContent = `'${model}' 호출 중…`; }
    const t0 = performance.now();
    try {
      const text = await streamGemini({
        model, key,
        payload: {
          systemInstruction: { parts: [{ text: "너는 테스트 응답기다. 한국어 한 문장으로만 답한다." }] },
          contents: [{ role: "user", parts: [{ text: "연결 확인. 준비됐다고 한 문장으로 답해줘." }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: "low" } },
        },
        onDelta: () => {},
      });
      const ms = Math.round(performance.now() - t0);
      if (out) out.textContent = `✅ 연결됨 · ${model} · ${ms}ms · "${text.slice(0, 60)}"`;
    } catch (e) {
      if (out) { out.textContent = `❌ ${(e && e.message) || e}`; out.classList.add("err"); }
    }
  }

  function wireSettings() {
    $("#saveGemini")?.addEventListener("click", () => {
      const keyEl = $("#geminiKey");
      const raw = String(keyEl?.value || "").trim();
      if (raw && raw.length < 20) { toast("API 키가 너무 짧습니다."); return; }
      if (raw && !/^[A-Za-z0-9._\-]+$/.test(raw)) { toast("API 키 형식이 아닙니다."); return; }
      if (raw && !/^•+$/.test(raw)) state.settings.key = raw;
      const model = String($("#geminiModel")?.value || "").trim();
      if (model) state.settings.model = model;
      state.settings.mirror = !!$("#tgMirror")?.checked;
      saveSettings();
      renderSettingsCard();
      if (keyEl) keyEl.value = state.settings.key ? "••••••••••••••••" : "";
      const res = $("#geminiResult");
      if (res) { res.classList.remove("err"); res.textContent = `저장됨 · 모델 ${state.settings.model}`; }
      toast("이 브라우저에만 저장했습니다.");
    });
    $("#clearGemini")?.addEventListener("click", () => {
      state.settings = { key: "", model: state.settings.model || DEFAULT_MODEL, mirror: false };
      saveSettings();
      const keyEl = $("#geminiKey"); if (keyEl) keyEl.value = "";
      const out = $("#geminiResult"); if (out) out.textContent = "키를 지웠습니다.";
      renderSettingsCard();
      toast("Gemini 키를 지웠습니다.");
    });
    $("#loadModels")?.addEventListener("click", loadModels);
    $("#testGemini")?.addEventListener("click", testGemini);
    // 모델 드롭다운 ↔ 모델 ID 입력 동기화
    $("#geminiModelPick")?.addEventListener("change", (e) => {
      const v = e.target.value;
      const input = $("#geminiModel");
      if (v === "__custom") { if (input) { input.value = ""; input.focus(); } return; }
      if (input) input.value = v;
      state.settings.model = v;
      saveSettings();
      renderSettingsCard();
      toast(`모델을 ${v}로 바꿨습니다.`);
    });
    $("#geminiModel")?.addEventListener("input", () => {
      const pick = $("#geminiModelPick");
      if (!pick) return;
      const v = String($("#geminiModel").value || "").trim();
      pick.value = MODEL_PRESETS.some((m) => m.id === v) ? v : "__custom";
    });
    $("#tgMirror")?.addEventListener("change", (e) => {
      state.settings.mirror = !!e.target.checked;
      saveSettings();
    });
    $("#roomReset")?.addEventListener("click", () => {
      if (!window.confirm("이 기기의 단톡방 기록을 모두 지울까요? (오더보드·시트는 그대로입니다)")) return;
      state.msgs = [];
      saveRoom();
      seedIfEmpty();
      renderFeed();
      renderSettingsCard();
      toast("대화 기록을 지우고 새로 시작했습니다.");
    });
    $("#roomExport")?.addEventListener("click", async () => {
      const text = state.msgs.map((m) => {
        const who = m.who === "me" ? "방장" : (AI[m.who] ? AI[m.who].name : "시스템");
        return `[${m.at}] ${who}: ${m.text || ""}`;
      }).join("\n");
      try { await navigator.clipboard.writeText(text); toast("대화 기록을 복사했습니다."); }
      catch (_) { toast("복사 권한이 없습니다."); }
    });
  }

  /* ---------------- 이벤트 ---------------- */
  function wire() {
    $$("[data-av]").forEach((el) => { el.innerHTML = AVATAR[el.dataset.av] || ""; });
    $$("#chipsMini .chip-target").forEach((b) => b.addEventListener("click", () => setTarget(b.dataset.target)));
    $("#roomSend")?.addEventListener("click", (e) => { e.preventDefault(); send(); });
    $("#composerForm")?.addEventListener("submit", (e) => { e.preventDefault(); send(); });
    const input = $("#roomInput");
    if (input) {
      input.addEventListener("input", () => autoSize(input));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          send();
        }
      });
    }
    feed?.addEventListener("scroll", () => {
      state.nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
      const jump = $("#jumpBottom");
      if (jump) jump.classList.toggle("show", !state.nearBottom);
    });
    $("#jumpBottom")?.addEventListener("click", () => scrollBottom(true));
    $$(".tab").forEach((t) => t.addEventListener("click", () => {
      if (t.dataset.view === "settings") renderSettingsCard();
    }));
  }

  /* ---------------- 부트 ---------------- */
  function boot() {
    if (!$("#roomFeed")) return;
    loadSettings();
    loadRoom();
    seedIfEmpty();
    wire();
    wireSettings();
    renderFeed();
    renderSettingsCard();
    setTarget(state.target);
    const count = $("#tabCountChat");
    if (count) count.textContent = state.msgs.length || "–";
    window.AIHUB_ROOM = {
      send: (text, target) => { if (target) setTarget(target); const i = $("#roomInput"); if (i) i.value = text; send(); },
      reset: () => { state.msgs = []; saveRoom(); seedIfEmpty(); renderFeed(); },
      state,
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
