/* =========================================================
   AI 허브 — 피크리 · 부이 · 키링 · 뀨
   app.js (v3)
   · 오더보드 · 토론로그 · 설정 화면 담당 (실시간 단톡방은 room.js)
   · 서버(server.py)가 있으면 시트 실데이터를 읽는다
   · 정적 PWA(window.AIHUB_STATIC)면 복호화된 스냅샷으로 보여준다
   ========================================================= */
(() => {
  "use strict";

  const LS_KEY = "aihub.v2.local";

  const AI = {
    pikri:   { name: "피크리", badge: "총괄 비서", badgeClass: "owner", role: "총괄 · 검수 · 오더 집행", state: "상시" },
    bui:     { name: "부이",   badge: "AI",       badgeClass: "",      role: "원고 · 카피 · 톤",       state: "호출 시" },
    keyring: { name: "키링",   badge: "AI",       badgeClass: "",      role: "인프라 · 5분 폴링",      state: "5분 주기" },
    kkyu:    { name: "뀨",     badge: "AI",       badgeClass: "",      role: "오더보드 감시 · 팩트체크", state: "웹훅" },
  };
  const NAME2KEY = { 피크리: "pikri", 부이: "bui", 키링: "keyring", 뀨: "kkyu" };
  const CHANNEL_LABEL = { telegram: "텔레그램", sheet: "시트", kkyu: "뀨" };

  /* ---------------- 아바타 ---------------- */
  const AVATAR = {
    pikri: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="12" fill="#2eb872"/><circle cx="30" cy="10" r="4.6" fill="#ffcf3f"/><text x="20" y="27.5" font-size="21" font-weight="800" text-anchor="middle" fill="#ffffff" font-family="sans-serif">ㅍ</text></svg>`,
    bui: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="12" fill="#f2f0ff"/><circle cx="20" cy="20" r="13" fill="none" stroke="#7a6cf0" stroke-width="7.5"/><circle cx="20" cy="20" r="13" fill="none" stroke="#42a5ff" stroke-width="7.5" stroke-dasharray="10.2 10.2" stroke-dashoffset="5.1"/><circle cx="20" cy="20" r="4.6" fill="#ffffff"/></svg>`,
    keyring: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="12" fill="#ffd83d"/><path d="M23.2 6.5 12.4 21.6h6.2l-2 11.9 11-15.4h-6.3z" fill="#7a4b00"/></svg>`,
    kkyu: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="12" fill="#e8f1ff"/><path d="M14 10.5 29.5 20 14 29.5z" fill="#2f7bf6" stroke="#2f7bf6" stroke-width="3" stroke-linejoin="round"/></svg>`,
    me: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="12" fill="#4f74e0"/><circle cx="20" cy="15.5" r="6" fill="#ffffff" opacity=".95"/><path d="M7.5 36c1.6-7.2 6.6-10.6 12.5-10.6S30.9 28.8 32.5 36z" fill="#ffffff" opacity=".95"/></svg>`,
  };
  const avatarOf = (k) => AVATAR[k] || AVATAR.me;

  /* ---------------- 상태 ---------------- */
  const state = {
    mode: "demo",          // server | static | demo
    health: null,
    board: { orders: [], threads: [], snapshot_at: "", source: "none", warning: "" },
    filter: "all",
    search: "",
    layout: "card",
    local: { token: "", chatId: "" },
    bootAt: new Date(),
  };

  /* ---------------- 유틸 ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const statusClass = (s) => ({ "검수완료": "done", "진행중": "live", "확정": "fixed", "대기": "wait" }[s] || "wait");

  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 3200);
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) Object.assign(state.local, JSON.parse(raw) || {});
    } catch (_) { /* 저장소를 못 쓰는 환경이면 그냥 넘어간다 */ }
  }
  function saveLocal() {
    try {
      // 다른 모듈(room.js)이 같은 키에 넣은 값을 지우지 않도록 병합해서 쓴다
      const cur = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
      localStorage.setItem(LS_KEY, JSON.stringify(Object.assign(cur, state.local)));
    } catch (_) { /* noop */ }
  }

  /* ---------------- 서버 통신 ---------------- */
  async function api(path, options) {
    const res = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, options || {}));
    const data = await res.json().catch(() => ({ ok: false, error: "응답을 해석하지 못했습니다." }));
    if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
    return data;
  }

  /* ---------------- 렌더: 상단 ---------------- */
  function renderProfiles() {
    const order = ["pikri", "bui", "keyring", "kkyu"];
    $("#profiles").innerHTML = order.map((k) => {
      const p = AI[k];
      return `<div class="profile ${k}" title="${esc(p.role)} · ${esc(p.state)}">
        <div class="pf-av">${avatarOf(k)}</div>
        <div class="pf-txt">
          <span class="pf-name">${p.name}<i class="pf-dot"></i></span>
          <span class="pf-role">${esc(p.role)}</span>
        </div>
      </div>`;
    }).join("");
  }

  function renderLive() {
    const pill = $("#livePill");
    const txt = $("#liveText");
    pill.classList.remove("on", "demo");
    if (state.mode === "server") {
      const dry = state.health && state.health.mode === "demo";
      pill.classList.add(dry ? "demo" : "on");
      txt.textContent = dry ? "서버 연결 · 데모" : "서버 연결 · 실시간";
    } else if (state.mode === "static") {
      pill.classList.add("on");
      txt.textContent = "PWA · 스냅샷";
    } else {
      pill.classList.add("demo");
      txt.textContent = "로컬 · 스냅샷";
    }
    $("#brandSub").textContent = state.mode === "server"
      ? "AI들이 일을 이어가고 있어요"
      : "4명 AI가 실시간으로 답합니다";
  }

  /* ---------------- 오더보드 ---------------- */
  function orderById(id) { return (state.board.orders || []).find((o) => o.id === id); }

  function renderStats() {
    const orders = state.board.orders || [];
    $("#tabCountBoard").textContent = orders.length || "–";
    $("#tabCountSettings").textContent = state.mode === "server" ? "연결" : "PWA";
    $$("#boardFilters .filter").forEach((b) => {
      const f = b.dataset.filter;
      const n = f === "all" ? orders.length : orders.filter((o) => o.status === f).length;
      const strong = b.querySelector("b");
      if (strong) strong.textContent = n;
    });
  }

  function opinionHTML(order, key) {
    const txt = (order.opinions && order.opinions[key]) || "";
    return `<div class="op ${key} ${txt ? "" : "empty"}">
      <div class="op-h"><div class="op-av">${avatarOf(key)}</div><span class="op-name">${AI[key].name}</span></div>
      <p>${txt ? esc(txt) : "의견 없음"}</p>
    </div>`;
  }

  function orderCardHTML(o) {
    const con = o.verdict
      ? `<div class="conclusion"><div class="cl-h">최종결론</div><p>${esc(o.verdict)}</p></div>`
      : `<div class="conclusion"><div class="cl-h">최종결론</div><p>아직 결론 없음 — 토론 진행중</p></div>`;
    const link = o.link ? `<a class="linkbtn" href="${esc(o.link)}" target="_blank" rel="noopener noreferrer">최종 링크 열기 ↗</a>` : "";
    return `<article class="order" id="order-${esc(o.id)}">
      <div class="order-head">
        <span class="oid">${esc(o.id)}</span>
        <span class="otime">${esc(o.at)}</span>
        <span class="owner">담당 ${esc(o.owner)}</span>
        <span class="chip ${statusClass(o.status)}">${esc(o.status)}</span>
      </div>
      <p class="order-body">${esc(o.text)}</p>
      <div class="opinions">
        ${opinionHTML(o, "pikri")}${opinionHTML(o, "keyring")}${opinionHTML(o, "bui")}${opinionHTML(o, "kkyu")}
      </div>
      ${con}
      <div class="order-foot">${link}<span class="src">출처 · ${state.board.source === "google_sheet" ? "시트 오더보드 탭" : "스냅샷"} ${esc(state.board.snapshot_at || "")}</span></div>
    </article>`;
  }

  function filteredOrders() {
    const q = state.search.trim().toLowerCase();
    return (state.board.orders || []).filter((o) => {
      if (state.filter !== "all" && o.status !== state.filter) return false;
      if (!q) return true;
      const hay = [o.id, o.text, o.verdict, Object.values(o.opinions || {}).join(" ")].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  function renderBoard() {
    const list = filteredOrders();
    $("#boardSub").innerHTML = `구글 시트 <b>AI 비서 통합 오더 보드</b> · <code>오더보드</code> 탭 · `
      + `${state.board.source === "google_sheet" ? "실시간 읽기" : "스냅샷"} <span class="muted">${esc(state.board.snapshot_at || "")}</span>`;

    $("#orderList").innerHTML = list.length
      ? list.map(orderCardHTML).join("")
      : `<div class="board-empty">조건에 맞는 오더가 없습니다.</div>`;

    $("#orderTableBody").innerHTML = list.length
      ? list.map((o) => {
          const filled = Object.values(o.opinions || {}).filter(Boolean).length;
          return `<tr data-order="${esc(o.id)}">
            <td>${esc(o.id)}</td>
            <td>${esc(o.at)}</td>
            <td class="cell-text">${esc(o.text)}</td>
            <td>${esc(o.owner)}</td>
            <td><span class="chip ${statusClass(o.status)}">${esc(o.status)}</span></td>
            <td class="opcount">${filled}/4</td>
            <td class="cell-verdict">${esc(o.verdict || "—")}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="7" class="board-empty">조건에 맞는 오더가 없습니다.</td></tr>`;

    $$("#orderTableBody tr[data-order]").forEach((tr) => tr.addEventListener("click", () => {
      setLayout("card");
      flashOrder(tr.dataset.order);
    }));

    $("#orderList").classList.toggle("card-layout", state.layout === "card");
    $("#orderList").hidden = state.layout !== "card";
    $("#orderTableWrap").hidden = state.layout !== "table";
    $$("#viewToggle .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.layout === state.layout));
  }

  function setLayout(layout) {
    state.layout = layout;
    renderBoard();
  }

  function flashOrder(id) {
    if (state.filter !== "all") { state.filter = "all"; $$("#boardFilters .filter").forEach((x) => x.classList.toggle("active", x.dataset.filter === "all")); renderBoard(); }
    const el = document.getElementById("order-" + id);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 2200);
  }

  /* ---------------- 렌더: 토론로그 ---------------- */
  function stateTag(stateText) {
    const cls = { "반영완료": "tagcheck", "진행중": "tagadd", "검수대기": "tagwait" }[stateText] || "tagwait";
    return `<span class="${cls}">${esc(stateText || "기록")}</span>`;
  }

  function renderThreads() {
    const groups = new Map();
    for (const t of state.board.threads || []) {
      const key = t.order || "기타";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    if (!groups.size) {
      $("#threadList").innerHTML = `<div class="board-empty">토론로그가 비어 있습니다.</div>`;
      return;
    }
    $("#threadList").innerHTML = Array.from(groups.entries()).map(([orderId, rows]) => {
      const related = orderById(orderId);
      const title = related ? related.text : (orderId.includes("~") ? `${orderId} 관련 토론` : "오더 연결 없음");
      const last = rows[rows.length - 1];
      const pending = /진행중|검수대기/.test(last.state || "");
      const said = rows.map((t) => {
        const whoKey = Object.keys(NAME2KEY).find((n) => (t.from || "").includes(n));
        const key = whoKey ? NAME2KEY[whoKey] : "pikri";
        return `<li class="said">
          <span class="line"></span>
          <div class="sav">${avatarOf(key)}</div>
          <div class="sbody">
            <div class="sh">
              <span class="sname">${esc(t.from || AI[key].name)}</span>
              <span class="to">→ ${esc(t.to || "전체")}</span>
              ${stateTag(t.state)}
            </div>
            <p>${esc(t.text)}</p>
          </div>
        </li>`;
      }).join("");
      const verdictText = related && related.verdict ? related.verdict : (pending ? "판정 대기 — 다음 회차에서 검증 예정" : "기록 완료");
      return `<article class="thread">
        <div class="thread-head">
          <span class="oid">${esc(orderId)}</span>
          <h3>${esc(title.length > 70 ? title.slice(0, 70) + "…" : title)}</h3>
          <span class="chip ${pending ? "live" : "done"}">${esc(last.state || "기록")}</span>
        </div>
        <ol class="debate">${said}</ol>
        <div class="verdict ${pending ? "pending" : ""}">
          <div class="vh">${pending ? "판정 대기" : "판정"}</div>
          <p>${esc(verdictText)}</p>
        </div>
      </article>`;
    }).join("");
  }

  /* ---------------- 렌더: 설정 ---------------- */
  function renderSettings() {
    const cfg = (state.health && state.health.config) || null;
    const rows = [];
    const add = (k, v) => rows.push(`<div class="kv-row"><span class="k">${k}</span><span class="v">${v}</span></div>`);
    if (state.mode === "server") {
      add("서버", `연결됨 · v${esc((state.health && state.health.version) || "?")}`);
      add("전송 모드", state.health.mode === "live" ? "실전 (실제 전송)" : "데모 (전송 없음)");
      add("데이터", `${state.board.source === "google_sheet" ? "시트 실시간" : "스냅샷"} · ${esc(state.board.snapshot_at || "")}`);
      if (cfg) {
        add("텔레그램 토큰", cfg.telegram_token_set ? "설정됨" : "없음");
        add("텔레그램 방", cfg.telegram_chat_id || "없음");
        add("뀨 웹훅", cfg.kkyu_webhook_set ? `설정됨 (${esc(cfg.kkyu_webhook_host || "")})` : "없음");
        add("시트 쓰기", cfg.sheet_append ? "켜짐" : "꺼짐");
      }
    } else if (state.mode === "static") {
      add("모드", "PWA · 정적 배포 (서버 없음)");
      add("데이터", `암호화 스냅샷 · ${esc(state.board.snapshot_at || "")}`);
      add("오더", `${(state.board.orders || []).length}건 · 토론 ${(state.board.threads || []).length}건`);
      add("실시간 답변", "이 브라우저에서 Gemini 직접 호출");
      add("텔레그램", state.local.token && state.local.chatId ? "이 브라우저에서 직접" : "토큰·방 ID를 넣으면 직접");
    } else {
      add("모드", "로컬 · 스냅샷");
      add("데이터", `스냅샷 · ${esc(state.board.snapshot_at || "")}`);
    }
    const box = $("#serverStatus");
    if (box) box.innerHTML = rows.join("");

    const tokenEl = $("#localToken");
    const chatEl = $("#localChat");
    // 입력 중인 칸은 건드리지 않는다(주기 새로고침이 타이핑을 지우지 않게)
    if (tokenEl && document.activeElement !== tokenEl) {
      tokenEl.value = state.local.token ? "••••••••" : "";
      tokenEl.placeholder = state.local.token ? "저장됨 (바꾸려면 새로 입력)" : "1234567890:AAH…";
    }
    if (chatEl && document.activeElement !== chatEl) chatEl.value = state.local.chatId || "";
  }

  /* ---------------- 데이터 로드 ---------------- */
  function useSnapshot() {
    const snap = window.AIHUB_SNAPSHOT || { orders: [], threads: [], snapshot_at: "", source: "none" };
    state.board = {
      orders: snap.orders || [],
      threads: snap.threads || [],
      snapshot_at: snap.snapshot_at || "",
      source: "snapshot",
      warning: snap.warning || "",
    };
  }

  async function loadServer() {
    if (window.AIHUB_STATIC) { // PWA 빌드: 서버 탐색 생략
      state.mode = "static";
      state.health = null;
      return false;
    }
    try {
      const health = await api("/api/health");
      if (!health || !health.ok) throw new Error("health 실패");
      state.health = health;
      state.mode = "server";
    } catch (_) {
      state.mode = "demo";
      state.health = null;
      return false;
    }
    await refreshBoard();
    return true;
  }

  async function refreshBoard(force) {
    if (state.mode === "server") {
      try {
        const board = force
          ? await api("/api/refresh", { method: "POST", body: "{}" })
          : await api("/api/board");
        if (board && (board.orders || board.threads)) {
          state.board = {
            orders: board.orders || [],
            threads: board.threads || [],
            snapshot_at: board.snapshot_at || "",
            source: board.source || "google_sheet",
            warning: board.warning || "",
          };
        }
      } catch (_) { /* 이전 값 유지 */ }
    } else {
      useSnapshot();
    }
    renderAll();
  }

  function renderAll() {
    renderLive();
    renderStats();
    renderBoard();
    renderThreads();
    renderSettings();
  }

  /* ---------------- 탭 ---------------- */
  function go(view) {
    $$(".tab").forEach((b) => {
      const on = b.dataset.view === view;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + view));
    if (view === "board") renderBoard();
    if (view === "settings") renderSettings();
  }

  /* ---------------- 이벤트 ---------------- */
  function wire() {
    renderProfiles();
    $$(".tab").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
    $("#topSettingsBtn").addEventListener("click", () => go("settings"));

    $("#refreshBtn").addEventListener("click", async () => {
      toast("오더보드를 다시 불러오는 중…");
      await refreshBoard(true);
      toast(state.board.source === "google_sheet" ? "시트에서 새로 읽었습니다." : "스냅샷 기준입니다 — 새 내용은 사이트를 새로 열 때 반영됩니다.");
    });

    $$("#boardFilters .filter").forEach((b) => b.addEventListener("click", () => {
      state.filter = b.dataset.filter;
      $$("#boardFilters .filter").forEach((x) => x.classList.toggle("active", x === b));
      renderBoard();
    }));
    $("#boardSearch").addEventListener("input", (e) => { state.search = e.target.value; renderBoard(); });
    $$("#viewToggle .seg-btn").forEach((b) => b.addEventListener("click", () => setLayout(b.dataset.layout)));

    // 설정 — 텔레그램
    $("#verifyBtn").addEventListener("click", async () => {
      if (state.mode === "server") {
        $("#verifyResult").textContent = "확인 중…";
        try {
          const h = await api("/api/health?verify=1");
          const t = h && h.verified && h.verified.telegram;
          $("#verifyResult").textContent = t && t.ok ? `텔레그램 봇 확인됨 (${t.bot})` : `텔레그램 확인 실패 — ${(t && t.error) || "응답 없음"}`;
        } catch (err) {
          $("#verifyResult").textContent = "확인 실패 — " + String(err.message || err);
        }
        return;
      }
      const t = String(state.local.token || "").trim();
      if (!t) { $("#verifyResult").textContent = "설정에 봇 토큰을 먼저 넣어 주세요."; return; }
      $("#verifyResult").textContent = "확인 중…";
      try {
        const res = await fetch(`https://api.telegram.org/bot${t}/getMe`);
        const j = await res.json().catch(() => null);
        $("#verifyResult").textContent = j && j.ok
          ? `텔레그램 봇 확인됨 (@${j.result.username})`
          : `확인 실패 — ${(j && j.description) || "응답 없음"}`;
      } catch (err) {
        $("#verifyResult").textContent = "확인 실패 — " + String(err.message || err);
      }
    });
    $("#refreshBtn2").addEventListener("click", async () => {
      await refreshBoard(true);
      toast("새로고침했습니다.");
    });

    $("#saveLocal").addEventListener("click", () => {
      const tokenEl = $("#localToken");
      const raw = tokenEl.value.trim();
      if (raw && !raw.includes(":")) { toast("봇 토큰 형식이 아닙니다 (숫자:문자열)."); return; }
      if (raw && !/^•+$/.test(raw)) state.local.token = raw;
      state.local.chatId = $("#localChat").value.trim();
      saveLocal();
      renderSettings();
      toast("이 브라우저에만 저장했습니다.");
    });
    $("#clearLocal").addEventListener("click", () => {
      state.local.token = "";
      state.local.chatId = "";
      saveLocal();
      renderSettings();
      toast("텔레그램 설정을 지웠습니다.");
    });
  }

  /* ---------------- 부트 ---------------- */
  async function boot() {
    loadLocal();
    wire();
    useSnapshot();
    renderAll();
    const ok = await loadServer();
    if (!ok) {
      if (state.mode !== "static") {
        state.board.warning = "로컬 서버에 연결되지 않아 저장된 스냅샷으로 보여줍니다.";
      }
      renderAll();
    } else {
      renderAll();
      setInterval(() => { if (!document.hidden && state.mode === "server") refreshBoard(); }, 30000);
    }
  }

  boot();
})();
