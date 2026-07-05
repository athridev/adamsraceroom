"use strict";

(function () {
  const ADMIN_EMAIL = "adamjaljoly@gmail.com";
  const RACE_DURATION_MS = 120000;
  const PEERJS_URLS = [
    "https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.5/peerjs.min.js",
    "https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js",
  ];
  const PEER_OPTIONS = {
    debug: 0,
    config: {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
        { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
      ],
    },
  };

  const shouldUseP2P = () => location.hostname.endsWith("github.io") || new URLSearchParams(location.search).has("p2p");
  if (!shouldUseP2P()) return;

  let peerJsPromise = null;
  const p2p = {
    role: "",
    peer: null,
    conn: null,
    sendConn: null,
    local: null,
    remoteMeta: null,
    reverseStarted: false,
    outbox: [],
    joinAck: false,
    joinLoopStarted: false,
    connectionOpen: false,
    countdownSent: false,
    resultsSent: false,
  };

  const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
  const p2pPeerId = (code) => `japandrift-${String(code || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "")}`;

  function localEls() {
    return {
      createForm: document.querySelector("#create-form"),
      otpForm: document.querySelector("#otp-form"),
      joinForm: document.querySelector("#join-form"),
      message: document.querySelector("#message"),
      status: document.querySelector("#net-status"),
    };
  }

  function setP2PMessage(text, isError = false) {
    const msg = localEls().message;
    if (!msg) return;
    msg.textContent = text || "";
    msg.style.color = isError ? "#ff8e8e" : "#ffd166";
  }

  function hideOtpCode() {
    const code = localEls().otpForm?.elements.code;
    if (!code) return;
    code.required = false;
    code.value = "P2P";
    code.closest("label")?.classList.add("is-hidden");
  }

  function makeSessionCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const values = new Uint8Array(4);
    crypto.getRandomValues(values);
    let out = "JD";
    for (const value of values) out += chars[value % chars.length];
    return out;
  }

  function loadPeerJs() {
    if (window.Peer) return Promise.resolve();
    if (peerJsPromise) return peerJsPromise;
    peerJsPromise = PEERJS_URLS.reduce((chain, url) => chain.catch(() => new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => window.Peer ? resolve() : reject(new Error("PeerJS did not load."));
      script.onerror = () => reject(new Error("PeerJS CDN failed."));
      document.head.append(script);
    })), Promise.reject()).catch((error) => {
      peerJsPromise = null;
      throw error;
    });
    return peerJsPromise;
  }

  function openPeer(id) {
    return new Promise((resolve, reject) => {
      const peer = id ? new Peer(id, PEER_OPTIONS) : new Peer(PEER_OPTIONS);
      let settled = false;
      const timer = setTimeout(() => fail(new Error("Peer service did not answer.")), 12000);
      function fail(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { peer.destroy(); } catch {}
        reject(error);
      }
      peer.on("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(peer);
      });
      peer.on("error", fail);
    });
  }

  function makePlayer(id, name, car, connected = true) {
    return {
      id,
      name: String(name || (id === "p1" ? "Host" : "Challenger")).slice(0, 20),
      car: car || (id === "p1" ? "s15" : "fd"),
      connected,
      ready: false,
      score: 0,
      progress: 0,
      finished: false,
    };
  }

  function resetPeerSession() {
    p2p.sendConn = null;
    p2p.remoteMeta = null;
    p2p.reverseStarted = false;
    p2p.outbox = [];
    p2p.joinAck = false;
    p2p.joinLoopStarted = false;
    p2p.connectionOpen = false;
  }

  function canSendRaw() {
    return Boolean((p2p.sendConn && p2p.sendConn.open) || (p2p.conn && (p2p.conn.open || p2p.connectionOpen)));
  }

  function trySendRaw(payload) {
    const conns = [p2p.sendConn, p2p.conn].filter((conn, index, list) => conn && list.indexOf(conn) === index);
    for (const conn of conns) {
      if (!conn.open && !p2p.connectionOpen) continue;
      try {
        conn.send(payload);
        return true;
      } catch {}
    }
    return false;
  }

  function sendEverywhere(payload) {
    const conns = [p2p.sendConn, p2p.conn].filter((conn, index, list) => conn && list.indexOf(conn) === index);
    let sent = false;
    for (const conn of conns) {
      if (!conn.open && !p2p.connectionOpen) continue;
      try {
        conn.send(payload);
        sent = true;
      } catch {}
    }
    if (!sent) enqueueRaw(payload);
    return sent;
  }

  function enqueueRaw(payload) {
    p2p.outbox.push(payload);
    if (p2p.outbox.length > 80) p2p.outbox.shift();
  }

  function flushRaw() {
    if (!canSendRaw()) return;
    const pending = p2p.outbox.splice(0);
    for (let i = 0; i < pending.length; i++) {
      if (trySendRaw(pending[i])) continue;
      p2p.outbox = pending.slice(i).concat(p2p.outbox);
      while (p2p.outbox.length > 80) p2p.outbox.shift();
      return;
    }
  }

  function sendRaw(payload) {
    if (canSendRaw() && trySendRaw(payload)) {
      return;
    }
    enqueueRaw(payload);
  }

  function markChannelUsable(conn = p2p.conn) {
    if (!conn) return;
    if (!p2p.connectionOpen) {
      p2p.connectionOpen = true;
      localEls().status.textContent = "Peer connected";
      startGuestJoinLoop();
    }
    flushRaw();
  }

  function sendLobbyReliable(payload) {
    sendEverywhere(payload);
    [250, 600, 1200, 2400, 3600].forEach((delay) => {
      setTimeout(() => {
        if (state.mode === "lobby" && !p2p.countdownSent) sendEverywhere(payload);
      }, delay);
    });
  }

  function sendGuestJoin() {
    sendRaw({ type: "join", player: p2p.local });
    sendRaw({ type: "ping", clientTime: Date.now() });
  }

  function startReverseConnection(peerId) {
    if (p2p.role !== "host" || p2p.reverseStarted || !peerId || !p2p.peer?.connect) return;
    p2p.reverseStarted = true;
    try {
      const reverse = p2p.peer.connect(peerId, {
        reliable: true,
        metadata: { name: p2p.local?.name, car: p2p.local?.car, reverse: true },
      });
      setupConnection(reverse, { useForSending: true, announceRemote: false });
    } catch {}
  }

  function startGuestJoinLoop() {
    if (p2p.joinLoopStarted || p2p.role !== "guest") return;
    p2p.joinLoopStarted = true;
    [0, 350, 900, 1800, 3200].forEach((delay) => {
      setTimeout(() => {
        if (p2p.joinAck || state.mode === "results") return;
        sendGuestJoin();
      }, delay);
    });
  }

  function ensureGuest(player = {}) {
    if (!state.room) return null;
    let guest = state.room.players.find((item) => item.id === "p2");
    if (!guest) {
      guest = makePlayer("p2", player.name, player.car, true);
      state.room.players.push(guest);
      return guest;
    }
    const ready = Boolean(guest.ready);
    const score = Number(guest.score || 0);
    const progress = Number(guest.progress || 0);
    const finished = Boolean(guest.finished);
    Object.assign(guest, makePlayer("p2", player.name || guest.name, player.car || guest.car, true));
    guest.ready = ready;
    guest.score = score;
    guest.progress = progress;
    guest.finished = finished;
    return guest;
  }

  function broadcast(type = "presence") {
    if (!state.room) return;
    const packet = { type, room: state.room, players: state.room.players, serverTime: Date.now() };
    if (p2p.role === "host") {
      if (type === "hello" || type === "ready" || type === "presence") sendLobbyReliable(packet);
      else sendEverywhere(packet);
    }
    handleWs(packet);
  }

  function updatePlayer(playerId, data = {}) {
    const player = state.room?.players.find((item) => item.id === playerId);
    if (!player) return null;
    if (typeof data.score === "number") player.score = data.score;
    if (typeof data.progress === "number") player.progress = data.progress;
    if (typeof data.remainingMs === "number") player.remainingMs = data.remainingMs;
    if (data.finishedAt || data.finished) player.finished = true;
    return player;
  }

  function maybeCountdown() {
    if (p2p.role !== "host" || p2p.countdownSent || !state.room) return;
    const ready = state.room.players.length >= 2 && state.room.players.every((player) => player.connected && player.ready);
    if (!ready) return;
    p2p.countdownSent = true;
    const now = Date.now();
    const packet = {
      type: "countdown",
      room: state.room,
      countdownAt: now + 800,
      startedAt: now + 3800,
      serverTime: now,
    };
    sendEverywhere(packet);
    handleWs(packet);
  }

  function showP2PResults(forcedWinnerId = "") {
    if (p2p.resultsSent || !state.room) return;
    p2p.resultsSent = true;
    const players = state.room.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: Number(player.score || 0),
      progress: Number(player.progress || 0),
      connected: player.connected,
    }));
    const winner = forcedWinnerId
      ? players.find((player) => player.id === forcedWinnerId)
      : players.slice().sort((a, b) => (b.score - a.score) || (b.progress - a.progress))[0];
    const result = { winnerId: winner?.id || "", players };
    sendEverywhere({ type: "results", result, serverTime: Date.now() });
    showResults(result);
  }

  function handleFrom(playerId, msg) {
    if (!msg || !state.room) return;
    if (playerId === "p2" && msg.type !== "join") {
      ensureGuest(msg.player || p2p.remoteMeta || p2p.conn?.metadata || {});
    }
    if (msg.type === "join") {
      ensureGuest(msg.player || p2p.remoteMeta || p2p.conn?.metadata || {});
      broadcast("hello");
      return;
    }
    if (msg.type === "ping") {
      sendEverywhere({ type: "pong", serverTime: Date.now(), clientTime: msg.clientTime });
      return;
    }
    if (msg.type === "ready") {
      const player = state.room.players.find((item) => item.id === playerId);
      if (player) player.ready = true;
      broadcast("ready");
      maybeCountdown();
      return;
    }
    if (msg.type === "state") {
      if (playerId === state.playerId) sendEverywhere({ type: "state", playerId, state: msg.state });
      else handleWs({ type: "state", playerId, state: msg.state });
      return;
    }
    if (msg.type === "score") {
      const score = { score: Number(msg.score || 0), progress: Number(msg.progress || 0), finishedAt: msg.finishedAt || null, remainingMs: msg.remainingMs };
      updatePlayer(playerId, score);
      sendEverywhere({ type: "score", playerId, score, serverTime: Date.now() });
      return;
    }
    if (msg.type === "finish") {
      updatePlayer(playerId, { score: Number(msg.score || 0), progress: Number(msg.progress || 0), remainingMs: msg.remainingMs, finished: true });
      sendEverywhere({ type: "player-finished", playerId, serverTime: Date.now() });
      if (state.room.players.every((player) => player.finished)) showP2PResults();
    }
  }

  function handlePeerMessage(msg, conn = p2p.conn) {
    markChannelUsable(conn);
    if (p2p.role === "host") {
      handleFrom("p2", msg);
      return;
    }
    if (msg.type === "hello") p2p.joinAck = true;
    if (msg.type === "reject") {
      setP2PMessage(msg.reason || "Room is full.", true);
      return;
    }
    handleWs(msg);
  }

  function handlePeerDisconnect(conn = p2p.conn) {
    if (conn === p2p.sendConn) p2p.sendConn = null;
    if (conn === p2p.conn) p2p.conn = null;
    if (p2p.conn || p2p.sendConn) {
      p2p.connectionOpen = true;
      return;
    }
    p2p.connectionOpen = false;
    p2p.outbox = [];
    p2p.joinAck = false;
    if (!state.room || state.mode === "results") return;
    const remoteId = state.playerId === "p1" ? "p2" : "p1";
    const remote = state.room.players.find((player) => player.id === remoteId);
    if (remote) remote.connected = false;
    localEls().status.textContent = "Opponent disconnected";
    if (state.mode === "race") {
      if (p2p.role === "host") showP2PResults(state.playerId);
      else showResults({ winnerId: state.playerId, players: state.room.players.map((player) => ({ ...player, score: Number(player.score || 0) })) });
    } else if (typeof renderLobby === "function") {
      renderLobby();
    }
  }

  function setupConnection(conn, options = {}) {
    const useForSending = options.useForSending !== false;
    const announceRemote = options.announceRemote !== false;
    if (!p2p.conn) p2p.conn = conn;
    if (useForSending) p2p.sendConn = conn;
    p2p.connectionOpen = false;

    const markOpen = () => {
      markChannelUsable(conn);
    };

    conn.on("open", markOpen);
    conn.on("data", (msg) => handlePeerMessage(msg, conn));
    conn.on("close", () => handlePeerDisconnect(conn));
    conn.on("error", () => handlePeerDisconnect(conn));

    if (p2p.role === "host" && announceRemote) {
      const meta = conn.metadata || {};
      p2p.remoteMeta = meta;
      handleFrom("p2", { type: "join", player: { name: meta.name, car: meta.car } });
      startReverseConnection(conn.peer);
    }

    setTimeout(() => { if (conn.open) markOpen(); }, 0);
    setTimeout(() => { if (conn.open) markOpen(); }, 300);
    setTimeout(() => { if (conn.open) markOpen(); }, 900);
  }

  async function createRoom(form) {
    await loadPeerJs();
    state.transport = "p2p";
    p2p.role = "host";
    state.playerId = "p1";
    state.playerToken = "p2p-host";
    p2p.local = makePlayer("p1", form.name, form.car, true);
    resetPeerSession();
    p2p.countdownSent = false;
    p2p.resultsSent = false;
    state.serverOffset = 0;

    let code = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      code = makeSessionCode();
      try {
        p2p.peer = await openPeer(p2pPeerId(code));
        break;
      } catch (error) {
        if (!/unavailable|taken|id/i.test(String(error?.message || error))) throw error;
      }
    }
    if (!p2p.peer) throw new Error("Could not reserve a peer room code.");

    state.room = { code, raceDurationMs: RACE_DURATION_MS, players: [p2p.local] };
    p2p.peer.on("connection", (conn) => {
      if (p2p.conn) {
        conn.on("open", () => conn.send({ type: "reject", reason: "Room already has two drivers." }));
        setTimeout(() => conn.close(), 400);
        return;
      }
      setupConnection(conn, { useForSending: false });
    });
    p2p.peer.on("error", (error) => setP2PMessage(error.message || "Peer service error.", true));
    showLobby(state.room);
    localEls().status.textContent = "Share this code with your friend";
  }

  async function joinRoom(form) {
    await loadPeerJs();
    state.transport = "p2p";
    p2p.role = "guest";
    state.playerId = "p2";
    state.playerToken = "p2p-guest";
    p2p.local = makePlayer("p2", form.name, form.car, true);
    resetPeerSession();
    p2p.countdownSent = false;
    p2p.resultsSent = false;

    const code = String(form.code || "").trim().toUpperCase();
    p2p.peer = await openPeer();
    p2p.peer.on("connection", (conn) => setupConnection(conn, { useForSending: false, announceRemote: false }));
    state.room = {
      code,
      raceDurationMs: RACE_DURATION_MS,
      players: [makePlayer("p1", "Host", "s15", true), p2p.local],
    };
    showLobby(state.room);
    localEls().status.textContent = "Connecting to peer room";
    setupConnection(p2p.peer.connect(p2pPeerId(code), { reliable: true, metadata: { name: p2p.local.name, car: p2p.local.car } }), { useForSending: true, announceRemote: false });
  }

  const originalSendWs = sendWs;
  sendWs = function (payload) {
    if (state.transport !== "p2p") {
      originalSendWs(payload);
      return;
    }
    if (p2p.role === "host") handleFrom("p1", payload);
    else if (payload?.type === "ready") sendLobbyReliable(payload);
    else sendEverywhere(payload);
  };

  const originalHandleWs = handleWs;
  handleWs = function (msg) {
    if (state.transport === "p2p") {
      if ((msg.type === "hello" || msg.type === "presence" || msg.type === "ready") && state.mode !== "lobby") {
        if (msg.room) state.room = msg.room;
        if (state.room && msg.players) state.room.players = msg.players;
        return;
      }
      if (msg.type === "countdown" && (state.mode === "race" || state.mode === "results")) return;
    }
    originalHandleWs(msg);
  };

  if (typeof startRace === "function") {
    const originalStartRace = startRace;
    startRace = function () {
      state.remoteHistory = [];
      try { accumulator = 0; } catch {}
      originalStartRace();
    };
  }

  const { createForm, otpForm, joinForm, status } = localEls();
  if (status) status.textContent = "Peer rooms ready";

  document.querySelector("#ready-button")?.addEventListener("click", (event) => {
    if (state.transport !== "p2p") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!state.room || state.mode !== "lobby") return;
    state.ready = true;
    const me = state.room.players.find((player) => player.id === state.playerId);
    if (me) {
      me.ready = true;
      renderLobby();
    }
    event.currentTarget.textContent = "Ready";
    if (p2p.role === "host") handleFrom("p1", { type: "ready" });
    else sendLobbyReliable({ type: "ready" });
  }, true);

  createForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const data = Object.fromEntries(new FormData(createForm).entries());
    if (normalizeEmail(data.email) !== ADMIN_EMAIL) {
      setP2PMessage("Only the admin email can create rooms.", true);
      return;
    }
    state.transport = "p2p";
    state.p2pFallback = true;
    hideOtpCode();
    createForm.classList.add("is-hidden");
    otpForm.classList.remove("is-hidden");
    status.textContent = "Peer-to-peer room setup";
    setP2PMessage("Choose your driver and create a room. Send the code to your friend.");
  }, true);

  otpForm?.addEventListener("submit", async (event) => {
    if (state.transport !== "p2p" || !state.p2pFallback) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setP2PMessage("Creating peer room...");
    try {
      await createRoom(Object.fromEntries(new FormData(otpForm).entries()));
    } catch (error) {
      setP2PMessage(error.message || "Could not create peer room.", true);
    }
  }, true);

  joinForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    setP2PMessage("Connecting peer-to-peer...");
    try {
      await joinRoom(Object.fromEntries(new FormData(joinForm).entries()));
    } catch (error) {
      setP2PMessage(error.message || "Peer room not found.", true);
    }
  }, true);
})();
