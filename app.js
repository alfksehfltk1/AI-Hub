/* =========================================================
   AI 허브 — 피크리 · 부이 · 키링 · 뀨
   app.js (v2)
   · 서버(server.py)가 있으면 시트 실데이터 + 실제 전송
   · 없으면 data/snapshot.js 스냅샷 + 데모 모드
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
  const TARGETS = ["모두에게", "피크리", "부이", "키링", "뀨"];
  const NAME2KEY = { 피크리: "pikri", 부이: "bui", 키링: "keyring", 뀨: "kkyu" };
  const KEY2NAME = { pikri: "피크리", bui: "부이", keyring: "키링", kkyu: "뀨" };
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
    mode: "demo",          // server | demo
    health: null,
    board: { orders: [], threads: [], snapshot_at: "", source: "none", warning: "" },
    items: [],
    target: "모두에게",
    filter: "all",
    search: "",
    layout: "card",
    sending: false,
    local: { token: "", chatId: "" },
    bootAt: new Date(),
  };

  /* ---------------- 유틸 ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");

  function timeKR(d = new Date()) {
    const h = d.getHours();
    const ap = h < 12 ? "오전" : "오후";
    let hh = h % 12; if (hh === 0) hh = 12;
    return `${ap} ${hh}:${pad(d.getMinutes())}`;
  }
  function stamp(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function localISO(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function dayLabel(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    if (!m) return iso || "";
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, mo - 1, d).getDay()];
    return `${y}년 ${mo}월 ${d}일 (${wd})`;
  }
  const dayOf = (iso) => (/^(\d{4}-\d{2}-\d{2})/.exec(iso || "") || [, ""])[1];
  function clockOf(iso) {
    const m = /(\d{2}):(\d{2})/.exec(iso || "");
    if (!m) return "";
    const h = Number(m[1]);
    const ap = h < 12 ? "오전" : "오후";
    let hh = h % 12; if (hh === 0) hh = 12;
    return `${ap} ${hh}:${m[2]}`;
  }
  const statusClass = (s) => ({ "검수완료": "done", "진행중": "live", "확정": "fixed", "대기": "wait" }[s] || "wait");

  function mentionHTML(text) {
    return esc(text).replace(/@(피크리|부이|키링|뀨|전체|모두에게)/g, '<span class="mention">@$1</span>');
  }
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 3600);
  }
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) Object.assign(state.local, JSON.parse(raw) || {});
    } catch (_) { /* 저장소를 못 쓰는 환경이면 그냥 넘어간다 */ }
  }
  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state.local)); } catch (_) { /* noop */ }
  }

  /* ---------------- 서버 통신 ---------------- */
  async function api(path, options) {
    const res = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, options || {}));
    const data = await res.json().catch(() => ({ ok: false, error: "응답을 해석하지 못했습니다." }));
    if (!res.ok && !data.error) data.error = `HTTP ${res.status}`;
    return data;
  }

  /* ---------------- 스냅샷 → 타임라인 ---------------- */
  function buildLocalTimeline(board) {
    const items = [];
    for (const o of board.orders || []) {
      const at = (o.at || "").replace(" ", "T");
      items.push({ id: `ord-${o.id}`, at, who: "me", kind: "instruction", order_id: o.id, targets: [o.owner || "전체"], text: o.text, source: "sheet" });
      for (const k of ["pikri", "keyring", "bui", "kkyu"]) {
        const t = (o.opinions || {})[k];
        if (t) items.push({ id: `op-${o.id}-${k}`, at, who: k, kind: "opinion", order_id: o.id, text: t, source: "sheet" });
      }
      if (o.verdict) items.push({ id: `vd-${o.id}`, at, who: "pikri", kind: "decision", order_id: o.id, text: o.verdict, link: o.link, source: "sheet" });
    }
    for (const t of board.threads || []) {
      items.push({
        id: `db-${t.at}-${(t.text || "").slice(0, 12)}`, at: (t.at || "").replace(" ", "T"),
        who: Object.keys(NAME2KEY).find((n) => (t.from || "").includes(n)) ? NAME2KEY[Object.keys(NAME2KEY).find((n) => (t.from || "").includes(n))] : "pikri",
        kind: "debate", order_id: t.order, to: t.to, state: t.state, text: t.text, source: "sheet",
      });
    }
    items.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return items;
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
    } else {
      pill.classList.add("demo");
      txt.textContent = "PWA · 스냅샷";
    }
    const route = $("#ocRoute");
    if (state.mode === "server" && state.health && state.health.mode === "live") {
      route.textContent = "실제 전송 모드";
      route.classList.add("live");
    } else {
      const hasTg = !!(state.local.token && state.local.chatId);
      route.textContent = hasTg ? "텔레그램 직접 전송" : "PWA — 설정에서 토큰 입력";
      route.classList.toggle("live", hasTg);
    }
    $("#brandSub").textContent = state.mode === "server"
      ? "AI들이 일을 이어가고 있어요"
      : "AI들이 일을 이어가고 있어요 · 스냅샷 보기";
  }

  /* ---------------- 렌더: 타임라인 ---------------- */
  const feed = $("#feed");

  function orderById(id) { return (state.board.orders || []).find((o) => o.id === id); }

  function deliveryChips(delivery) {
    if (!delivery) return "";
    const keys = ["telegram", "sheet", "kkyu"];
    const chips = keys.map((k) => {
      const d = delivery[k] || {};
      let cls = "skip", mark = "–";
      if (d.ok === true) { cls = "ok"; mark = "✓"; }
      else if (d.ok === false) { cls = "fail"; mark = "✕"; }
      const title = d.detail ? ` title="${esc(d.detail)}"` : "";
      return `<span class="d-chip ${cls}"${title}>${CHANNEL_LABEL[k]} ${mark}</span>`;
    });
    if (delivery.__demo) chips.push(`<span class="d-chip skip">데모</span>`);
    return `<div class="delivery">${chips.join("")}</div>`;
  }

  function orderChip(id) {
    const o = orderById(id);
    if (!o) return "";
    return `<button class="order-chip" type="button" data-order="${esc(id)}">
      <span class="oc-id">${esc(id)}</span><span>오더보드에서 보기</span>
      <span class="oc-st ${statusClass(o.status)}">${esc(o.status)}</span>
    </button>`;
  }

  function messageHTML(m) {
    if (m.kind === "decision") {
      return `<div class="msg ai ${esc(m.who)}" data-id="${esc(m.id)}">
        <div class="avatar">${avatarOf(m.who)}</div>
        <div class="msg-main">
          <div class="msg-head"><span class="name">${AI[m.who] ? AI[m.who].name : "피크리"}</span><span class="badge">결정</span></div>
          <div class="decision">
            <div class="dh">최종 결정 · ${esc(m.order_id || "")}</div>
            <p>${esc(m.text)}</p>
            ${m.link ? `<a href="${esc(m.link)}" target="_blank" rel="noopener noreferrer">최종 링크 열기 ↗</a>` : ""}
          </div>
          <div class="msg-foot"><span class="time">${clockOf(m.at)}</span></div>
        </div>
      </div>`;
    }

    const isMe = m.who === "me";
    const who = isMe ? { name: "나", badge: "방장", badgeClass: "admin" } : AI[m.who];
    if (!who) return "";
    const targets = Array.isArray(m.targets) ? m.targets : [];
    const callLabel = isMe && targets.length
      ? `<div class="calllabel">📣 ${esc(targets.join(" · "))}</div>` : "";
    const debateHead = !isMe && m.kind === "debate"
      ? `<span class="to">→ ${esc(m.to || "전체")}</span>${m.state ? `<span class="badge tag">${esc(m.state)}</span>` : ""}` : "";
    const kindBadge = !isMe && m.kind === "opinion" ? `<span class="badge">의견</span>` : "";
    const chip = m.order_id && m.kind === "instruction" ? orderChip(m.order_id) : "";
    const bubbleClass = "bubble" + (isMe ? " user" : "") + (isMe && targets.length ? " called" : "");

    return `
      <div class="msg ${isMe ? "me" : "ai " + esc(m.who)}" data-id="${esc(m.id)}">
        ${isMe ? "" : `<div class="avatar">${avatarOf(m.who)}</div>`}
        <div class="msg-main">
          <div class="msg-head">
            <span class="name">${who.name}</span>
            <span class="badge ${who.badgeClass || ""}">${who.badge}</span>
            ${kindBadge}${debateHead}
          </div>
          <div class="${bubbleClass}">${callLabel}${mentionHTML(m.text)}${isMe ? deliveryChips(m.delivery) : ""}${chip}</div>
          <div class="msg-foot"><span class="time">${clockOf(m.at)}</span></div>
        </div>
        ${isMe ? `<div class="avatar">${avatarOf("me")}</div>` : ""}
      </div>`;
  }

  function scrollFeedBottom() {
    feed.scrollTop = feed.scrollHeight;
  }

  function renderTimeline() {
    const items = state.items.slice();
    let html = `<div class="feed-inner">`;
    let lastDay = "";
    let sysShown = false;
    if (state.board.source !== "google_sheet" && state.board.warning) {
      html += `<div class="sysmsg"><span>${esc(state.board.warning)}</span></div>`;
      sysShown = true;
    }
    for (const m of items) {
      const d = dayOf(m.at);
      if (d && d !== lastDay) {
        html += `<div class="daydiv"><span>${dayLabel(m.at)}</span></div>`;
        lastDay = d;
      }
      html += messageHTML(m);
    }
    if (!items.length) {
      html += `<div class="board-empty">아직 대화가 없습니다. 위에서 지시를 남겨보세요.</div>`;
    }
    html += `</div>`;
    feed.innerHTML = html;

    const notes = [];
    notes.push(`최근 ${items.length}개`);
    if (state.board.snapshot_at) notes.push(`${state.board.source === "google_sheet" ? "시트" : "스냅샷"} ${state.board.snapshot_at}`);
    $("#roomNote").textContent = notes.join(" · ");

    $$("[data-order]", feed).forEach((b) => b.addEventListener("click", () => {
      go("board");
      flashOrder(b.dataset.order);
    }));
    if (!sysShown) { /* 안내 없음 */ }
    scrollFeedBottom();
  }

  /* ---------------- 렌더: 사이드 ---------------- */
  function renderStats() {
    const orders = state.board.orders || [];
    const counts = { 진행중: 0, 검수완료: 0, 확정: 0, 대기: 0 };
    orders.forEach((o) => { if (counts[o.status] === undefined) counts[o.status] = 0; counts[o.status] += 1; });
    $("#orderStats").innerHTML = `
      <div class="stat"><b>${orders.length}</b><span>전체 오더</span></div>
      <div class="stat live"><b>${counts["진행중"] || 0}</b><span>진행중</span></div>
      <div class="stat done"><b>${counts["검수완료"] || 0}</b><span>검수완료</span></div>
      <div class="stat fixed"><b>${counts["확정"] || 0}</b><span>확정</span></div>`;
    $("#tabCountChat").textContent = state.items.length || "–";
    $("#tabCountBoard").textContent = orders.length || "–";
    $("#tabCountSettings").textContent = state.mode === "server" ? "연결" : "PWA";
    $$("#boardFilters .filter").forEach((b) => {
      const f = b.dataset.filter;
      const n = f === "all" ? orders.length : orders.filter((o) => o.status === f).length;
      const strong = b.querySelector("b");
      if (strong) strong.textContent = n;
    });
  }

  function renderDecisions() {
    const list = (state.board.orders || []).filter((o) => o.verdict).slice(-3).reverse();
    $("#decisionList").innerHTML = list.length
      ? list.map((o) => `<li><b>${esc(o.id)} · ${esc(o.status)}</b>${esc(o.verdict).slice(0, 96)}${o.verdict.length > 96 ? "…" : ""}</li>`).join("")
      : `<li class="empty">아직 확정된 결정이 없습니다.</li>`;
  }

  function renderConns() {
    const cfg = (state.health && state.health.config) || null;
    const board = state.board;
    const rows = [];
    const dot = (cls) => `<span class="cdot ${cls}"></span>`;
    rows.push(`<li>${dot(state.mode === "server" ? "ok" : "warn")}로컬 서버<span class="cval">${state.mode === "server" ? "연결" : "미연결"}</span></li>`);
    rows.push(`<li>${dot(board.source === "google_sheet" ? "ok" : "warn")}구글 시트 오더보드<span class="cval">${board.source === "google_sheet" ? board.orders.length + "건" : "스냅샷"}</span></li>`);
    if (cfg) {
      rows.push(`<li>${dot(cfg.telegram_token_set && cfg.telegram_chat_id ? "ok" : "off")}텔레그램 방<span class="cval">${cfg.telegram_token_set && cfg.telegram_chat_id ? "설정됨" : "미설정"}</span></li>`);
      rows.push(`<li>${dot(cfg.sheet_append ? "ok" : "off")}시트 쓰기<span class="cval">${cfg.sheet_append ? "켜짐" : "꺼짐"}</span></li>`);
      rows.push(`<li>${dot(cfg.kkyu_webhook_set ? "ok" : "off")}뀨 웹훅<span class="cval">${cfg.kkyu_webhook_set ? esc(cfg.kkyu_webhook_host || "설정됨") : "미설정"}</span></li>`);
      rows.push(`<li>${dot(state.health.mode === "live" ? "ok" : "warn")}전송 모드<span class="cval">${state.health.mode === "live" ? "실제 전송" : "데모"}</span></li>`);
    } else {
      rows.push(`<li>${dot("off")}텔레그램 · 시트 쓰기 · 뀨 웹훅<span class="cval">서버 필요</span></li>`);
    }
    $("#connList").innerHTML = rows.join("");
    $("#connFine").innerHTML = state.mode === "server"
      ? `시트 <b>${esc((cfg && cfg.tabs && cfg.tabs.orders) || "오더보드")}</b> 탭을 직접 읽습니다.`
      : `PWA 버전 — 마지막 스냅샷으로 보는 중입니다. 지시는 설정의 토큰으로 텔레그램에 바로 나갑니다.`;
  }

  /* ---------------- 렌더: 오더보드 ---------------- */
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
        add(".env 파일", cfg.env_file ? "있음" : "없음 (환경변수 사용)");
      }
    } else {
      add("모드", "PWA · 스냅샷 (서버 없음)");
      add("데이터", `스냅샷 · ${esc(state.board.snapshot_at || "")}`);
      add("텔레그램 전송", state.local.token && state.local.chatId ? "이 브라우저에서 직접" : "토큰·방 ID를 넣으면 직접");
      add("시트 · 뀨", "서버 필요 (이 버전 미지원)");
    }
    $("#serverStatus").innerHTML = rows.join("");
    const tokenEl = $("#localToken");
    const chatEl = $("#localChat");
    // 입력 중인 칸은 건드리지 않는다(주기 새로고침이 타이핑을 지우지 않게)
    if (document.activeElement !== tokenEl) {
      tokenEl.value = state.local.token ? "••••••••" : "";
      tokenEl.placeholder = state.local.token ? "저장됨 (바꾸려면 새로 입력)" : "1234567890:AAH…";
    }
    if (document.activeElement !== chatEl) chatEl.value = state.local.chatId || "";
  }

  /* ---------------- 지시 남기기 ---------------- */
  function setTarget(t) {
    if (!TARGETS.includes(t)) return;
    state.target = t;
    $$(".chip-target").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.target === t)));
    const hint = t === "모두에게"
      ? "텔레그램 방 · 시트 오더보드 · 뀨 웹훅으로 나갑니다"
      : t === "뀨"
        ? "텔레그램 방 · 시트 오더보드 · 뀨 웹훅으로 나갑니다"
        : `텔레그램 방 · 시트 오더보드로 나갑니다 (대상 ${t})`;
    $("#ocHint").textContent = state.mode === "server" && state.health && state.health.mode === "live"
      ? hint
      : (state.local.token && state.local.chatId)
        ? "이 브라우저에서 텔레그램 방으로 바로 보냅니다 (시트 기록은 서버 필요)"
        : "토큰·방 ID 넣으면 텔레그램으로 바로 전송";
  }

  function showResult(html, isError) {
    const box = $("#ocResult");
    box.innerHTML = html;
    box.classList.toggle("err", !!isError);
    box.hidden = false;
    // 결과 상자가 생기면 피드 높이가 줄어드니 아래로 다시 맞춘다
    requestAnimationFrame(scrollFeedBottom);
  }

  function deliverySummary(delivery) {
    if (!delivery) return "";
    const parts = ["telegram", "sheet", "kkyu"].map((k) => {
      const d = delivery[k] || {};
      if (d.ok === true) return `${CHANNEL_LABEL[k]} ✓`;
      if (d.ok === false) return `${CHANNEL_LABEL[k]} ✕`;
      return `${CHANNEL_LABEL[k]} –`;
    });
    return parts.join(" · ");
  }

  async function submit(textFrom, sourceEl) {
    const text = String(textFrom || "").trim();
    if (!text) { toast("지시 내용을 먼저 적어주세요."); return; }
    if (state.sending) return;
    state.sending = true;
    const btn = sourceEl === "quick" ? $("#quickSubmit") : $("#orderSubmit");
    const other = sourceEl === "quick" ? $("#orderSubmit") : $("#quickSubmit");
    btn.disabled = true; other.disabled = true;

    const targets = [state.target];
    const localItem = {
      id: `local-${Date.now()}`,
      at: localISO(),
      who: "me",
      kind: "instruction",
      order_id: "",
      targets,
      text,
    };

    if (state.mode !== "server") {
      // PWA(정적 배포) — 이 기기에 기록하고, 토큰이 있으면 텔레그램으로 직접 보낸다
      const res = await sendStaticOrder(text, targets, localItem);
      $("#orderInput").value = "";
      $("#quickInput").value = "";
      autoSize($("#orderInput"));
      autoSize($("#quickInput"));
      state.sending = false; btn.disabled = false; other.disabled = false;
      showResult(res.html, res.isError);
      toast(res.toast);
      return;
    }

    try {
      const res = await api("/api/order", { method: "POST", body: JSON.stringify({ text, targets }) });
      if (!res.ok) throw new Error(res.error || "전송에 실패했습니다.");
      const d = res.delivery || {};
      state.items.push(Object.assign({}, localItem, {
        order_id: res.order_id || "",
        delivery: Object.assign({ __demo: !!res.dry_run }, d),
        dry_run: !!res.dry_run,
      }));
      if (!res.dry_run) state.local.sent = [];
      saveLocal();
      renderTimeline();
      renderStats();
      $("#orderInput").value = "";
      $("#quickInput").value = "";
      autoSize($("#orderInput"));
      autoSize($("#quickInput"));
      showResult(`<b>${esc(res.order_id || "")}</b> ${res.dry_run ? "데모 접수" : "전송 완료"} · 대상 ${esc((res.targets || targets).join(" · "))}`
        + `<br>${esc(deliverySummary(d))}${res.dry_run ? " <span class='muted'>(실제 전송 없음)</span>" : ""}`, false);
      toast(res.dry_run ? `${res.order_id} 데모 접수 — 실제 전송 없음` : `${res.order_id} 지시 전송 완료`);
      if (!res.dry_run) {
        setTimeout(() => { refreshBoard(); }, 1200);
      }
    } catch (err) {
      // 서버가 죽었거나 네트워크 실패 → 데모 기록으로 남기고 상태를 알린다
      state.items.push(Object.assign({}, localItem, {
        delivery: { telegram: { ok: false, detail: String(err) }, sheet: { ok: false, detail: String(err) }, kkyu: { ok: false, detail: String(err) } },
      }));
      renderTimeline();
      showResult(`전송 실패: ${esc(String(err.message || err))}`, true);
    } finally {
      state.sending = false;
      btn.disabled = false; other.disabled = false;
    }
  }

  function autoSize(el) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, el.id === "orderInput" ? 150 : 120) + "px";
  }

  /* ---------------- 데이터 로드 ---------------- */
  function useSnapshot() {
    const snap = window.AIHUB_SNAPSHOT || { orders: [], threads: [], snapshot_at: "", source: "none" };
    state.board = {
      orders: snap.orders || [],
      threads: snap.threads || [],
      snapshot_at: snap.snapshot_at || "",
      source: "snapshot", // 서버를 거치지 않은 값은 항상 스냅샷으로 표시한다
      warning: snap.warning || "",
    };
    state.items = buildLocalTimeline(state.board);
    // 서버 없이 보낸 데모 지시는 이 브라우저에 남겨 다시 열어도 보이게 한다
    const saved = (state.local.sent || []).map((s, i) => ({
      id: `saved-${i}-${s.at}`,
      at: s.at,
      who: "me",
      kind: "instruction",
      order_id: s.orderId || "",
      targets: s.targets || [],
      text: s.text,
      dry_run: !(s.delivery && s.delivery.telegram && s.delivery.telegram.ok),
      delivery: s.delivery || {
        telegram: { ok: null, skipped: true, detail: "서버 미연결" },
        sheet: { ok: null, skipped: true, detail: "서버 미연결" },
        kkyu: { ok: null, skipped: true, detail: "서버 미연결" },
        __demo: true,
      },
      source: "webapp",
    }));
    if (saved.length) {
      state.items = state.items.concat(saved).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    }
  }

  async function loadServer() {
    if (window.AIHUB_STATIC) return false; // PWA 빌드: 서버 탐색 생략
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
      try {
        const msgs = await api("/api/messages?limit=200");
        if (msgs && msgs.items) state.items = msgs.items;
      } catch (_) {
        if (!state.items.length) state.items = buildLocalTimeline(state.board);
      }
    } else {
      useSnapshot();
    }
    renderAll();
  }

  function renderAll() {
    renderLive();
    renderTimeline();
    renderStats();
    renderDecisions();
    renderConns();
    renderBoard();
    renderThreads();
    renderSettings();
    setTarget(state.target);
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

    $$(".chip-target").forEach((b) => b.addEventListener("click", () => setTarget(b.dataset.target)));
    // 아바타를 칩 안에 넣는다
    $$("[data-av]").forEach((el) => { el.innerHTML = avatarOf(el.dataset.av); });

    $$(".tab").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
    $$("[data-goto]").forEach((b) => b.addEventListener("click", () => go(b.dataset.goto)));
    $("#topSettingsBtn").addEventListener("click", () => go("settings"));

    $("#orderSubmit").addEventListener("click", () => submit($("#orderInput").value, "card"));
    $("#quickSubmit").addEventListener("click", () => submit($("#quickInput").value, "quick"));

    const orderInput = $("#orderInput");
    const quickInput = $("#quickInput");
    [orderInput, quickInput].forEach((el) => {
      el.addEventListener("input", () => autoSize(el));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          e.preventDefault();
          submit(el.value, el.id === "quickInput" ? "quick" : "card");
        }
      });
    });

    $("#jumpBottom").addEventListener("click", () => { feed.scrollTop = feed.scrollHeight; });

    $("#refreshBtn").addEventListener("click", async () => {
      toast("다시 불러오는 중…");
      await refreshBoard(true);
      toast("스냅샷 기준입니다 — 새 내용은 사이트를 새로 열 때 반영됩니다.");
    });

    $$("#boardFilters .filter").forEach((b) => b.addEventListener("click", () => {
      state.filter = b.dataset.filter;
      $$("#boardFilters .filter").forEach((x) => x.classList.toggle("active", x === b));
      renderBoard();
    }));
    $("#boardSearch").addEventListener("input", (e) => { state.search = e.target.value; renderBoard(); });
    $$("#viewToggle .seg-btn").forEach((b) => b.addEventListener("click", () => setLayout(b.dataset.layout)));

    // 설정
    $("#verifyBtn").addEventListener("click", async () => {
      if (state.mode !== "server") {
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
        return;
      }
      $("#verifyResult").textContent = "확인 중…";
      try {
        const h = await api("/api/health?verify=1");
        const t = h && h.verified && h.verified.telegram;
        $("#verifyResult").textContent = t && t.ok ? `텔레그램 봇 확인됨 (${t.bot})` : `텔레그램 확인 실패 — ${(t && t.error) || "응답 없음"}`;
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
      if (raw) state.local.token = raw;
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
      toast("로컬 설정을 지웠습니다.");
    });
    $("#testLocal").addEventListener("click", async () => {
      if (!state.local.token || !state.local.chatId) { toast("토큰과 방 ID를 먼저 저장해주세요."); return; }
      const text = $("#orderInput").value.trim() || "AI 허브 연결 테스트";
      try {
        await fetch(`https://api.telegram.org/bot${state.local.token}/sendMessage`, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: state.local.chatId, text: `[AI 허브] ${text}` }),
        });
        $("#verifyResult").textContent = "요청을 보냈습니다. no-cors라 결과는 확인할 수 없습니다 — 방에서 확인해 주세요.";
      } catch (err) {
        $("#verifyResult").textContent = "브라우저 직접 전송이 막혔습니다(CORS 등). 서버 방식(server.py)을 권합니다: " + String(err.message || err);
      }
    });
  }

  /* ---------------- 정적 배포: 텔레그램 직접 전송 ---------------- */
  async function sendStaticOrder(text, targets, localItem) {
    const token = String(state.local.token || "").trim();
    const chatId = String(state.local.chatId || "").trim();
    const delivery = {
      telegram: { ok: null, skipped: true, detail: "로컬 토큰·방 ID 없음" },
      sheet: { ok: null, skipped: true, detail: "정적 배포 — 시트 쓰기 미지원" },
      kkyu: { ok: null, skipped: true, detail: "정적 배포 — 뀨 웹훅 미설정" },
    };

    if (token && chatId) {
      // URLSearchParams 본문은 단순 요청이라 프리플라이트 없이 전송되고, 응답도 읽을 수 있다
      const body = new URLSearchParams();
      body.set("chat_id", chatId);
      body.set("text", `📌 AI 허브 지시 (${targets.join(" · ")})\n${text}`);
      body.set("disable_web_page_preview", "true");
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", body });
        const j = await res.json().catch(() => null);
        if (j && j.ok) delivery.telegram = { ok: true };
        else delivery.telegram = { ok: false, detail: (j && j.description) || `HTTP ${res.status}` };
      } catch (err) {
        delivery.telegram = { ok: false, detail: String((err && err.message) || err) };
      }
    }

    state.local.sent = state.local.sent || [];
    state.local.sent.push({ at: localItem.at, text, targets, orderId: "", delivery });
    saveLocal();
    useSnapshot();
    renderAll();

    const sent = delivery.telegram.ok === true;
    const tried = !!(token && chatId);
    const html = sent
      ? `<b>지시를 텔레그램 방으로 보냈습니다</b> · 대상 ${esc(targets.join(" · "))}<br><span class="muted">시트 오더보드 기록은 서버가 필요합니다.</span>`
      : tried
        ? `<b>텔레그램 전송 실패</b> — ${esc(delivery.telegram.detail || "")}<br>설정 탭에서 토큰·방 ID를 다시 확인해 주세요.`
        : `<b>데모 기록</b> — 이 기기에만 남겼습니다.<br>설정 → 브라우저 로컬 설정에 <b>봇 토큰</b>과 <b>방 ID</b>를 넣으면 여기서 텔레그램으로 바로 보냅니다.`;
    return {
      html,
      isError: !sent,
      toast: sent ? "텔레그램으로 지시를 보냈습니다"
        : tried ? "전송 실패 — 토큰·방 ID를 확인해 주세요"
          : "데모 — 이 기기에만 기록했습니다",
    };
  }

  /* ---------------- 부트 ---------------- */
  async function boot() {
    loadLocal();
    wire();
    useSnapshot();
    renderAll();
    const ok = await loadServer();
    if (!ok) {
      state.board.warning = "PWA 버전입니다 — 마지막으로 받은 스냅샷으로 보여줍니다. 지시는 설정에 넣은 토큰으로 텔레그램에 바로 나갑니다.";
      renderAll();
    } else {
      renderAll();
      // 서버가 살아 있는 동안 주기적으로 시트를 따라간다(30초)
      setInterval(() => { if (!document.hidden && state.mode === "server") refreshBoard(); }, 30000);
    }
  }

  boot();
})();
