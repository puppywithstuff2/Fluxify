(function() {
(async () => {
  const CHAT_BASE = "https://dolegpt2.anonymousguy.workers.dev";
  const ACCOUNT_BASE = "https://account-worker.anonymousguy.workers.dev";
  const IMAGE_UPLOAD_WORKER = "https://dole-imagesupport.anonymousguy.workers.dev";

  let currentRoom = (function() {
    try { return localStorage.getItem("dole_chat_room") || "friends"; } catch (e) { return "friends"; }
  })();

  const ROOMS_LIST_KEY = "dole_chat_rooms";

  let sessionImgBBKey = null;
  let sessionRoomPasswords = {};
  let userRoomPasswords = {};
  let claimedChatsMap = {};
  let roomProofs = {};
  let createdEls = [];

  // --- DRAG ---
  function makeDraggable(el, options = {}) {
    const header = el.querySelector(":scope > div") || el;
    header.style.cursor = "grab";
    header.style.userSelect = "none";
    let dragging = false, moved = false, offsetX = 0, offsetY = 0, startX = 0, startY = 0;
    const origBg = header.style.background;
    const origTouchAction = el.style.touchAction || "";
    const threshold = options.threshold || 6;

    function shouldIgnoreStart(target) {
      return !!target.closest("button, input, textarea, [contenteditable], #chatMessages");
    }
    function start(e) {
      const isTouch = e.type && e.type.startsWith && e.type.startsWith("touch");
      const clientX = isTouch ? (e.touches && e.touches[0] && e.touches[0].clientX) : e.clientX;
      const clientY = isTouch ? (e.touches && e.touches[0] && e.touches[0].clientY) : e.clientY;
      if (shouldIgnoreStart(e.target)) return;
      dragging = false; moved = false;
      startX = clientX; startY = clientY;
      offsetX = clientX - el.getBoundingClientRect().left;
      offsetY = clientY - el.getBoundingClientRect().top;
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", end);
      document.addEventListener("touchmove", move, { passive: false });
      document.addEventListener("touchend", end);
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", end);
      if (e.preventDefault) e.preventDefault();
    }
    function move(e) {
      const isTouch = e.type && e.type.startsWith && e.type.startsWith("touch");
      const clientX = isTouch ? (e.touches && e.touches[0] && e.touches[0].clientX) : e.clientX;
      const clientY = isTouch ? (e.touches && e.touches[0] && e.touches[0].clientY) : e.clientY;
      const dx = clientX - startX, dy = clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < threshold) return;
        dragging = true;
        header.style.cursor = "grabbing";
        header.style.background = "rgba(0,0,0,0.18)";
        el.style.userSelect = "none";
        el.style.touchAction = "none";
      }
      const left = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, clientX - offsetX));
      const top = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, clientY - offsetY));
      el.style.left = left + "px";
      el.style.top = top + "px";
      if (isTouch && e.preventDefault) e.preventDefault();
      moved = true;
    }
    function end() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", end);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      if (!dragging && !moved) el.click();
      dragging = false;
      header.style.cursor = "grab";
      header.style.background = origBg || "";
      el.style.userSelect = "";
      el.style.touchAction = origTouchAction;
    }
    header.addEventListener("pointerdown", start);
    header.addEventListener("mousedown", start);
    header.addEventListener("touchstart", start, { passive: false });
  }

  function registerEl(el) {
    try { el.dataset.bookmarklet = "true"; } catch (e) {}
    createdEls.push(el);
    makeDraggable(el);
  }
  function removeEl(el) {
    if (!el) return;
    el.remove();
    createdEls = createdEls.filter(e => e !== el);
  }

  // --- rooms list helpers ---
  function loadRoomsList() {
    try {
      const raw = localStorage.getItem(ROOMS_LIST_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(r => typeof r === "string" && r.trim().length > 0).map(r => r.trim());
      return [];
    } catch (e) { return []; }
  }
  function saveRoomsList(arr) {
    try {
      const dedup = Array.from(new Set((arr || []).map(r => String(r).trim()))).filter(r => r.length > 0);
      localStorage.setItem(ROOMS_LIST_KEY, JSON.stringify(dedup));
      return true;
    } catch (e) { return false; }
  }
  function addRoomToList(room) {
    if (!room || !room.trim()) return false;
    const list = loadRoomsList();
    if (!list.includes(room)) {
      list.unshift(room);
      if (list.length > 50) list.length = 50;
      saveRoomsList(list);
    }
    return true;
  }
  function removeRoomFromList(room) {
    saveRoomsList(loadRoomsList().filter(r => r !== room));
    return true;
  }

  // --- timestamp helpers ---
  function parseMessageTimestamp(m) {
    const candidates = [m.ts, m.timestamp, m.created_at, m.createdAt, m.time, m.date, m.when];
    let raw;
    for (const c of candidates) { if (c !== undefined && c !== null) { raw = c; break; } }
    if (raw === undefined) return null;
    if (typeof raw === "number") {
      if (raw > 1e12) return new Date(raw);
      if (raw > 1e9) return new Date(raw * 1000);
      return new Date(raw);
    }
    if (typeof raw === "string") {
      const n = Number(raw);
      if (!Number.isNaN(n)) {
        if (n > 1e12) return new Date(n);
        if (n > 1e9) return new Date(n * 1000);
      }
      const parsed = Date.parse(raw);
      if (!Number.isNaN(parsed)) return new Date(parsed);
    }
    return null;
  }
  function timeAgoShort(date) {
    if (!date) return "";
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 5) return "now";
    if (diff < 60) return `${diff}s ago`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours}h ago`;
    return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  function refreshTimestampsIn(container) {
    if (!container) return;
    const nodes = container.querySelectorAll && container.querySelectorAll("[data-ts]");
    if (!nodes || nodes.length === 0) return;
    for (const el of nodes) {
      const ms = Number(el.dataset.ts);
      if (!Number.isFinite(ms) || ms <= 0) { el.textContent = ""; el.title = ""; continue; }
      const d = new Date(ms);
      el.textContent = timeAgoShort(d);
      el.title = d.toLocaleString();
    }
  }

  // --- image detection ---
  const IMG_EXT_RE = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i;
  function isImageUrl(text) {
    if (typeof text !== "string") return false;
    const t = text.trim();
    try {
      const u = new URL(t);
      if (!["http:", "https:"].includes(u.protocol)) return false;
      return IMG_EXT_RE.test(u.pathname);
    } catch (e) { return false; }
  }

  // --- fetch with timeout ---
  function fetchWithTimeout(url, opts = {}, timeout = 8000) {
    const controller = new AbortController();
    const o = Object.assign({}, opts, { signal: controller.signal });
    const timer = setTimeout(() => controller.abort(), timeout);
    return fetch(url, o).finally(() => clearTimeout(timer));
  }

  // --- account helpers ---
  async function fetchUserRoomPasswords(token) {
    if (!token) return {};
    try {
      const res = await fetchWithTimeout(`${ACCOUNT_BASE}/user/room-passwords`, { method: "GET", headers: { Authorization: token } }, 8000);
      if (!res.ok) return {};
      const j = await res.json().catch(() => null);
      if (!j || !j.success || !j.passwords) return {};
      return j.passwords || {};
    } catch (e) { return {}; }
  }
  async function fetchClaimedChats() {
    try {
      const res = await fetchWithTimeout(`${ACCOUNT_BASE}/claimed-chats`, { method: "GET" }, 8000);
      if (!res.ok) return {};
      const j = await res.json().catch(() => null);
      if (!j || !j.success || !Array.isArray(j.claimed)) return {};
      const map = {};
      for (const it of j.claimed) map[it.chat_name] = { claimed_by: it.claimed_by || null, created_at: it.created_at || null, claimed_at: it.claimed_at || null };
      return map;
    } catch (e) { return {}; }
  }
  async function postSaveRoomPassword(token, room, password) {
    try {
      const res = await fetchWithTimeout(`${ACCOUNT_BASE}/user/room-passwords`, {
        method: "POST", headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ room, password })
      }, 8000);
      const j = await res.json().catch(() => null);
      return !!(j && j.success);
    } catch (e) { return false; }
  }
  async function postDeleteRoomPassword(token, room) {
    try {
      const res = await fetchWithTimeout(`${ACCOUNT_BASE}/user/room-passwords`, {
        method: "DELETE", headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ room })
      }, 8000);
      const j = await res.json().catch(() => null);
      return !!(j && j.success);
    } catch (e) { return false; }
  }
  async function postClaimChat(token, chat_name, password) {
    try {
      const res = await fetchWithTimeout(`${ACCOUNT_BASE}/user/claim-chat`, {
        method: "POST", headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ chat_name, password })
      }, 8000);
      const j = await res.json().catch(() => null);
      return j || { success: false };
    } catch (e) { return { success: false, error: "network" }; }
  }
  async function postUnclaimChat(token, chat_name, adminKey) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = token;
      if (adminKey) headers["x-admin-key"] = adminKey;
      const res = await fetchWithTimeout(`${ACCOUNT_BASE}/user/unclaim-chat`, {
        method: "POST", headers, body: JSON.stringify({ chat_name })
      }, 8000);
      const j = await res.json().catch(() => null);
      return j || { success: false };
    } catch (e) { return { success: false, error: "network" }; }
  }
  async function postUpdateClaimPassword(token, chat_name, password, adminKey) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = token;
      if (adminKey) headers["x-admin-key"] = adminKey;
      const res = await fetchWithTimeout(`${ACCOUNT_BASE}/user/update-claim-password`, {
        method: "POST", headers, body: JSON.stringify({ chat_name, password })
      }, 8000);
      const j = await res.json().catch(() => null);
      return j || { success: false };
    } catch (e) { return { success: false, error: "network" }; }
  }
  async function fetchRoomProof(token, room) {
    try {
      const cached = roomProofs[room];
      if (cached && cached.proof && cached.expires && Date.now() < (cached.expires - 500)) return cached.proof;
      const res = await fetchWithTimeout(`${ACCOUNT_BASE}/user/room-proof`, {
        method: "POST", headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ room })
      }, 8000);
      const j = await res.json().catch(() => null);
      if (!j || !j.success || !j.proof || !j.expires) return null;
      roomProofs[room] = { proof: j.proof, expires: j.expires };
      return j.proof;
    } catch (e) { return null; }
  }
  async function fetchExplore(limit = 20, sort = "last_activity", q = "") {
    try {
      const url = new URL(`${ACCOUNT_BASE}/explore`);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("sort", sort);
      if (q) url.searchParams.set("q", q);
      const res = await fetchWithTimeout(url.toString(), {}, 8000);
      if (!res.ok) return [];
      const j = await res.json().catch(() => null);
      if (!j || !j.success || !Array.isArray(j.rooms)) return [];
      return j.rooms;
    } catch (e) { return []; }
  }

  // --- message rendering ---
  function appendMessageToContainer(container, m, i) {
    const d = document.createElement("div");
    d.style.background = i % 2 === 0 ? "#40444b" : "#36393f";
    d.style.padding = "6px 8px";
    d.style.borderRadius = "8px";
    d.style.wordBreak = "break-word";
    d.style.fontSize = "15px";
    d.style.display = "flex";
    d.style.justifyContent = "space-between";
    d.style.alignItems = "flex-start";
    d.style.gap = "8px";

    const left = document.createElement("div");
    left.style.flex = "1 1 auto";
    left.style.minWidth = "0";

    const strong = document.createElement("strong");
    strong.textContent = String(m.username || "unknown");
    left.appendChild(strong);

    const text = String(m.text || "");
    const trimmed = text.trim();

    if (trimmed && isImageUrl(trimmed) && trimmed === text) {
      const wrapper = document.createElement("div");
      wrapper.style.display = "inline-flex";
      wrapper.style.alignItems = "center";
      wrapper.style.gap = "8px";

      const imgButton = document.createElement("button");
      imgButton.type = "button";
      Object.assign(imgButton.style, {
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        padding: "6px 8px", borderRadius: "8px", border: "none",
        background: "#5865f2", color: "#fff", cursor: "pointer", fontSize: "16px"
      });
      imgButton.title = "Show image";
      imgButton.textContent = "🖼️";
      imgButton.dataset.url = trimmed;

      let expanded = false, imgEl = null;
      function expand() {
        if (expanded) return;
        expanded = true;
        imgEl = document.createElement("img");
        imgEl.src = trimmed; imgEl.alt = "Image"; imgEl.loading = "lazy";
        Object.assign(imgEl.style, { maxWidth: "100%", maxHeight: "360px", borderRadius: "8px", display: "block", cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,0.4)" });
        imgEl.referrerPolicy = "no-referrer";
        imgEl.addEventListener("error", () => { if (imgEl && imgEl.parentNode) imgEl.replaceWith(imgButton); expanded = false; imgEl = null; });
        imgEl.addEventListener("click", collapse);
        imgButton.replaceWith(imgEl);
      }
      function collapse() {
        if (!expanded) return;
        expanded = false;
        if (imgEl && imgEl.parentNode) imgEl.replaceWith(imgButton);
        imgEl = null;
      }
      imgButton.addEventListener("click", expand);
      wrapper.appendChild(document.createTextNode(": "));
      wrapper.appendChild(imgButton);
      left.appendChild(wrapper);
    } else {
      left.appendChild(document.createTextNode(": " + text));
    }

    const tsDate = parseMessageTimestamp(m);
    const timeEl = document.createElement("div");
    Object.assign(timeEl.style, { marginLeft: "8px", opacity: "0.75", fontSize: "12px", whiteSpace: "nowrap", flex: "0 0 auto" });
    if (tsDate) {
      timeEl.dataset.ts = String(tsDate.getTime());
      timeEl.textContent = timeAgoShort(tsDate);
      timeEl.title = tsDate.toLocaleString();
    }
    d.appendChild(left);
    d.appendChild(timeEl);
    container.appendChild(d);
  }

  // --- LOGIN UI ---
  const loginBox = document.createElement("div");
  Object.assign(loginBox.style, {
    position: "fixed", top: "20px", right: "20px",
    width: "min(95vw, 320px)", background: "#2c2f33", color: "#fff",
    zIndex: 999999, borderRadius: "12px", display: "flex",
    flexDirection: "column", overflow: "hidden",
    fontFamily: "Arial, sans-serif", boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
    maxHeight: "90vh",
  });

  loginBox.innerHTML = `
    <div style="padding:12px; background:#23272a; font-weight:bold; text-align:center; position:relative; font-size:16px;">
      Login / Create Account
      <button id="closeLogin" style="position:absolute; right:10px; top:8px; background:red; color:white; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:15px;">X</button>
    </div>
    <div style="padding:10px; display:flex; flex-direction:column; gap:8px; background:#2c2f33;">
      <input id="loginUser" placeholder="Username" style="padding:12px; border-radius:10px; border:none; outline:none; font-size:16px;">
      <input id="loginPass" type="password" placeholder="Password" style="padding:12px; border-radius:10px; border:none; outline:none; font-size:16px;">
      <div style="display:flex; gap:8px;">
        <button id="loginBtn" style="flex:1; padding:10px; border-radius:10px; border:none; background:#7289da; color:white; cursor:pointer; font-size:16px;">Login</button>
        <button id="createBtn" style="flex:1; padding:10px; border-radius:10px; border:none; background:#43b581; color:white; cursor:pointer; font-size:16px;">Create</button>
      </div>
      <div id="loginMsg" style="color:#ff5555; font-size:14px; min-height:18px;"></div>
    </div>
  `;

  document.body.appendChild(loginBox);
  registerEl(loginBox);
  document.getElementById("closeLogin").onclick = () => removeEl(loginBox);

  const showMsg = (msg) => { const el = document.getElementById("loginMsg"); if (el) el.textContent = msg; };

  async function login() {
    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("loginPass").value.trim();
    if (!username || !password) return showMsg("Fill both fields");
    try {
      const res = await fetch(`${ACCOUNT_BASE}/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!data.success) return showMsg("Login failed: " + data.error);
      showMsg("Login successful!");
      removeEl(loginBox);
      initChat(data.token, username);
    } catch (e) { showMsg("Error: " + e); }
  }

  async function createAccount() {
    const username = document.getElementById("loginUser").value.trim();
    const password = document.getElementById("loginPass").value.trim();
    if (!username || !password) return showMsg("Fill both fields");
    try {
      const res = await fetch(`${ACCOUNT_BASE}/create`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!data.success) return showMsg("Request failed: " + data.error);
      showMsg("Request submitted! Wait for approval.");
    } catch (e) { showMsg("Error: " + e); }
  }

  document.getElementById("loginBtn").onclick = login;
  document.getElementById("createBtn").onclick = createAccount;

  // --- MAIN CHAT ---
  async function initChat(token, username) {
    userRoomPasswords = await fetchUserRoomPasswords(token);
    claimedChatsMap = await fetchClaimedChats();

    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "fixed", top: "20px", right: "20px",
      width: "min(95vw, 360px)", height: "min(80vh, 600px)",
      background: "#18191c", color: "#ffffff", zIndex: 999999,
      borderRadius: "12px", display: "flex", flexDirection: "column",
      overflow: "hidden", fontFamily: "Inter, Arial, sans-serif",
      boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
      border: "1px solid rgba(255,255,255,0.03)"
    });

    box.innerHTML = `
      <div id="chatHeader" style="padding:12px; background:linear-gradient(180deg,#111214,#17181b); font-weight:600; text-align:center; position:relative; font-size:15px; display:flex; align-items:center;">
        <div style="display:flex; gap:8px; align-items:center; position:absolute; left:12px;">
          <button id="minifyChat" title="Minify" style="background:transparent; border:none; color:#bfc7ff; padding:8px; border-radius:8px; cursor:pointer; font-size:18px; min-width:44px; min-height:44px;">_</button>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <div style="font-weight:700; color:#e6eefc;">Friends Chat</div>
          <div id="book_username" style="font-weight:500; color:#9fb0e6; opacity:0.9;"></div>
          <div id="wsIndicator" title="Connecting..." style="width:8px; height:8px; border-radius:50%; background:#fc8181; margin-left:4px;"></div>
        </div>
        <div style="position:absolute; right:12px; display:flex; gap:8px; align-items:center;">
          <button id="callBtn" title="Call someone" style="background:#2f855a; color:white; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:18px; min-width:44px; min-height:44px;">📞</button>
          <button id="closeChat" style="background:#ff6b6b; color:white; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:14px; min-width:44px; min-height:44px;">✕</button>
        </div>
      </div>

      <div style="padding:10px; display:flex; gap:8px; align-items:center; background:#141518; border-bottom:1px solid rgba(255,255,255,0.02); flex-shrink:0;">
        <button id="openRoomsBtn" style="padding:8px 12px; border-radius:10px; border:none; background:#2f855a; color:white; cursor:pointer; font-size:13px; min-height:44px;">Room</button>
        <button id="openExploreBtn" style="padding:8px 12px; border-radius:10px; border:none; background:#2b6cb0; color:white; cursor:pointer; font-size:13px; min-height:44px;">Explore</button>
        <div id="currentRoomDisplay" style="font-size:13px; opacity:0.9; color:#ddd; margin-left:auto;">room: ${currentRoom}</div>
      </div>

      <div id="chatMessages" style="flex:1; padding:12px; overflow-y:auto; background:linear-gradient(180deg,#0f1113,#141518); display:flex; flex-direction:column; gap:8px; -webkit-overflow-scrolling:touch;"></div>

      <div id="imageInputRow" style="display:none; padding:8px 10px; background:#0f1113; gap:8px; align-items:center; flex-shrink:0; flex-direction:row;">
        <input id="imageUrlInput" placeholder="Paste image URL..." style="flex:1; padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,0.04); outline:none; font-size:14px; background:#0c0d0f; color:#fff;">
        <button id="imageUrlSend" style="padding:8px 10px; border-radius:8px; border:none; background:#2f855a; color:white; cursor:pointer; font-size:14px; min-height:44px;">Send</button>
        <button id="imageUploadBtn" style="padding:8px 10px; border-radius:8px; border:none; background:#2b6cb0; color:white; cursor:pointer; font-size:14px; min-height:44px;">Upload</button>
        <button id="imageUrlCancel" style="padding:8px 10px; border-radius:8px; border:none; background:#555; color:white; cursor:pointer; font-size:14px; min-height:44px;">Cancel</button>
      </div>

      <div style="padding:12px; background:#0f1113; display:flex; gap:8px; align-items:center; border-top:1px solid rgba(255,255,255,0.02); flex-shrink:0;">
        <button id="imageBtn" title="Add image" style="padding:8px 10px; border-radius:10px; border:none; background:#2b6cb0; color:white; cursor:pointer; font-size:16px; min-height:44px;">🖼️</button>
        <input id="chatInput" style="flex:1; padding:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.04); outline:none; font-size:15px; background:#0c0d0f; color:#fff;" placeholder="Type a message...">
        <button id="chatSend" style="padding:10px 14px; border-radius:10px; border:none; background:#2f855a; color:white; cursor:pointer; font-size:15px; min-height:44px;">Send</button>
      </div>
    `;

    document.body.appendChild(box);
    registerEl(box);

    const fileInput = document.createElement("input");
    fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none";
    box.appendChild(fileInput);

    const usernameSpan = box.querySelector("#book_username");
    if (usernameSpan) usernameSpan.textContent = username;

    const msgBox = box.querySelector("#chatMessages");
    const chatInputEl = box.querySelector("#chatInput");
    const minifyBtn = box.querySelector("#minifyChat");
    const closeBtn = box.querySelector("#closeChat");
    const callBtn = box.querySelector("#callBtn");
    const imageBtn = box.querySelector("#imageBtn");
    const imageInputRow = box.querySelector("#imageInputRow");
    const imageUrlInput = box.querySelector("#imageUrlInput");
    const imageUrlSend = box.querySelector("#imageUrlSend");
    const imageUploadBtn = box.querySelector("#imageUploadBtn");
    const imageUrlCancel = box.querySelector("#imageUrlCancel");
    const openRoomsBtn = box.querySelector("#openRoomsBtn");
    const openExploreBtn = box.querySelector("#openExploreBtn");
    const currentRoomDisplay = box.querySelector("#currentRoomDisplay");

    // new messages button
    const newMsgBtn = document.createElement("button");
    Object.assign(newMsgBtn.style, {
      position: "absolute", right: "12px", bottom: "12px",
      padding: "6px 10px", borderRadius: "12px", background: "#2f855a",
      color: "#fff", border: "none", display: "none", zIndex: 10, fontSize: "13px",
    });
    newMsgBtn.textContent = "New messages";
    newMsgBtn.onclick = () => { msgBox.scrollTop = msgBox.scrollHeight; newMsgBtn.style.display = "none"; };
    msgBox.appendChild(newMsgBtn);

    // --- Resize helper ---
    function makeResizable(el, minW = 280, minH = 320) {
      const handle = document.createElement("div");
      Object.assign(handle.style, {
        position: "absolute", right: "0", bottom: "0",
        width: "28px", height: "28px", cursor: "se-resize",
        display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
        padding: "6px", zIndex: 10, touchAction: "none",
      });
      handle.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M11 1L1 11M11 6L6 11M11 11" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" stroke-linecap="round"/></svg>`;
      el.appendChild(handle);
      let resizing = false, startX = 0, startY = 0, startW = 0, startH = 0;
      handle.addEventListener("pointerdown", e => {
        resizing = true; startX = e.clientX; startY = e.clientY;
        startW = el.offsetWidth; startH = el.offsetHeight;
        handle.setPointerCapture(e.pointerId); e.preventDefault();
      });
      handle.addEventListener("pointermove", e => {
        if (!resizing) return;
        el.style.width = Math.max(minW, startW + (e.clientX - startX)) + "px";
        el.style.height = Math.max(minH, startH + (e.clientY - startY)) + "px";
        e.preventDefault();
      });
      handle.addEventListener("pointerup", () => resizing = false);
    }

    makeResizable(box, 300, 400);

    // --- WS indicator ---
    function updateWsIndicator(connected) {
      const dot = box.querySelector("#wsIndicator");
      if (!dot) return;
      dot.style.background = connected ? "#68d391" : "#fc8181";
      dot.title = connected ? "Live connection" : "Reconnecting...";
    }

    // --- Call window state ---
    let callWindow = null;
    let remoteVideoEl = null;
    let localVideoEl = null;

    function updateCallStatus(msg) {
      if (!callWindow) return;
      const el = callWindow.querySelector("#callStatus");
      if (el) el.textContent = msg;
      if (msg.includes("🟢")) {
        const dot = callWindow.querySelector("#callDot");
        if (dot) dot.style.background = "#68d391";
        const waiting = callWindow.querySelector("#callWaiting");
        if (waiting) waiting.style.display = "none";
        const nameEl = callWindow.querySelector("#callHeaderName");
        if (nameEl && callWindow._peerName) nameEl.textContent = callWindow._peerName;
      }
    }

    // FIX 1: setRemoteStream now calls .play() and handles autoplay policy
    function setRemoteStream(stream) {
      if (!remoteVideoEl) return;
      remoteVideoEl.srcObject = stream;
      remoteVideoEl.volume = callWindow
        ? (Number(callWindow.querySelector("#volumeSlider")?.value) || 80) / 100
        : 0.8;
      remoteVideoEl.play().catch(() => {
        // Autoplay blocked — show tap-to-play button
        if (callWindow) {
          const unmuteBtn = callWindow.querySelector("#unmuteRemote");
          if (unmuteBtn) unmuteBtn.style.display = "flex";
        }
      });
      if (callWindow) {
        const waiting = callWindow.querySelector("#callWaiting");
        if (waiting) waiting.style.display = "none";
      }
    }

    function hideCallWindow() {
      if (callWindow) { try { callWindow.remove(); } catch (e) {} callWindow = null; remoteVideoEl = null; localVideoEl = null; }
    }

    // FIX 2: showCallWindow with volume slider + tap-to-play fallback + explicit .play() calls
    function showCallWindow(peerName, lStream) {
      if (callWindow) { try { callWindow.remove(); } catch (e) {} }

      callWindow = document.createElement("div");
      callWindow._peerName = peerName;
      Object.assign(callWindow.style, {
        position: "fixed", top: "20px", left: "20px",
        width: "min(92vw, 420px)", height: "min(85vh, 560px)",
        background: "#0d0e10", borderRadius: "16px", zIndex: 1000001,
        display: "flex", flexDirection: "column", overflow: "hidden",
        boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
        border: "1px solid rgba(255,255,255,0.06)",
        fontFamily: "Inter, Arial, sans-serif",
      });

      callWindow.innerHTML = `
        <div id="callHeader" style="padding:14px 16px; background:#080909; display:flex; align-items:center; gap:10px; cursor:grab; user-select:none; flex-shrink:0;">
          <div style="width:10px; height:10px; border-radius:50%; background:#fc8181;" id="callDot"></div>
          <div style="flex:1; font-weight:700; font-size:15px; color:#e6eefc;" id="callHeaderName">Calling ${escapeHtml(peerName)}...</div>
          <div id="callStatus" style="font-size:12px; color:#9fb0e6; opacity:0.8;"></div>
          <button id="callCloseBtn" style="background:#333; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; color:#fff; font-size:14px; min-width:44px; min-height:44px;">✕</button>
        </div>
        <div style="flex:1; position:relative; background:#000; overflow:hidden;">
          <video id="remoteVideo" autoplay playsinline style="width:100%; height:100%; object-fit:cover; display:block;"></video>
          <video id="localVideo" autoplay muted playsinline style="position:absolute; bottom:14px; right:14px; width:110px; height:82px; object-fit:cover; border-radius:10px; border:2px solid rgba(255,255,255,0.2);"></video>
          <div id="callWaiting" style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; color:#e6eefc;">
            <div style="font-size:52px;">👤</div>
            <div style="font-size:15px; opacity:0.7;">Waiting for ${escapeHtml(peerName)}...</div>
          </div>
          <button id="unmuteRemote" style="display:none; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); padding:12px 20px; background:rgba(0,0,0,0.7); border:none; border-radius:12px; color:#fff; font-size:14px; cursor:pointer; align-items:center; gap:8px;">
            🔊 Tap to hear audio
          </button>
        </div>
        <div style="padding:10px 16px; background:#080909; display:flex; align-items:center; gap:10px; flex-shrink:0; border-top:1px solid rgba(255,255,255,0.04);">
          <span style="font-size:12px; color:#9fb0e6; white-space:nowrap;">🔊 Vol</span>
          <input id="volumeSlider" type="range" min="0" max="100" value="80"
            style="flex:1; accent-color:#2f855a; cursor:pointer;">
        </div>
        <div style="padding:16px; background:#080909; display:flex; gap:12px; justify-content:center; align-items:center; flex-shrink:0; border-top:1px solid rgba(255,255,255,0.04);">
          <button id="callMuteBtn" style="width:56px; height:56px; border-radius:50%; border:none; background:#2d3748; color:#fff; font-size:22px; cursor:pointer; display:flex; align-items:center; justify-content:center; min-height:56px;">🎤</button>
          <button id="callVideoBtn" style="width:56px; height:56px; border-radius:50%; border:none; background:#2d3748; color:#fff; font-size:22px; cursor:pointer; display:flex; align-items:center; justify-content:center; min-height:56px;">📷</button>
          <button id="callEndBtn" style="width:72px; height:72px; border-radius:50%; border:none; background:#e53e3e; color:#fff; font-size:26px; cursor:pointer; display:flex; align-items:center; justify-content:center; min-height:72px;">📞</button>
        </div>
      `;

      document.body.appendChild(callWindow);
      makeResizable(callWindow, 300, 360);

      remoteVideoEl = callWindow.querySelector("#remoteVideo");
      localVideoEl  = callWindow.querySelector("#localVideo");

      // Play local stream immediately — muted so no echo
      if (lStream) {
        localVideoEl.srcObject = lStream;
        localVideoEl.play().catch(() => {});
      }

      // Drag
      const ch = callWindow.querySelector("#callHeader");
      let drag = false, ox = 0, oy = 0;
      ch.addEventListener("pointerdown", e => {
        if (e.target.tagName === "BUTTON") return;
        drag = true;
        ox = e.clientX - callWindow.getBoundingClientRect().left;
        oy = e.clientY - callWindow.getBoundingClientRect().top;
        ch.setPointerCapture(e.pointerId);
      });
      ch.addEventListener("pointermove", e => {
        if (!drag) return;
        callWindow.style.left = Math.max(0, Math.min(window.innerWidth  - callWindow.offsetWidth,  e.clientX - ox)) + "px";
        callWindow.style.top  = Math.max(0, Math.min(window.innerHeight - callWindow.offsetHeight, e.clientY - oy)) + "px";
        e.preventDefault();
      });
      ch.addEventListener("pointerup", () => drag = false);

      // Volume slider
      callWindow.querySelector("#volumeSlider").addEventListener("input", (e) => {
        if (remoteVideoEl) remoteVideoEl.volume = Number(e.target.value) / 100;
      });

      // Tap-to-play button (autoplay policy fallback)
      callWindow.querySelector("#unmuteRemote").addEventListener("click", () => {
        if (remoteVideoEl) {
          remoteVideoEl.play().catch(() => {});
          callWindow.querySelector("#unmuteRemote").style.display = "none";
        }
      });

      let muted = false, vidHidden = false;
      callWindow.querySelector("#callMuteBtn").addEventListener("click", () => {
        muted = !muted;
        if (chatController && chatController._localStream)
          chatController._localStream.getAudioTracks().forEach(t => t.enabled = !muted);
        callWindow.querySelector("#callMuteBtn").textContent = muted ? "🔇" : "🎤";
        callWindow.querySelector("#callMuteBtn").style.background = muted ? "#e53e3e" : "#2d3748";
      });
      callWindow.querySelector("#callVideoBtn").addEventListener("click", () => {
        vidHidden = !vidHidden;
        if (chatController && chatController._localStream)
          chatController._localStream.getVideoTracks().forEach(t => t.enabled = !vidHidden);
        callWindow.querySelector("#callVideoBtn").textContent = vidHidden ? "🚫" : "📷";
        callWindow.querySelector("#callVideoBtn").style.background = vidHidden ? "#e53e3e" : "#2d3748";
      });
      callWindow.querySelector("#callEndBtn").addEventListener("click",   () => chatController.endCall());
      callWindow.querySelector("#callCloseBtn").addEventListener("click", () => chatController.endCall());
    }

    // --- Incoming call banner ---
    const incomingBanner = document.createElement("div");
    incomingBanner.id = "incomingCallBanner";
    Object.assign(incomingBanner.style, {
      position: "absolute", left: "0", right: "0", top: "0",
      background: "linear-gradient(135deg, #1a472a, #2f855a)",
      zIndex: 46, display: "none", flexDirection: "column",
      alignItems: "center", padding: "20px 16px", gap: "14px",
      borderRadius: "12px 12px 0 0",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      border: "1px solid rgba(255,255,255,0.06)",
    });
    incomingBanner.innerHTML = `
      <div style="font-size:32px;">📞</div>
      <div id="incomingCallerName" style="font-size:17px; font-weight:700; color:#fff; text-align:center;"></div>
      <div style="font-size:13px; color:rgba(255,255,255,0.7);">Incoming video call</div>
      <div style="display:flex; gap:16px; width:100%; justify-content:center;">
        <button id="acceptCallBtn" style="flex:1; max-width:140px; padding:14px; border-radius:12px; border:none; background:#68d391; color:#1a202c; font-size:16px; font-weight:700; cursor:pointer; min-height:44px;">Accept</button>
        <button id="rejectCallBtn" style="flex:1; max-width:140px; padding:14px; border-radius:12px; border:none; background:#fc8181; color:#1a202c; font-size:16px; font-weight:700; cursor:pointer; min-height:44px;">Reject</button>
      </div>
    `;
    box.appendChild(incomingBanner);

    function showIncomingCallBanner(callerName) {
      incomingBanner.querySelector("#incomingCallerName").textContent = callerName + " is calling...";
      incomingBanner.style.display = "flex";
    }
    function hideIncomingCallBanner() { incomingBanner.style.display = "none"; }

    incomingBanner.querySelector("#acceptCallBtn").addEventListener("click", () => chatController.acceptCall());
    incomingBanner.querySelector("#rejectCallBtn").addEventListener("click", () => chatController.rejectCall());

    // --- User list panel ---
    let userListVisible = false;
    const userListPanel = document.createElement("div");
    userListPanel.id = "userListPanel";
    Object.assign(userListPanel.style, {
      position: "absolute", left: "0", right: "0", top: "0",
      background: "linear-gradient(180deg,#0d0e10,#111214)",
      zIndex: 45, display: "none", flexDirection: "column",
      borderRadius: "12px 12px 0 0", overflow: "hidden",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      border: "1px solid rgba(255,255,255,0.04)",
      transition: "transform 0.25s ease",
      transform: "translateY(-100%)",
    });
    userListPanel.innerHTML = `
      <div style="padding:14px 16px; background:#0d0e10; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.04);">
        <div style="font-weight:700; font-size:15px; color:#e6eefc;">📞 Call Someone</div>
        <button id="closeUserList" style="background:#333; border:none; padding:8px 12px; border-radius:8px; cursor:pointer; color:#fff; font-size:14px; min-width:44px; min-height:44px;">✕</button>
      </div>
      <div id="userListInner" style="padding:12px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; max-height:280px; -webkit-overflow-scrolling:touch;"></div>
      <div id="userListEmpty" style="padding:20px; text-align:center; font-size:14px; color:#9fb0e6; opacity:0.8; display:none;">No other users online right now.</div>
    `;
    box.appendChild(userListPanel);

    function renderUserList() {
      const inner = userListPanel.querySelector("#userListInner");
      const empty = userListPanel.querySelector("#userListEmpty");
      const users = chatController ? chatController.currentUsers : [];
      inner.innerHTML = "";
      if (!users || users.length === 0) {
        inner.style.display = "none";
        empty.style.display = "block";
        return;
      }
      inner.style.display = "flex";
      empty.style.display = "none";
      for (const u of users) {
        const row = document.createElement("div");
        Object.assign(row.style, {
          display: "flex", alignItems: "center", gap: "12px",
          padding: "12px", borderRadius: "10px",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.04)",
        });
        const avatar = document.createElement("div");
        Object.assign(avatar.style, {
          width: "40px", height: "40px", borderRadius: "50%",
          background: "#5865f2", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: "18px", fontWeight: "700",
          color: "#fff", flexShrink: "0",
        });
        avatar.textContent = u.charAt(0).toUpperCase();
        row.appendChild(avatar);
        const name = document.createElement("div");
        name.style.flex = "1"; name.style.fontWeight = "600";
        name.style.fontSize = "15px"; name.style.color = "#e6eefc";
        name.textContent = u;
        row.appendChild(name);
        const callUserBtn = document.createElement("button");
        Object.assign(callUserBtn.style, {
          padding: "10px 16px", borderRadius: "10px", border: "none",
          background: "#2f855a", color: "#fff", cursor: "pointer",
          fontSize: "20px", minWidth: "50px", minHeight: "50px",
        });
        callUserBtn.textContent = "📞";
        callUserBtn.title = `Call ${u}`;
        callUserBtn.addEventListener("click", () => {
          hideUserList();
          chatController.startCall(u);
        });
        row.appendChild(callUserBtn);
        inner.appendChild(row);
      }
    }

    function showUserList() {
      userListVisible = true;
      userListPanel.style.display = "flex";
      requestAnimationFrame(() => { userListPanel.style.transform = "translateY(0)"; });
      renderUserList();
    }
    function hideUserList() {
      userListVisible = false;
      userListPanel.style.transform = "translateY(-100%)";
      setTimeout(() => { if (!userListVisible) userListPanel.style.display = "none"; }, 260);
    }
    userListPanel.querySelector("#closeUserList").addEventListener("click", hideUserList);

    callBtn.addEventListener("click", () => {
      if (userListVisible) hideUserList(); else showUserList();
    });

    // --- Minify ---
    let minIcon = null;
    function createMinIcon() {
      const rect = box.getBoundingClientRect();
      const icon = document.createElement("div");
      Object.assign(icon.style, {
        position: "fixed",
        left: Math.max(8, rect.left + 8) + "px",
        top: Math.max(8, rect.top + 8) + "px",
        width: "56px", height: "56px",
        background: "#2b6cb0", color: "#fff",
        borderRadius: "28px", display: "flex",
        alignItems: "center", justifyContent: "center",
        zIndex: 1000000, cursor: "pointer",
        boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
        fontSize: "24px", touchAction: "manipulation",
      });
      icon.title = "Restore Chat";
      icon.innerText = "✉";
      document.body.appendChild(icon);
      registerEl(icon);
      icon.onclick = () => {
        removeEl(icon); minIcon = null;
        box.style.display = "flex";
        chatController.resume();
        chatController.loadMessagesOnce().catch(() => {});
      };
      makeDraggable(icon, { threshold: 6 });
      return icon;
    }

    function minifyChat() {
      if (minIcon) return;
      minIcon = createMinIcon();
      box.style.display = "none";
      chatController.pause();
    }

    minifyBtn.onclick = () => minifyChat();

    closeBtn.onclick = () => {
      if (box._chatController) try { box._chatController.stop(); } catch (e) {}
      if (box._timeUpdater) { clearInterval(box._timeUpdater); box._timeUpdater = null; }
      if (minIcon) { removeEl(minIcon); minIcon = null; }
      hideCallWindow();
      removeEl(box);
    };

    // --- Rooms overlay ---
    const overlay = document.createElement("div");
    overlay.id = "roomOverlay";
    Object.assign(overlay.style, {
      position: "absolute", left: "6px", top: "64px", right: "6px", bottom: "72px",
      background: "rgba(12,13,15,0.98)", zIndex: 40, display: "none",
      alignItems: "center", justifyContent: "center", padding: "12px",
      borderRadius: "10px", boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
      border: "1px solid rgba(255,255,255,0.03)",
    });

    const modal = document.createElement("div");
    Object.assign(modal.style, {
      width: "100%", height: "100%", background: "transparent",
      borderRadius: "8px", padding: "6px", overflow: "auto",
      color: "#fff", display: "flex", flexDirection: "column", gap: "8px",
    });
    modal.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <strong style="font-size:15px;">Your Rooms</strong>
        <button id="closeRoomsOverlay" style="background:#444; border:none; padding:6px 8px; border-radius:8px; cursor:pointer; color:#fff;">Close</button>
      </div>
      <div id="roomsList" style="display:flex; flex-direction:column; gap:8px; margin-top:6px;"></div>
      <div style="display:flex; gap:8px; margin-top:auto;">
        <input id="newRoomNameInput" placeholder="New room name" style="flex:1; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,0.03); outline:none; font-size:14px; background:#0c0d0f; color:#fff;">
        <button id="addRoomBtn" style="padding:10px 12px; border-radius:10px; border:none; background:#2f855a; color:white; cursor:pointer;">Add</button>
        <button id="addAndSwitchBtn" style="padding:10px 12px; border-radius:10px; border:none; background:#2b6cb0; color:white; cursor:pointer;">Add+Switch</button>
      </div>
    `;
    overlay.appendChild(modal);
    box.appendChild(overlay);

    const roomsListEl = modal.querySelector("#roomsList");
    const closeRoomsOverlayBtn = modal.querySelector("#closeRoomsOverlay");
    const newRoomNameInput = modal.querySelector("#newRoomNameInput");
    const addRoomBtn = modal.querySelector("#addRoomBtn");
    const addAndSwitchBtn = modal.querySelector("#addAndSwitchBtn");

    const passwordModal = document.createElement("div");
    Object.assign(passwordModal.style, {
      background: "#111214", padding: "12px", borderRadius: "10px",
      display: "none", flexDirection: "column", gap: "8px",
      color: "#fff", border: "1px solid rgba(255,255,255,0.03)"
    });
    passwordModal.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong id="pwdModalTitle">Enter password</strong>
        <button id="pwdModalClose" style="background:#444; border:none; padding:6px 8px; border-radius:8px; cursor:pointer; color:#fff;">X</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <input id="pwdInput" type="password" placeholder="Password" style="padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.03); outline:none; font-size:14px; background:#0c0d0f; color:#fff;">
        <label style="font-size:13px; display:flex; gap:8px; align-items:center;"><input id="pwdRemember" type="checkbox"> Save to account</label>
        <div style="display:flex; gap:8px;">
          <button id="pwdSubmit" style="flex:1; padding:8px; border-radius:8px; border:none; background:#2f855a; color:white; cursor:pointer;">Submit</button>
          <button id="pwdCancel" style="flex:1; padding:8px; border-radius:8px; border:none; background:#555; color:white; cursor:pointer;">Cancel</button>
        </div>
      </div>
    `;
    modal.appendChild(passwordModal);

    function showPasswordModal(title) {
      passwordModal.style.display = "flex";
      modal.querySelector("#pwdModalTitle").textContent = title || "Enter password";
      modal.querySelector("#pwdInput").value = "";
      modal.querySelector("#pwdRemember").checked = true;
      modal.querySelector("#pwdInput").focus();
    }
    function hidePasswordModal() { passwordModal.style.display = "none"; }

    function promptPasswordForRoom(room, purpose = "access") {
      return new Promise((resolve) => {
        showPasswordModal(purpose === "claim" ? `Set password to claim "${room}"` : (purpose === "update-claim" ? `New password for "${room}"` : `Password for "${room}"`));
        const submit = () => {
          const pwd = modal.querySelector("#pwdInput").value;
          const remember = !!modal.querySelector("#pwdRemember").checked;
          hidePasswordModal();
          resolve({ password: pwd, remember });
        };
        const cancel = () => { hidePasswordModal(); resolve(null); };
        const closeBtn2 = modal.querySelector("#pwdModalClose");
        const submitBtn = modal.querySelector("#pwdSubmit");
        const cancelBtn = modal.querySelector("#pwdCancel");
        function cleanup() {
          submitBtn.removeEventListener("click", submit);
          cancelBtn.removeEventListener("click", cancel);
          closeBtn2.removeEventListener("click", cancel);
        }
        submitBtn.addEventListener("click", () => { cleanup(); submit(); });
        cancelBtn.addEventListener("click", () => { cleanup(); cancel(); });
        closeBtn2.addEventListener("click", () => { cleanup(); cancel(); });
      });
    }

    function renderRoomsList() {
      roomsListEl.innerHTML = "";
      const rooms = loadRoomsList();
      if (!rooms || rooms.length === 0) {
        const p = document.createElement("div");
        p.style.opacity = "0.85"; p.style.fontSize = "13px";
        p.textContent = "No rooms yet. Add one below.";
        roomsListEl.appendChild(p);
        return;
      }
      for (const r of rooms) {
        const row = document.createElement("div");
        Object.assign(row.style, { display: "flex", gap: "8px", alignItems: "center", justifyContent: "space-between" });
        const left = document.createElement("div");
        left.style.display = "flex"; left.style.gap = "8px"; left.style.alignItems = "center";
        const hasPwd = (sessionRoomPasswords[r] && sessionRoomPasswords[r].length) || (userRoomPasswords[r] && userRoomPasswords[r].length);
        const lock = document.createElement("div");
        lock.textContent = hasPwd ? "🔒" : "🔓";
        lock.title = hasPwd ? "Has saved password" : "No saved password";
        left.appendChild(lock);
        const btn = document.createElement("button");
        btn.textContent = r; btn.title = `Switch to ${r}`;
        Object.assign(btn.style, { padding: "8px 10px", borderRadius: "8px", border: "none", background: r === currentRoom ? "#25393a" : "#131415", color: "#fff", cursor: "pointer", fontSize: "14px", flex: "1", minHeight: "44px" });
        btn.onclick = async () => { await switchRoom(r); hideRoomsOverlay(); };
        left.appendChild(btn);
        row.appendChild(left);
        const actions = document.createElement("div");
        actions.style.display = "flex"; actions.style.gap = "6px"; actions.style.alignItems = "center";
        const claimedInfo = claimedChatsMap[r];
        if (!claimedInfo || !claimedInfo.claimed_by) {
          const claimBtn = document.createElement("button");
          claimBtn.textContent = "Claim";
          Object.assign(claimBtn.style, { padding: "6px 8px", borderRadius: "8px", border: "none", background: "#2f855a", color: "#fff", cursor: "pointer", fontSize: "12px", minHeight: "44px" });
          claimBtn.onclick = async () => {
            const ans = await promptPasswordForRoom(r, "claim");
            if (!ans || !ans.password) return alert("Claim canceled (no password)");
            const res = await postClaimChat(token, r, ans.password);
            if (!res || !res.success) { alert("Claim failed: " + (res && res.error ? res.error : "unknown")); return; }
            userRoomPasswords = await fetchUserRoomPasswords(token);
            claimedChatsMap = await fetchClaimedChats();
            renderRoomsList();
            const proof = await fetchRoomProof(token, r);
            if (proof) alert(`Chat "${r}" claimed successfully.`); else alert(`Chat "${r}" claimed.`);
          };
          actions.appendChild(claimBtn);
        } else {
          const owner = claimedInfo.claimed_by;
          if (owner === username) {
            const manageBtn = document.createElement("button");
            manageBtn.textContent = "Manage";
            Object.assign(manageBtn.style, { padding: "6px 8px", borderRadius: "8px", border: "none", background: "#5865f2", color: "#fff", cursor: "pointer", fontSize: "12px", minHeight: "44px" });
            manageBtn.onclick = () => {
              const menu = document.createElement("div");
              Object.assign(menu.style, { position: "absolute", background: "#111", padding: "8px", borderRadius: "8px", right: "20px", zIndex: 99999, display: "flex", gap: "6px" });
              const change = document.createElement("button");
              change.textContent = "Change pwd";
              Object.assign(change.style, { padding: "6px 8px", borderRadius: "8px", border: "none", background: "#2f855a", color: "#fff", cursor: "pointer", fontSize: "12px", minHeight: "44px" });
              const unclaim = document.createElement("button");
              unclaim.textContent = "Unclaim";
              Object.assign(unclaim.style, { padding: "6px 8px", borderRadius: "8px", border: "none", background: "#a33", color: "#fff", cursor: "pointer", fontSize: "12px", minHeight: "44px" });
              menu.appendChild(change); menu.appendChild(unclaim);
              row.appendChild(menu);
              function cleanupMenu() { try { menu.remove(); } catch (e) {} }
              change.onclick = async () => {
                const ans = await promptPasswordForRoom(r, "update-claim");
                if (!ans || !ans.password) { cleanupMenu(); return alert("Canceled"); }
                const res = await postUpdateClaimPassword(token, r, ans.password);
                if (!res || !res.success) return alert("Update failed: " + (res && res.error ? res.error : "unknown"));
                userRoomPasswords = await fetchUserRoomPasswords(token);
                claimedChatsMap = await fetchClaimedChats();
                renderRoomsList(); cleanupMenu(); alert("Password updated");
                await fetchRoomProof(token, r);
              };
              unclaim.onclick = async () => {
                if (!confirm(`Unclaim "${r}"?`)) { cleanupMenu(); return; }
                const res = await postUnclaimChat(token, r);
                if (!res || !res.success) return alert("Unclaim failed: " + (res && res.error ? res.error : "unknown"));
                claimedChatsMap = await fetchClaimedChats();
                renderRoomsList(); cleanupMenu(); alert("Unclaimed");
                delete roomProofs[r];
              };
            };
            actions.appendChild(manageBtn);
          } else {
            const ownerLabel = document.createElement("div");
            ownerLabel.textContent = `claimed by ${owner}`;
            ownerLabel.style.opacity = "0.9"; ownerLabel.style.fontSize = "12px"; ownerLabel.style.color = "#ddd";
            actions.appendChild(ownerLabel);
          }
        }
        const del = document.createElement("button");
        del.textContent = "Remove";
        Object.assign(del.style, { padding: "6px 8px", borderRadius: "8px", border: "none", background: "#666", color: "#fff", cursor: "pointer", fontSize: "12px", minHeight: "44px" });
        del.onclick = () => { if (confirm(`Remove "${r}" from your library?`)) { removeRoomFromList(r); renderRoomsList(); } };
        actions.appendChild(del);
        row.appendChild(actions);
        roomsListEl.appendChild(row);
      }
    }

    function showRoomsOverlay() {
      renderRoomsList();
      overlay.style.display = "flex";
      const ex = box.querySelector("#explorePanel");
      if (ex) ex.remove();
      setTimeout(() => { try { newRoomNameInput.focus(); } catch (e) {} }, 50);
    }
    function hideRoomsOverlay() { overlay.style.display = "none"; }

    openRoomsBtn.addEventListener("click", () => showRoomsOverlay());
    closeRoomsOverlayBtn.addEventListener("click", () => hideRoomsOverlay());
    overlay.addEventListener("click", () => {});

    addRoomBtn.addEventListener("click", () => {
      const name = (newRoomNameInput.value || "").trim();
      if (!name) { newRoomNameInput.style.border = "1px solid #ff5555"; setTimeout(() => newRoomNameInput.style.border = "none", 1200); return; }
      addRoomToList(name); newRoomNameInput.value = ""; renderRoomsList();
    });
    addAndSwitchBtn.addEventListener("click", async () => {
      const name = (newRoomNameInput.value || "").trim();
      if (!name) { newRoomNameInput.style.border = "1px solid #ff5555"; setTimeout(() => newRoomNameInput.style.border = "none", 1200); return; }
      addRoomToList(name); newRoomNameInput.value = ""; renderRoomsList();
      await switchRoom(name); hideRoomsOverlay();
    });

    // --- Explore overlay ---
    function hideExploreOverlay() {
      const ex = box.querySelector("#explorePanel");
      if (ex) ex.remove();
    }

    async function showExploreOverlay() {
      try {
        const existing = box.querySelector("#explorePanel");
        if (existing) existing.remove();

        const ex = document.createElement("div");
        ex.id = "explorePanel";
        Object.assign(ex.style, {
          position: "absolute", left: "0", top: "0", right: "0", bottom: "0",
          zIndex: 50, display: "flex", flexDirection: "column",
          background: "#111214", borderRadius: "12px", overflow: "hidden",
        });

        const header = document.createElement("div");
        Object.assign(header.style, {
          padding: "12px 14px", background: "#0d0e10",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", gap: "10px", flexShrink: "0",
        });
        header.innerHTML = `
          <div style="font-size:15px; font-weight:700; color:#e6eefc; flex:1;">Explore Rooms</div>
          <button id="exploreClose" style="background:#333; border:none; padding:7px 12px; border-radius:8px; cursor:pointer; color:#fff; font-size:13px; min-height:44px;">Close</button>
        `;
        ex.appendChild(header);

        const searchRow = document.createElement("div");
        Object.assign(searchRow.style, { padding: "10px 14px 6px", flexShrink: "0", background: "#111214" });
        searchRow.innerHTML = `<input id="exploreSearch" placeholder="Search rooms..." style="width:100%; box-sizing:border-box; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.04); outline:none; font-size:14px; background:#0c0d0f; color:#fff;">`;
        ex.appendChild(searchRow);

        const pillsRow = document.createElement("div");
        Object.assign(pillsRow.style, {
          padding: "6px 14px 10px", display: "flex", gap: "8px",
          flexShrink: "0", background: "#111214",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        });
        function makePill(label, id) {
          const pill = document.createElement("button");
          pill.id = id; pill.textContent = label;
          Object.assign(pill.style, {
            padding: "8px 16px", borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "transparent", color: "#9fb0e6",
            cursor: "pointer", fontSize: "13px", fontWeight: "600",
            minHeight: "44px",
          });
          return pill;
        }
        const recentPill = makePill("🕐 Recent", "pillRecent");
        const activePill = makePill("🔥 Most Active", "pillActive");
        pillsRow.appendChild(recentPill);
        pillsRow.appendChild(activePill);
        ex.appendChild(pillsRow);

        const listEl = document.createElement("div");
        Object.assign(listEl.style, {
          flex: "1", overflowY: "auto", padding: "10px 14px",
          display: "flex", flexDirection: "column", gap: "8px",
          WebkitOverflowScrolling: "touch",
        });
        ex.appendChild(listEl);
        box.appendChild(ex);

        const searchInput = ex.querySelector("#exploreSearch");
        const closeBtn2 = ex.querySelector("#exploreClose");

        let filterRecent = false, filterActive = false, allRooms = [], isLoading = false;

        function setPillActive(pill, active) {
          pill.style.background = active ? "#5865f2" : "transparent";
          pill.style.color = active ? "#fff" : "#9fb0e6";
          pill.style.borderColor = active ? "#5865f2" : "rgba(255,255,255,0.08)";
        }

        function getSortedRooms(rooms, query) {
          let list = rooms.slice();
          if (query && query.trim()) {
            const q = query.trim().toLowerCase();
            list = list.filter(r => String(r.room || "").toLowerCase().includes(q));
          }
          if (!filterRecent && !filterActive) return list.sort((a, b) => (Number(b.last_activity) || 0) - (Number(a.last_activity) || 0));
          if (filterRecent && !filterActive) return list.sort((a, b) => (Number(b.last_activity) || 0) - (Number(a.last_activity) || 0));
          if (filterActive && !filterRecent) return list.sort((a, b) => (Number(b.message_count) || 0) - (Number(a.message_count) || 0));
          const maxActivity = Math.max(...list.map(r => Number(r.last_activity) || 0), 1);
          const minActivity = Math.min(...list.map(r => Number(r.last_activity) || 0), 0);
          const maxCount = Math.max(...list.map(r => Number(r.message_count) || 0), 1);
          const activityRange = maxActivity - minActivity || 1;
          return list.sort((a, b) => {
            const sA = 0.5 * ((Number(a.last_activity) || 0) - minActivity) / activityRange + 0.5 * (Number(a.message_count) || 0) / maxCount;
            const sB = 0.5 * ((Number(b.last_activity) || 0) - minActivity) / activityRange + 0.5 * (Number(b.message_count) || 0) / maxCount;
            return sB - sA;
          });
        }

        function renderExploreList() {
          const query = searchInput.value || "";
          const sorted = getSortedRooms(allRooms, query);
          listEl.innerHTML = "";
          if (!sorted.length) {
            const empty = document.createElement("div");
            Object.assign(empty.style, { opacity: "0.6", fontSize: "14px", padding: "16px 0", textAlign: "center", color: "#9fb0e6" });
            empty.textContent = allRooms.length ? "No rooms match your search." : "No rooms found.";
            listEl.appendChild(empty);
            return;
          }
          for (const r of sorted) {
            const card = document.createElement("div");
            Object.assign(card.style, {
              display: "flex", alignItems: "center", gap: "12px", padding: "12px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
              border: "1px solid rgba(255,255,255,0.04)",
            });
            const icon = document.createElement("div");
            Object.assign(icon.style, {
              width: "40px", height: "40px", borderRadius: "12px", background: "#1e2030",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "18px", flexShrink: "0", border: "1px solid rgba(255,255,255,0.04)",
            });
            icon.textContent = "💬";
            card.appendChild(icon);
            const info = document.createElement("div");
            Object.assign(info.style, { flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" });
            const nameEl = document.createElement("div");
            Object.assign(nameEl.style, { fontWeight: "700", fontSize: "14px", color: "#e6eefc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
            nameEl.textContent = r.room;
            info.appendChild(nameEl);
            const statsEl = document.createElement("div");
            Object.assign(statsEl.style, { fontSize: "12px", color: "#7289da", display: "flex", gap: "8px", alignItems: "center" });
            const msgCount = document.createElement("span");
            msgCount.textContent = `💬 ${Number(r.message_count) || 0}`;
            statsEl.appendChild(msgCount);
            const dot2 = document.createElement("span");
            dot2.textContent = "·"; dot2.style.opacity = "0.4";
            statsEl.appendChild(dot2);
            const lastActive = document.createElement("span");
            lastActive.textContent = r.last_activity ? `🕐 ${timeAgoShort(new Date(Number(r.last_activity)))}` : "No activity";
            statsEl.appendChild(lastActive);
            info.appendChild(statsEl);
            const claimedInfo = claimedChatsMap[r.room];
            const badge = document.createElement("div");
            if (claimedInfo && claimedInfo.claimed_by) {
              Object.assign(badge.style, { fontSize: "11px", color: "#a0aec0", background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: "999px", marginTop: "2px", display: "inline-block" });
              badge.textContent = `🔒 ${claimedInfo.claimed_by}`;
            } else {
              Object.assign(badge.style, { fontSize: "11px", color: "#68d391", background: "rgba(104,211,145,0.08)", padding: "2px 8px", borderRadius: "999px", marginTop: "2px", display: "inline-block" });
              badge.textContent = "✓ Open";
            }
            info.appendChild(badge);
            card.appendChild(info);
            const joinBtn = document.createElement("button");
            joinBtn.textContent = "Join";
            Object.assign(joinBtn.style, { padding: "10px 14px", borderRadius: "8px", border: "none", background: "#5865f2", color: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: "600", minHeight: "44px" });
            joinBtn.addEventListener("click", async () => {
              addRoomToList(r.room);
              ex.remove();
              await switchRoom(r.room);
            });
            card.appendChild(joinBtn);
            listEl.appendChild(card);
          }
        }

        async function loadRooms() {
          if (isLoading) return;
          isLoading = true;
          listEl.innerHTML = `<div style="opacity:0.6; font-size:14px; padding:16px 0; text-align:center; color:#9fb0e6;">Loading...</div>`;
          try { allRooms = await fetchExplore(100, "last_activity"); } catch (e) { allRooms = []; }
          isLoading = false;
          renderExploreList();
        }

        closeBtn2.addEventListener("click", () => ex.remove());
        recentPill.addEventListener("click", () => { filterRecent = !filterRecent; setPillActive(recentPill, filterRecent); renderExploreList(); });
        activePill.addEventListener("click", () => { filterActive = !filterActive; setPillActive(activePill, filterActive); renderExploreList(); });
        let searchDebounce = null;
        searchInput.addEventListener("input", () => {
          clearTimeout(searchDebounce);
          searchDebounce = setTimeout(() => renderExploreList(), 250);
        });

        await loadRooms();
      } catch (err) {
        console.error("showExploreOverlay error:", err);
        alert("Could not open Explore.");
      }
    }

    if (openExploreBtn) {
      openExploreBtn.addEventListener("click", () => {
        try { showExploreOverlay(); } catch (e) { console.error(e); }
      });
    }

    // --- helpers ---
    function getRoomPassword(room) {
      if (sessionRoomPasswords[room]) return sessionRoomPasswords[room];
      if (userRoomPasswords[room]) return userRoomPasswords[room];
      return null;
    }

    // --- WebSocket + Chat Controller ---
    function makeWsController() {
      const SLOW_POLL_MS = 30000;
      const WS_RECONNECT_BASE = 2000;
      const WS_RECONNECT_MAX = 30000;

      let ws = null;
      let wsReconnectTimer = null;
      let wsReconnectDelay = WS_RECONNECT_BASE;
      let wsActive = true;
      let wsPaused = false;
      let pollTimer = null;
      let lastCount = 0;
      let lastMessages = [];
      let currentUsers = [];
      let callState = null;
      let callPeer = null;
      let peerConnection = null;
      let _localStream = null;
      let pendingOffer = null;

      const ICE_SERVERS = [
        { urls: "stun:stun.relay.metered.ca:80" },
        { urls: "turn:global.relay.metered.ca:80", username: "951956895909a9291fb1adb3", credential: "EGUb/agb91aFy24M" },
        { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: "951956895909a9291fb1adb3", credential: "EGUb/agb91aFy24M" },
        { urls: "turn:global.relay.metered.ca:443", username: "951956895909a9291fb1adb3", credential: "EGUb/agb91aFy24M" },
        { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "951956895909a9291fb1adb3", credential: "EGUb/agb91aFy24M" },
      ];

      async function connectWs() {
        if (!wsActive || wsPaused) return;
        try {
          const proof = await fetchRoomProof(token, currentRoom);
          if (!proof) { scheduleReconnect(); return; }
          const wsUrl = `${CHAT_BASE.replace("https://", "wss://").replace("http://", "ws://")}/room/${encodeURIComponent(currentRoom)}?proof=${encodeURIComponent(proof)}`;
          ws = new WebSocket(wsUrl);
          ws.addEventListener("open", () => { wsReconnectDelay = WS_RECONNECT_BASE; updateWsIndicator(true); });
          ws.addEventListener("message", (evt) => {
            try {
              const msg = JSON.parse(evt.data);
              if (msg.type === "chat") handleIncomingChatMessage(msg);
              else if (msg.type === "presence") handlePresence(msg.users || []);
              else if (msg.type && msg.type.startsWith("call-")) handleCallSignal(msg);
            } catch (e) {}
          });
          ws.addEventListener("close", () => { updateWsIndicator(false); if (wsActive && !wsPaused) scheduleReconnect(); });
          ws.addEventListener("error", () => { updateWsIndicator(false); try { ws.close(); } catch (e) {} if (wsActive && !wsPaused) scheduleReconnect(); });
        } catch (e) { if (wsActive && !wsPaused) scheduleReconnect(); }
      }

      function scheduleReconnect() {
        if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
        wsReconnectTimer = setTimeout(() => { wsReconnectDelay = Math.min(wsReconnectDelay * 1.5, WS_RECONNECT_MAX); connectWs(); }, wsReconnectDelay);
      }

      function sendWs(data) {
        if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(data)); return true; }
        return false;
      }

      function closeWs() {
        if (wsReconnectTimer) { clearTimeout(wsReconnectTimer); wsReconnectTimer = null; }
        if (ws) { try { ws.close(); } catch (e) {} ws = null; }
      }

      function handlePresence(users) {
        currentUsers = users.filter(u => u !== username);
        renderUserList();
      }

      function handleIncomingChatMessage(msg) {
        const wasAtBottom = ctrl.isUserAtBottom();
        appendMessageToContainer(msgBox, msg, lastMessages.length);
        lastMessages.push(msg);
        lastCount = lastMessages.length;
        if (wasAtBottom) { msgBox.scrollTop = msgBox.scrollHeight; newMsgBtn.style.display = "none"; }
        else newMsgBtn.style.display = "block";
        refreshTimestampsIn(msgBox);
      }

      async function slowPoll() {
        if (!wsActive || wsPaused) return;
        try {
          const data = await ctrl.getMessages();
          if (!data || !Array.isArray(data.messages)) return;
          const newMessages = data.messages;
          if (newMessages.length !== lastCount) {
            const wasAtBottom = ctrl.isUserAtBottom();
            msgBox.innerHTML = ""; msgBox.appendChild(newMsgBtn);
            newMessages.forEach((m, i) => appendMessageToContainer(msgBox, m, i));
            lastCount = newMessages.length; lastMessages = newMessages;
            if (wasAtBottom) msgBox.scrollTop = msgBox.scrollHeight;
          }
        } catch (e) {}
        if (wsActive) pollTimer = setTimeout(slowPoll, SLOW_POLL_MS);
      }

      function handleCallSignal(msg) {
        switch (msg.type) {
          case "call-offer":
            if (callState) return;
            callState = "incoming"; callPeer = msg._from; pendingOffer = msg.sdp;
            showIncomingCallBanner(msg._from);
            break;

          // FIX 3a: flush queued ICE candidates after remote description is set
          case "call-answer":
            if (callState === "outgoing" && peerConnection) {
              peerConnection.setRemoteDescription(
                new RTCSessionDescription({ type: "answer", sdp: msg.sdp })
              ).then(() => {
                if (peerConnection._flushIce) peerConnection._flushIce();
              }).catch(e => console.error("setRemoteDescription (answer):", e));
            }
            break;

          // FIX 3b: queue or apply ICE candidates depending on whether remote desc is set
          case "call-ice":
            if (peerConnection && msg.candidate) {
              if (peerConnection._queueOrAddIce) {
                peerConnection._queueOrAddIce(msg.candidate);
              } else {
                peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(e => console.error(e));
              }
            }
            break;

          case "call-end":
          case "call-reject":
            endCall(msg.type === "call-reject" ? "rejected" : "ended");
            break;
        }
      }

      async function startCall(targetUsername) {
        if (callState) { alert("Already in a call"); return; }
        try {
          callState = "outgoing"; callPeer = targetUsername;
          _localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          peerConnection = createPeerConnection(targetUsername);
          _localStream.getTracks().forEach(t => peerConnection.addTrack(t, _localStream));
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          sendWs({ type: "call-offer", to: targetUsername, sdp: offer.sdp });
          showCallWindow(targetUsername, _localStream);
          minifyChat();
        } catch (e) { console.error("startCall error", e); endCall("error"); }
      }

      async function acceptCall() {
        if (callState !== "incoming" || !pendingOffer) return;
        hideIncomingCallBanner();
        try {
          _localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          peerConnection = createPeerConnection(callPeer);
          _localStream.getTracks().forEach(t => peerConnection.addTrack(t, _localStream));

          // Must come before setRemoteDescription so remoteVideoEl exists when ontrack fires
          showCallWindow(callPeer, _localStream);
          minifyChat();

          await peerConnection.setRemoteDescription(
            new RTCSessionDescription({ type: "offer", sdp: pendingOffer })
          );
          if (peerConnection._flushIce) peerConnection._flushIce();

          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          sendWs({ type: "call-answer", to: callPeer, sdp: answer.sdp });
          callState = "active";
          pendingOffer = null;
        } catch (e) { console.error("acceptCall error", e); endCall("error"); }
      }

      function rejectCall() {
        if (callState !== "incoming") return;
        sendWs({ type: "call-reject", to: callPeer });
        hideIncomingCallBanner();
        callState = null; callPeer = null; pendingOffer = null;
      }

      function endCall(reason = "ended") {
        if (callPeer && callState && callState !== "ended") sendWs({ type: "call-end", to: callPeer });
        if (peerConnection) { try { peerConnection.close(); } catch (e) {} peerConnection = null; }
        if (_localStream) { _localStream.getTracks().forEach(t => t.stop()); _localStream = null; }
        callState = null; callPeer = null; pendingOffer = null;
        hideCallWindow();
        hideIncomingCallBanner();
        if (wsPaused) closeWs(); // now safe to close — call is done, chat is still minified
      }

      // FIX 3 (core): createPeerConnection with ICE candidate queue to prevent race condition
      function createPeerConnection(targetUsername) {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const iceCandidateQueue = [];
        let remoteDescSet = false;

        async function flushIceCandidates() {
          while (iceCandidateQueue.length) {
            const c = iceCandidateQueue.shift();
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
          }
        }

        pc._flushIce = async () => {
          remoteDescSet = true;
          await flushIceCandidates();
        };
        pc._queueOrAddIce = async (candidate) => {
          if (!remoteDescSet) {
            iceCandidateQueue.push(candidate);
          } else {
            try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
          }
        };

        pc.onicecandidate = (e) => {
          if (e.candidate) sendWs({ type: "call-ice", to: targetUsername, candidate: e.candidate });
        };
        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
            callState = "active";
            updateCallStatus("🟢 Connected");
          }
          if (pc.iceConnectionState === "failed") {
            updateCallStatus("❌ Connection failed");
            endCall("failed");
          }
          if (pc.iceConnectionState === "disconnected") updateCallStatus("⚠️ Reconnecting...");
        };
        pc.ontrack = (e) => {
          if (e.streams && e.streams[0]) {
            setRemoteStream(e.streams[0]);
          } else {
            // Browser sent track without a stream — build one manually
            if (!pc._remoteStream) pc._remoteStream = new MediaStream();
            pc._remoteStream.addTrack(e.track);
            setRemoteStream(pc._remoteStream);
          }
        };
        return pc;
      }

      const ctrl = {
        get currentUsers() { return currentUsers; },
        get _localStream() { return _localStream; },
        startCall, acceptCall, rejectCall, endCall,
        isUserAtBottom() {
          return (msgBox.scrollHeight - (msgBox.scrollTop + msgBox.clientHeight)) < 80;
        },
        async getMessages() {
          const url = `${CHAT_BASE}/room/${encodeURIComponent(currentRoom)}/messages`;
          const proof = await fetchRoomProof(token, currentRoom);
          const headers = {};
          if (token) headers.Authorization = token;
          if (proof) headers["X-Room-Auth"] = proof;
          const pwd = getRoomPassword(currentRoom);
          if (pwd) headers["X-Room-Password"] = pwd;
          const res = await fetchWithTimeout(url, { headers }, 8000);
          if (res.status === 401 || res.status === 403) {
            const ans = await promptPasswordForRoom(currentRoom, "access");
            if (!ans || !ans.password) throw new Error("Auth required");
            if (ans.remember) { const saved = await postSaveRoomPassword(token, currentRoom, ans.password); if (saved) userRoomPasswords[currentRoom] = ans.password; }
            else sessionRoomPasswords[currentRoom] = ans.password;
            delete roomProofs[currentRoom];
            const proof2 = await fetchRoomProof(token, currentRoom);
            const headers2 = {};
            if (token) headers2.Authorization = token;
            if (proof2) headers2["X-Room-Auth"] = proof2;
            headers2["X-Room-Password"] = ans.password;
            const res2 = await fetchWithTimeout(url, { headers: headers2 }, 8000);
            if (res2.status === 401 || res2.status === 403) throw new Error("Auth failed");
            return res2.json();
          }
          return res.json();
        },
        async sendMessage(text) {
          const success = sendWs({ type: "chat", text });
          if (success) return { success: true };
          const url = `${CHAT_BASE}/room/${encodeURIComponent(currentRoom)}/send`;
          const proof = await fetchRoomProof(token, currentRoom);
          const headers = { "Content-Type": "application/json" };
          if (token) headers.Authorization = token;
          if (proof) headers["X-Room-Auth"] = proof;
          const pwd = getRoomPassword(currentRoom);
          if (pwd) headers["X-Room-Password"] = pwd;
          const res = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify({ text }) }, 8000);
          if (res.status === 401 || res.status === 403) {
            delete roomProofs[currentRoom];
            const ans = await promptPasswordForRoom(currentRoom, "access");
            if (!ans || !ans.password) throw new Error("Auth required");
            if (ans.remember) { const saved = await postSaveRoomPassword(token, currentRoom, ans.password); if (saved) userRoomPasswords[currentRoom] = ans.password; }
            else sessionRoomPasswords[currentRoom] = ans.password;
            const proof2 = await fetchRoomProof(token, currentRoom);
            const headers2 = { "Content-Type": "application/json" };
            if (token) headers2.Authorization = token;
            if (proof2) headers2["X-Room-Auth"] = proof2;
            headers2["X-Room-Password"] = ans.password;
            const res2 = await fetchWithTimeout(url, { method: "POST", headers: headers2, body: JSON.stringify({ text }) }, 8000);
            if (res2.status === 401 || res2.status === 403) throw new Error("Auth failed");
            return res2.json();
          }
          return res.json();
        },
        async loadMessagesOnce({ forceScroll = false } = {}) {
          let data;
          try { data = await this.getMessages(); } catch (e) { return; }
          if (!data || !Array.isArray(data.messages)) return;
          const wasAtBottom = this.isUserAtBottom();
          msgBox.innerHTML = ""; msgBox.appendChild(newMsgBtn);
          data.messages.forEach((m, i) => appendMessageToContainer(msgBox, m, i));
          lastCount = data.messages.length; lastMessages = data.messages;
          if (wasAtBottom || forceScroll) msgBox.scrollTop = msgBox.scrollHeight;
        },
        async start() {
          await this.loadMessagesOnce({ forceScroll: true });
          connectWs();
          pollTimer = setTimeout(slowPoll, SLOW_POLL_MS);
        },
        stop() {
          wsActive = false; wsPaused = true; closeWs();
          if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        },
        pause() {
          wsPaused = true;
          if (!callState) closeWs(); // keep WS alive if a call is in progress
          if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        },
        resume() {
          wsPaused = false; wsActive = true; connectWs();
          pollTimer = setTimeout(slowPoll, SLOW_POLL_MS);
        }
      };
      return ctrl;
    }

    // Initialize controller
    let chatController = makeWsController();
    box._chatController = chatController;
    await chatController.start();

    const TIMESTAMP_REFRESH_MS = 30 * 1000;
    box._timeUpdater = setInterval(() => refreshTimestampsIn(msgBox), TIMESTAMP_REFRESH_MS);
    refreshTimestampsIn(msgBox);

    // --- Send message ---
    async function doSendMessage(text) {
      if (!text) return;
      try {
        await chatController.sendMessage(text);
        newMsgBtn.style.display = "none";
        refreshTimestampsIn(msgBox);
      } catch (e) { alert("Send failed: " + (e && e.message ? e.message : "unknown")); }
    }

    // --- Image UI ---
    imageBtn.addEventListener("click", () => {
      if (imageInputRow.style.display === "none" || imageInputRow.style.display === "") {
        imageInputRow.style.display = "flex"; imageUrlInput.focus();
      } else { imageInputRow.style.display = "none"; }
    });
    imageUrlCancel.addEventListener("click", () => { imageInputRow.style.display = "none"; imageUrlInput.value = ""; });

    function validImageUrlCandidate(u) {
      if (!u || typeof u !== "string") return false;
      const t = u.trim();
      if (!t.length) return false;
      try {
        const url = new URL(t);
        if (!["http:", "https:"].includes(url.protocol)) return false;
        return IMG_EXT_RE.test(url.pathname);
      } catch (e) { return false; }
    }

    imageUrlSend.addEventListener("click", async () => {
      const url = imageUrlInput.value.trim();
      if (!validImageUrlCandidate(url)) { imageUrlInput.style.border = "1px solid #ff5555"; setTimeout(() => imageUrlInput.style.border = "none", 1500); return; }
      await doSendMessage(url);
      imageInputRow.style.display = "none"; imageUrlInput.value = "";
    });

    imageUploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const files = fileInput.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      if (!file.type || !file.type.startsWith("image/")) { alert("Please select an image file."); fileInput.value = ""; return; }
      if (!sessionImgBBKey) sessionImgBBKey = await fetchStoredKeyFromAccount(token);
      if (!sessionImgBBKey) {
        const entered = prompt("No ImgBB API key linked. Paste your ImgBB API key:");
        if (!entered || !entered.trim()) { alert("Upload canceled."); fileInput.value = ""; return; }
        const trimmedKey = entered.trim();
        const saved = await saveKeyToAccount(token, trimmedKey);
        if (!saved) {
          if (!confirm("Failed to save key. Use for this session only?")) { fileInput.value = ""; return; }
          sessionImgBBKey = trimmedKey;
        } else sessionImgBBKey = trimmedKey;
      }
      const prevText = imageUploadBtn.textContent;
      imageUploadBtn.disabled = true; imageUrlSend.disabled = true; imageUrlInput.disabled = true; imageUrlCancel.disabled = true;
      imageUploadBtn.textContent = "Uploading...";
      try {
        const fd = new FormData(); fd.append("file", file); fd.append("key", sessionImgBBKey);
        let res = await fetchWithTimeout(IMAGE_UPLOAD_WORKER, { method: "POST", body: fd }, 120000);
        if (res.status === 400) {
          const text = await res.text().catch(() => "");
          sessionImgBBKey = null;
          if (/key/i.test(text) || confirm("Upload failed (possible invalid key). Re-enter key?")) {
            const entered = prompt("Paste your ImgBB API key:");
            if (entered && entered.trim()) {
              const trimmedKey = entered.trim();
              const saved = await saveKeyToAccount(token, trimmedKey);
              if (!saved) { alert("Could not save key."); fileInput.value = ""; throw new Error("Failed to save key"); }
              sessionImgBBKey = trimmedKey;
              const fd2 = new FormData(); fd2.append("file", file); fd2.append("key", sessionImgBBKey);
              const res2 = await fetchWithTimeout(IMAGE_UPLOAD_WORKER, { method: "POST", body: fd2 }, 120000);
              if (!res2.ok) throw new Error("Upload error: " + res2.status);
              const data2 = await res2.json().catch(() => null);
              const url2 = data2 && (data2.url || (data2.data && data2.data.url));
              if (!url2) throw new Error("No URL returned");
              await doSendMessage(url2);
              imageInputRow.style.display = "none"; imageUrlInput.value = "";
              return;
            } else throw new Error("No key entered");
          } else throw new Error("Upload rejected");
        } else {
          if (!res.ok) { const text = await res.text().catch(() => ""); throw new Error("Upload returned " + res.status + " " + text); }
          const data = await res.json().catch(() => null);
          const url = data && (data.url || (data.data && data.data.url));
          if (!url) throw new Error("No URL returned");
          await doSendMessage(url);
          imageInputRow.style.display = "none"; imageUrlInput.value = "";
        }
      } catch (err) {
        alert("Upload failed: " + (err && err.message ? err.message : "unknown"));
      } finally {
        imageUploadBtn.disabled = false; imageUrlSend.disabled = false; imageUrlInput.disabled = false; imageUrlCancel.disabled = false;
        imageUploadBtn.textContent = prevText || "Upload"; fileInput.value = "";
      }
    });

    imageBtn.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      if (!sessionImgBBKey) { alert("No ImgBB key cached."); return; }
      if (confirm("Clear cached ImgBB key for this session?")) { sessionImgBBKey = null; alert("Cleared."); }
    }, { passive: false });

    // --- Switch room ---
    async function switchRoom(newRoomName) {
      if (!newRoomName || !newRoomName.trim()) { alert("Room name required"); return; }
      const trimmed = newRoomName.trim();
      if (trimmed === currentRoom) { currentRoomDisplay.textContent = `room: ${currentRoom}`; return; }
      chatController.stop();
      if (box._timeUpdater) { clearInterval(box._timeUpdater); box._timeUpdater = null; }
      msgBox.innerHTML = ""; msgBox.appendChild(newMsgBtn);
      currentRoom = trimmed;
      try { localStorage.setItem("dole_chat_room", currentRoom); } catch (e) {}
      if (currentRoomDisplay) currentRoomDisplay.textContent = `room: ${currentRoom}`;
      addRoomToList(currentRoom);
      chatController = makeWsController();
      box._chatController = chatController;
      await chatController.start();
      box._timeUpdater = setInterval(() => refreshTimestampsIn(msgBox), TIMESTAMP_REFRESH_MS);
      refreshTimestampsIn(msgBox);
    }

    // --- Wire send ---
    box.querySelector("#chatSend").onclick = async () => {
      const text = chatInputEl.value.trim();
      if (!text) return;
      await doSendMessage(text);
      chatInputEl.value = "";
    };
    chatInputEl.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = chatInputEl.value.trim();
        if (!text) return;
        await doSendMessage(text);
        chatInputEl.value = "";
      }
    });

    // --- Mutation observer for cleanup ---
    const observer = new MutationObserver(() => {
      if (!document.body.contains(box)) {
        if (box._chatController) try { box._chatController.stop(); } catch (e) {}
        if (box._timeUpdater) { clearInterval(box._timeUpdater); box._timeUpdater = null; }
        if (minIcon && !document.body.contains(minIcon)) minIcon = null;
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    box.switchRoom = switchRoom;
    addRoomToList(currentRoom);
    renderRoomsList();
    setTimeout(() => { try { chatInputEl.focus(); } catch (e) {} }, 300);
  }

  // --- ImgBB key helpers ---
  async function fetchStoredKeyFromAccount(token) {
    try {
      const res = await fetchWithTimeout(`${ACCOUNT_BASE}/user/imgbb-key`, { method: "GET", headers: { Authorization: token } }, 8000);
      if (!res.ok) return null;
      const j = await res.json().catch(() => null);
      if (j && j.success === true && j.key) return String(j.key);
      return null;
    } catch (e) { return null; }
  }
  async function saveKeyToAccount(token, key) {
    try {
      const res = await fetchWithTimeout(`${ACCOUNT_BASE}/user/imgbb-key`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ key })
      }, 8000);
      if (!res.ok) throw new Error("Server returned " + res.status);
      const j = await res.json().catch(() => null);
      if (!j || j.success !== true) throw new Error((j && j.error) ? j.error : "Unknown error");
      return true;
    } catch (e) { return false; }
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[s]);
  }

})();
})();
