/* =========================================================
   AI 허브 PWA — 잠금 화면 & 스냅샷 복호화 (lock.js)
   · data/snapshot.enc.json 을 PIN(PBKDF2) → AES-GCM 키로 푼다
   · 한 번 풀면 이 브라우저(localStorage)에 키만 남겨 다시 묻지 않는다
   · 복호화가 끝나면 app.js 를 불러 화면을 띄운다
   ========================================================= */
(() => {
  "use strict";

  const ENC_URL = "data/snapshot.enc.json";
  const KEY_LS = "aihub.pwa.key";
  const AAD = new TextEncoder().encode("aihub-v1");

  const $ = (sel) => document.querySelector(sel);
  const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const bytesToB64 = (b) => btoa(String.fromCharCode.apply(null, new Uint8Array(b)));

  let enc = null;
  let booted = false;

  function bootApp() {
    if (booted) return;
    booted = true;
    const lock = $("#lock");
    if (lock) lock.hidden = true;
    // 화면 코드: 오더보드(app.js) → 실시간 단톡방(room.js)
    ["app.js", "room.js"].forEach((src) => {
      const s = document.createElement("script");
      s.src = src;
      s.defer = true;
      document.body.appendChild(s);
    });
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        // 새 버전이 있으면 바로 활성화를 요청한다
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          if (w) w.addEventListener("statechange", () => {
            if (w.state === "installed") w.postMessage("skip-waiting");
          });
        });
        // 앱을 열 때마다 새 배포가 있는지 확인 (있으면 다음 열람부터 새 화면)
        reg.update().catch(() => {});
      }).catch(() => { /* file:// 등록 불가 환경은 무시 */ });
    }
  }

  async function deriveKey(pin) {
    const base = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: b64ToBytes(enc.kdf.salt), iterations: enc.kdf.iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]
    );
  }

  async function decryptWith(key) {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(enc.iv), additionalData: AAD },
      key, b64ToBytes(enc.ct)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function useSnapshot(payload) {
    window.AIHUB_SNAPSHOT = payload;
    window.AIHUB_LOCKED = false;
  }

  async function unlockWithKeyB64(keyB64) {
    try {
      const key = await crypto.subtle.importKey("raw", b64ToBytes(keyB64), "AES-GCM", true, ["decrypt"]);
      const payload = await decryptWith(key);
      useSnapshot(payload);
      bootApp();
      return true;
    } catch (_) {
      return false;
    }
  }

  function setMsg(text, ok) {
    const el = $("#lockMsg");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("ok", !!ok);
  }

  function showLock() {
    const lock = $("#lock");
    if (!lock) { bootApp(); return; }
    lock.classList.remove("hidden");
    const input = $("#lockPin");
    const form = $("#lockForm");
    if (!input || !form) return;

    let busy = false;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return;
      const pin = String(input.value || "").replace(/\D/g, "");
      if (pin.length < 4) { setMsg("PIN은 4자리 이상입니다."); return; }
      busy = true;
      setMsg("확인 중…", true);
      const btn = $("#lockBtn");
      if (btn) btn.disabled = true;
      try {
        const key = await deriveKey(pin);
        const payload = await decryptWith(key);
        useSnapshot(payload);
        try {
          const raw = await crypto.subtle.exportKey("raw", key);
          localStorage.setItem(KEY_LS, bytesToB64(raw));
        } catch (_) { /* 저장 실패해도 이번 세션은 열린다 */ }
        setMsg("열렸습니다", true);
        bootApp();
      } catch (_) {
        setMsg("PIN이 맞지 않습니다.");
        input.value = "";
        input.focus();
      } finally {
        busy = false;
        if (btn) btn.disabled = false;
      }
    });

    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "");
      setMsg(input.value.length >= 6 ? "" : "");
      if (input.value.length >= 6) form.dispatchEvent(new Event("submit", { cancelable: true }));
    });
    setTimeout(() => input.focus(), 120);
  }

  async function start() {
    try {
      const res = await fetch(ENC_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      enc = await res.json();
    } catch (_) {
      // 암호화 파일이 없으면(개발용) 그냥 앱을 띄운다
      bootApp();
      return;
    }
    window.__AIHUB_ENC = { iter: enc.kdf && enc.kdf.iter, snapshot_at: enc.snapshot_at || "" };
    const saved = localStorage.getItem(KEY_LS);
    if (saved && await unlockWithKeyB64(saved)) return;
    showLock();
  }

  window.AIHUB_LOCKED = true;
  window.AIHUB_STATIC = true; // app.js 가 서버 탐색(/api)을 건너뛰게 한다
  window.AIHUB_RELOCK = () => { localStorage.removeItem(KEY_LS); location.reload(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
