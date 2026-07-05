"use strict";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const angNorm = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

const CTRL = [
  [1350, 1250, 150], [1550, 950, 150], [1850, 700, 152], [2250, 620, 156],
  [2600, 780, 164], [2720, 1080, 176], [2560, 1350, 164], [2200, 1420, 156],
  [1850, 1330, 150], [1600, 1120, 146], [1350, 900, 150], [1050, 700, 156],
  [680, 620, 172], [380, 800, 204], [300, 1120, 226], [430, 1420, 220],
  [760, 1560, 208], [1100, 1480, 178],
];

const CARS = [
  { id: "ae86", name: "AE-86", body: "#f2efe7", body2: "#8f8c84", accent: "#17171d", glow: "#ffb14d",
    phys: { accel: 318, maxSpeed: 580, brake: 620, drag: 0.30, grip: 7.4, driftGrip: 0.34, ebrakeGrip: 0.17, turn: 3.0, driftTurn: 2.35, slideYaw: 0.95, kick: 0.12, driftFriction: 0.16 } },
  { id: "s15", name: "S-15", body: "#ffd23e", body2: "#9d7a14", accent: "#15161d", glow: "#55e0ff",
    phys: { accel: 355, maxSpeed: 630, brake: 650, drag: 0.32, grip: 8.2, driftGrip: 0.30, ebrakeGrip: 0.15, turn: 2.8, driftTurn: 2.1, slideYaw: 1.05, kick: 0.12, driftFriction: 0.28 } },
  { id: "fd", name: "FD-3S", body: "#ff4438", body2: "#8d1d14", accent: "#1a1b22", glow: "#b06bff",
    phys: { accel: 385, maxSpeed: 665, brake: 665, drag: 0.32, grip: 8.6, driftGrip: 0.24, ebrakeGrip: 0.12, turn: 3.05, driftTurn: 2.2, slideYaw: 1.2, kick: 0.14, driftFriction: 0.40 } },
  { id: "r34", name: "R-34", body: "#3f7bff", body2: "#1b3a8f", accent: "#12131a", glow: "#55e0ff",
    phys: { accel: 400, maxSpeed: 690, brake: 700, drag: 0.33, grip: 9.6, driftGrip: 0.40, ebrakeGrip: 0.16, turn: 2.6, driftTurn: 1.8, slideYaw: 0.8, kick: 0.10, driftFriction: 0.30 } },
  { id: "a80", name: "A-80", body: "#ff7a1a", body2: "#903f05", accent: "#17181f", glow: "#7dffb0",
    phys: { accel: 392, maxSpeed: 685, brake: 680, drag: 0.33, grip: 8.4, driftGrip: 0.27, ebrakeGrip: 0.13, turn: 2.55, driftTurn: 1.95, slideYaw: 1.1, kick: 0.13, driftFriction: 0.34 } },
];

const DEFAULT_GEARBOX = {
  tops: [0.26, 0.45, 0.64, 0.82, 1],
  ratios: [3.45, 2.08, 1.42, 1.05, 0.82],
  idle: 0.15, redline: 1.02, up: 0.92, down: 0.36,
  shiftDelay: 0.42, minHold: 1.12,
};
const GEARBOX_BY_CAR = {
  ae86: { tops: [0.24, 0.43, 0.62, 0.80, 1], ratios: [3.59, 2.02, 1.38, 1.00, 0.86], up: 0.94, down: 0.39, shiftDelay: 0.38, minHold: 1.14 },
  s15: { tops: [0.25, 0.44, 0.63, 0.82, 1], ratios: [3.32, 1.90, 1.31, 1.00, 0.76], up: 0.91, down: 0.35, shiftDelay: 0.40, minHold: 1.12 },
  fd: { tops: [0.27, 0.46, 0.65, 0.83, 1], ratios: [3.48, 2.02, 1.39, 1.00, 0.72], up: 0.96, down: 0.37, shiftDelay: 0.36, minHold: 1.04 },
  r34: { tops: [0.25, 0.43, 0.62, 0.81, 1], ratios: [3.83, 2.36, 1.69, 1.31, 1.00], up: 0.90, down: 0.34, shiftDelay: 0.42, minHold: 1.20 },
  a80: { tops: [0.27, 0.47, 0.66, 0.84, 1], ratios: [3.83, 2.36, 1.53, 1.00, 0.79], up: 0.91, down: 0.34, shiftDelay: 0.44, minHold: 1.20 },
};
for (const car of CARS) car.gearbox = Object.assign({}, DEFAULT_GEARBOX, GEARBOX_BY_CAR[car.id] || {});

function buildTrack() {
  const SEG = 40;
  const pts = [];
  for (let i = 0; i < CTRL.length; i++) {
    const p0 = CTRL[(i - 1 + CTRL.length) % CTRL.length];
    const p1 = CTRL[i];
    const p2 = CTRL[(i + 1) % CTRL.length];
    const p3 = CTRL[(i + 2) % CTRL.length];
    for (let j = 0; j < SEG; j++) {
      const t = j / SEG, t2 = t * t, t3 = t2 * t;
      const q = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
      pts.push({ x: q(p0[0], p1[0], p2[0], p3[0]), y: q(p0[1], p1[1], p2[1], p3[1]), w: q(p0[2], p1[2], p2[2], p3[2]) });
    }
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x - p.w); maxX = Math.max(maxX, p.x + p.w);
    minY = Math.min(minY, p.y - p.w); maxY = Math.max(maxY, p.y + p.w);
  }
  const margin = 360, ox = margin - minX, oy = margin - minY;
  for (const p of pts) { p.x += ox; p.y += oy; }
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const back = pts[(i - 1 + pts.length) % pts.length], next = pts[(i + 1) % pts.length];
    let tx = next.x - back.x, ty = next.y - back.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    a.tx = tx; a.ty = ty; a.nx = -ty; a.ny = tx;
    a.segLen = Math.hypot(b.x - a.x, b.y - a.y);
    total += a.segLen;
  }
  const sx = 2050 + ox, sy = 660 + oy;
  let startIdx = 0, best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = (pts[i].x - sx) ** 2 + (pts[i].y - sy) ** 2;
    if (d < best) { best = d; startIdx = i; }
  }
  return { pts, total, startIdx, N: pts.length, worldW: maxX - minX + 2 * margin, worldH: maxY - minY + 2 * margin };
}

const TRACK = buildTrack();
const CAR_BY_ID = Object.fromEntries(CARS.map((car) => [car.id, car]));

const els = {
  cv: document.querySelector("#game"),
  shell: document.querySelector("#shell"),
  landing: document.querySelector("#landing-panel"),
  lobby: document.querySelector("#lobby-panel"),
  createTab: document.querySelector("#create-tab"),
  joinTab: document.querySelector("#join-tab"),
  createForm: document.querySelector("#create-form"),
  otpForm: document.querySelector("#otp-form"),
  joinForm: document.querySelector("#join-form"),
  hostCar: document.querySelector("#host-car"),
  guestCar: document.querySelector("#guest-car"),
  message: document.querySelector("#message"),
  status: document.querySelector("#net-status"),
  copyCode: document.querySelector("#copy-code"),
  drivers: document.querySelector("#drivers"),
  ready: document.querySelector("#ready-button"),
  leave: document.querySelector("#leave-button"),
  hud: document.querySelector("#race-hud"),
  speed: document.querySelector("#hud-speed"),
  gear: document.querySelector("#hud-gear"),
  rpm: document.querySelector("#hud-rpm"),
  score: document.querySelector("#hud-score"),
  time: document.querySelector("#hud-time"),
  countdown: document.querySelector("#countdown"),
  results: document.querySelector("#results"),
  resultTitle: document.querySelector("#result-title"),
  resultList: document.querySelector("#result-list"),
  backOnline: document.querySelector("#back-online"),
  touch: document.querySelector("#touch-controls"),
};

for (const select of [els.hostCar, els.guestCar]) {
  for (const car of CARS) {
    const opt = document.createElement("option");
    opt.value = car.id;
    opt.textContent = car.name;
    select.append(opt);
  }
}
els.hostCar.value = "s15";
els.guestCar.value = "fd";

const ctx = els.cv.getContext("2d");
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = clamp(window.devicePixelRatio || 1, 1, 1.75);
  W = innerWidth; H = innerHeight;
  els.cv.width = Math.round(W * DPR);
  els.cv.height = Math.round(H * DPR);
  els.cv.style.width = W + "px";
  els.cv.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener("resize", resize);
resize();

const state = {
  mode: "landing",
  challengeId: "",
  room: null,
  playerId: "",
  playerToken: "",
  socket: null,
  car: null,
  remote: null,
  remoteHistory: [],
  keys: {},
  touch: { left: false, right: false, gas: false, brake: false, ebrake: false },
  gamepadActive: false,
  ready: false,
  countdownAt: 0,
  startedAt: 0,
  raceDurationMs: 120000,
  sentFinish: false,
  lastStateSend: 0,
  lastScoreSend: 0,
  lastPing: 0,
  serverOffset: 0,
  camera: { x: TRACK.pts[TRACK.startIdx].x, y: TRACK.pts[TRACK.startIdx].y, z: 1 },
};

function setMessage(text, isError = false) {
  els.message.textContent = text || "";
  els.message.style.color = isError ? "#ff8e8e" : "#ffd166";
}

function api(path, options = {}) {
  return fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || "Request failed.");
      error.body = body;
      throw error;
    }
    return body;
  });
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function showCreate() {
  els.createTab.classList.add("is-active");
  els.joinTab.classList.remove("is-active");
  els.createForm.classList.remove("is-hidden");
  els.otpForm.classList.add("is-hidden");
  els.joinForm.classList.add("is-hidden");
  setMessage("");
}

function showJoin() {
  els.joinTab.classList.add("is-active");
  els.createTab.classList.remove("is-active");
  els.createForm.classList.add("is-hidden");
  els.otpForm.classList.add("is-hidden");
  els.joinForm.classList.remove("is-hidden");
  setMessage("");
}

function showLobby(room) {
  state.mode = "lobby";
  state.room = room;
  els.shell.classList.remove("is-hidden");
  els.landing.classList.add("is-hidden");
  els.lobby.classList.remove("is-hidden");
  els.hud.classList.add("is-hidden");
  els.results.classList.add("is-hidden");
  renderLobby();
}

function renderLobby() {
  const room = state.room;
  if (!room) return;
  els.copyCode.textContent = room.code;
  els.status.textContent = room.players.length < 2 ? "Waiting for second driver" : "Both drivers connected";
  els.drivers.innerHTML = room.players.map((player) => `
    <div class="driver">
      <div><strong>${escapeHtml(player.name)}</strong><span>${escapeHtml((CAR_BY_ID[player.car] || CARS[0]).name)} · ${player.connected ? "connected" : "offline"}</span></div>
      <span class="pill ${player.ready ? "ready" : ""}">${player.ready ? "Ready" : "Lobby"}</span>
    </div>
  `).join("");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const q = new URLSearchParams({
    code: state.room.code,
    playerId: state.playerId,
    token: state.playerToken,
  });
  return `${proto}//${location.host}/api/online/ws?${q}`;
}

function connectSocket() {
  if (state.socket) state.socket.close();
  state.socket = new WebSocket(wsUrl());
  state.socket.addEventListener("open", () => {
    els.status.textContent = "Realtime connected";
    sendWs({ type: "ping", clientTime: Date.now() });
  });
  state.socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    handleWs(msg);
  });
  state.socket.addEventListener("close", () => {
    if (state.mode !== "results") {
      els.status.textContent = "Realtime reconnecting";
      setTimeout(() => state.room && connectSocket(), 1200);
    }
  });
}

function sendWs(payload) {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify(payload));
  }
}

function handleWs(msg) {
  if (msg.type === "pong") {
    state.serverOffset = Number(msg.serverTime || Date.now()) - Date.now();
    return;
  }
  if (msg.room) state.room = msg.room;
  if (msg.type === "hello") {
    state.room = msg.room;
    state.raceDurationMs = msg.room.raceDurationMs || 120000;
    renderLobby();
    return;
  }
  if (msg.type === "presence" || msg.type === "ready") {
    if (state.room) state.room.players = msg.players || state.room.players;
    renderLobby();
    return;
  }
  if (msg.type === "countdown") {
    state.countdownAt = Number(msg.countdownAt || 0);
    state.startedAt = Number(msg.startedAt || msg.countdownAt || 0);
    state.raceDurationMs = msg.room?.raceDurationMs || state.raceDurationMs;
    startRace();
    return;
  }
  if (msg.type === "state" && msg.playerId !== state.playerId) {
    state.remoteHistory.push({ ...msg.state, receivedAt: performance.now() });
    if (state.remoteHistory.length > 12) state.remoteHistory.shift();
    return;
  }
  if (msg.type === "score" && state.room) {
    const player = state.room.players.find((p) => p.id === msg.playerId);
    if (player) Object.assign(player, msg.score);
    return;
  }
  if (msg.type === "player-finished") {
    els.status.textContent = "Opponent finished";
    return;
  }
  if (msg.type === "results") {
    showResults(msg.result);
  }
}

function nearestSample(x, y, from = TRACK.startIdx, win = 64) {
  let bi = from, bd = Infinity;
  for (let k = -win; k <= win; k++) {
    const i = (from + k + TRACK.N) % TRACK.N;
    const p = TRACK.pts[i];
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  return { i: bi, d: Math.sqrt(bd) };
}

function gearTopSpeed(spec, gearI) {
  const gb = spec.gearbox;
  return spec.phys.maxSpeed * gb.tops[clamp(gearI, 0, gb.tops.length - 1)];
}
function gearRpmTarget(car, speed, gearI, throttle) {
  const gb = car.spec.gearbox;
  const top = Math.max(1, gearTopSpeed(car.spec, gearI));
  const prevTop = gearI > 0 ? gearTopSpeed(car.spec, gearI - 1) : 0;
  const low = prevTop * 0.5;
  const band = Math.max(1, top - low);
  let rpm = gb.idle + (gb.redline - gb.idle) * clamp((speed - low) / band, 0, 1.12);
  if (speed < 55) rpm = Math.max(rpm, gb.idle + throttle * 0.46);
  return clamp(rpm, gb.idle * 0.8, gb.redline + 0.1);
}
function gearboxPull(car) {
  const gb = car.spec.gearbox;
  const ratios = gb.ratios;
  const first = ratios[0], last = ratios[ratios.length - 1];
  const ratio = ratios[clamp(car.gearI || 0, 0, ratios.length - 1)];
  const ratioN = clamp((ratio - last) / Math.max(0.01, first - last), 0, 1);
  const torqueBand = 0.62 + 0.38 * clamp(((car.rpm || gb.idle) - 0.20) / 0.55, 0, 1);
  const limiterFade = 0.24 * clamp(((car.rpm || gb.idle) - 0.96) / 0.16, 0, 1);
  return clamp((0.62 + ratioN * 0.38) * (torqueBand - limiterFade), 0.42, 1.02);
}
function updateGearbox(car, dt, speed, throttle, brake) {
  const gb = car.spec.gearbox;
  const maxGear = gb.tops.length - 1;
  car.gearI = clamp(car.gearI || 0, 0, maxGear);
  car.shiftT = Math.max(0, (car.shiftT || 0) - dt);
  car.gearHold = Math.max(0, (car.gearHold || 0) - dt);
  if (speed < 32 && car.gearI > 0) {
    car.gearI = 0; car.shiftT = 0; car.gearHold = 0.18;
    car.rpm = lerp(car.rpm || gb.idle, gearRpmTarget(car, speed, 0, throttle), clamp(dt * 14, 0, 1));
    car.gear = 1;
    return;
  }
  const rpmNow = gearRpmTarget(car, speed, car.gearI, throttle);
  const upAt = gb.up + (throttle < 0.55 ? 0.04 : 0) - (car.drifting ? 0.02 : 0);
  const downAt = gb.down + (throttle > 0.55 ? 0.05 : 0) + (brake > 0.25 ? 0.03 : 0);
  let dir = 0;
  if (car.shiftT <= 0 && car.gearHold <= 0) {
    if (throttle > 0.28 && car.gearI < maxGear && rpmNow >= upAt) dir = 1;
    else if (car.gearI > 0) {
      const prevTop = gearTopSpeed(car.spec, car.gearI - 1);
      if (rpmNow <= downAt || speed < prevTop * 0.52) dir = -1;
    }
  }
  if (dir) {
    car.gearI = clamp(car.gearI + dir, 0, maxGear);
    car.shiftT = gb.shiftDelay;
    car.gearHold = gb.minHold + gb.shiftDelay;
  }
  let rpmT = gearRpmTarget(car, speed, car.gearI, throttle);
  if (dir > 0) rpmT = Math.min(rpmT, Math.max(gb.idle, rpmNow * 0.64));
  if (dir < 0) rpmT = Math.max(rpmT, Math.min(gb.redline + 0.08, rpmNow + 0.22));
  car.rpm = lerp(car.rpm || gb.idle, rpmT, clamp(dt * (car.shiftT > 0 ? 12 : 8), 0, 1));
  car.gear = car.gearI + 1;
}

function spawnCar(spec, lane) {
  const p = TRACK.pts[TRACK.startIdx];
  return {
    spec,
    x: p.x + p.nx * lane,
    y: p.y + p.ny * lane,
    h: Math.atan2(p.ty, p.tx),
    vx: 0, vy: 0, steer: 0, slip: 0, drifting: false, speed: 0,
    prog: TRACK.startIdx, progress: 0, gearI: 0, gear: 1, gearHold: 0.82, shiftT: 0, rpm: 0,
    score: 0, chain: 0, chainT: 0, finished: false,
  };
}

function inputState() {
  const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  const gp = pads[0];
  state.gamepadActive = Boolean(gp);
  els.touch.classList.toggle("is-visible", !state.gamepadActive && state.mode === "race");
  let st = 0, thr = 0, brk = 0, eb = false;
  if (gp) {
    st += Math.abs(gp.axes[0] || 0) > 0.12 ? gp.axes[0] : 0;
    thr = Math.max(thr, gp.buttons[7]?.value || (gp.buttons[0]?.pressed ? 1 : 0));
    brk = Math.max(brk, gp.buttons[6]?.value || (gp.buttons[1]?.pressed ? 1 : 0));
    eb = eb || Boolean(gp.buttons[2]?.pressed || gp.buttons[5]?.pressed);
  }
  st += (state.keys.ArrowLeft || state.keys.KeyA || state.touch.left ? -1 : 0);
  st += (state.keys.ArrowRight || state.keys.KeyD || state.touch.right ? 1 : 0);
  thr = Math.max(thr, state.keys.ArrowUp || state.keys.KeyW || state.touch.gas ? 1 : 0);
  brk = Math.max(brk, state.keys.ArrowDown || state.keys.KeyS || state.touch.brake ? 1 : 0);
  eb = eb || state.keys.Space || state.keys.ShiftLeft || state.keys.ShiftRight || state.touch.ebrake;
  return { st: clamp(st, -1, 1), thr, brk, eb };
}

function stepCar(car, dt, input) {
  const P = car.spec.phys;
  car.steer = clamp(car.steer + clamp(input.st - car.steer, -8 * dt, 8 * dt), -1, 1);
  const cos = Math.cos(car.h), sin = Math.sin(car.h);
  let vf = car.vx * cos + car.vy * sin;
  let vr = -car.vx * sin + car.vy * cos;
  const speed = Math.hypot(car.vx, car.vy);
  updateGearbox(car, dt, speed, input.thr, input.brk);

  const a1 = Math.abs(car.slip);
  const satStart = input.eb ? 0.75 : 1.2;
  const satRamp = input.eb ? 0.4 : 0.5;
  const sideways = clamp((a1 - satStart) / satRamp, 0, 1) * clamp((2.9 - a1) / 0.25, 0, 1);
  const shiftCut = (car.shiftT || 0) > 0.08 ? 0.1 : 1;
  if (input.thr && vf < P.maxSpeed) vf += P.accel * gearboxPull(car) * input.thr * (1 - 0.9 * sideways) * shiftCut * dt;
  if (input.brk) vf -= (vf > 25 ? P.brake : P.accel * 0.45) * input.brk * dt;
  vf -= vf * P.drag * dt;
  vf = clamp(vf, -P.maxSpeed * 0.3, P.maxSpeed);

  let sp = Math.hypot(vf, vr);
  let sa = Math.atan2(vr, vf);
  const slip = sa;
  car.drifting = Math.abs(slip) > 0.19 && Math.abs(slip) < 2.6 && sp > 100;
  let grip = P.grip;
  if (input.eb) grip *= P.ebrakeGrip;
  else if (car.drifting) grip *= P.driftGrip;
  const tgt = vf >= 0 ? 0 : Math.PI * (sa >= 0 ? 1 : -1);
  const sat = clamp((Math.abs(sa - tgt) - satStart) / satRamp, 0, 1);
  grip *= 1 - 0.92 * sat;
  sa = tgt + (sa - tgt) * Math.exp(-grip * dt);
  if (input.eb) sp -= sp * 0.55 * dt;
  if (car.drifting) sp -= sp * P.driftFriction * Math.abs(Math.sin(sa)) * dt;
  vf = Math.cos(sa) * sp;
  vr = Math.sin(sa) * sp;

  const sf = clamp(speed / 230, 0, 1) * (1 - clamp(speed / (P.maxSpeed * 1.5), 0, 0.32));
  let yaw = car.steer * P.turn * sf;
  if (car.drifting) yaw += car.steer * P.driftTurn * clamp(Math.abs(slip) / 0.9, 0, 1);
  yaw += clamp(vr * 0.0035, -1, 1) * P.slideYaw;
  if (vf < -5 && Math.abs(sa) > 2.6) yaw = -yaw;
  car.h += yaw * dt;
  if (input.eb && !car.prevEb && speed > 150 && Math.abs(car.steer) > 0.25) car.h += Math.sign(car.steer) * P.kick;
  car.prevEb = input.eb;

  car.vx = cos * vf - sin * vr;
  car.vy = sin * vf + cos * vr;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = Math.hypot(car.vx, car.vy);
  car.slip = slip;

  const ns = nearestSample(car.x, car.y, car.prog);
  car.prog = ns.i;
  const track = TRACK.pts[ns.i];
  if (ns.d > track.w / 2 + 18) {
    car.vx *= 1 - 1.8 * dt;
    car.vy *= 1 - 1.8 * dt;
  }
  car.progress = ((car.prog - TRACK.startIdx + TRACK.N) % TRACK.N) / TRACK.N;
  updateScore(car, dt, ns.d, track.w);
}

function updateScore(car, dt, dist, width) {
  if (car.drifting && car.speed > 120 && dist < width / 2 + 12) {
    const angle = clamp(Math.abs(car.slip) / 1.3, 0, 1);
    const pace = clamp(car.speed / 520, 0.2, 1.4);
    car.chain += (22 + angle * 64) * pace * dt;
    car.chainT = 1.4;
    car.score += Math.round((16 + car.chain * 0.08) * angle * pace);
  } else {
    car.chainT -= dt;
    if (car.chainT <= 0) car.chain = Math.max(0, car.chain - 70 * dt);
  }
}

function startRace() {
  const myPlayer = state.room.players.find((player) => player.id === state.playerId);
  const remotePlayer = state.room.players.find((player) => player.id !== state.playerId);
  state.car = spawnCar(CAR_BY_ID[myPlayer?.car] || CARS[1], state.playerId === "p1" ? -28 : 28);
  state.remote = spawnCar(CAR_BY_ID[remotePlayer?.car] || CARS[2], state.playerId === "p1" ? 28 : -28);
  state.remote.name = remotePlayer?.name || "Opponent";
  state.mode = "race";
  state.sentFinish = false;
  els.shell.classList.add("is-hidden");
  els.hud.classList.remove("is-hidden");
  els.results.classList.add("is-hidden");
}

function drawTrack() {
  const cam = state.camera;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -cam.y);
  ctx.fillStyle = "#170b22";
  ctx.fillRect(cam.x - W / cam.z, cam.y - H / cam.z, W * 2 / cam.z, H * 2 / cam.z);
  ctx.strokeStyle = "#2a2630";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 260;
  pathTrack();
  ctx.stroke();
  ctx.strokeStyle = "#3a3540";
  ctx.lineWidth = 172;
  pathTrack();
  ctx.stroke();
  ctx.strokeStyle = "#6a5f71";
  ctx.lineWidth = 2;
  pathTrack();
  ctx.stroke();
  const s = TRACK.pts[TRACK.startIdx];
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(Math.atan2(s.ty, s.tx));
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  for (let i = -4; i <= 4; i++) ctx.fillRect(-4, i * 16, 8, 8);
  ctx.restore();
  ctx.restore();
}

function pathTrack() {
  ctx.beginPath();
  for (let i = 0; i < TRACK.N; i++) {
    const p = TRACK.pts[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

function drawCar(car, remote = false) {
  if (!car) return;
  const cam = state.camera;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -cam.y);
  ctx.translate(car.x, car.y);
  ctx.rotate(car.h);
  ctx.shadowColor = car.spec.glow;
  ctx.shadowBlur = car.drifting ? 20 : 8;
  ctx.globalAlpha = remote ? 0.88 : 1;
  ctx.fillStyle = car.spec.accent;
  ctx.fillRect(-18, -9, 36, 18);
  ctx.fillStyle = car.spec.body;
  ctx.fillRect(-15, -10, 30, 20);
  ctx.fillStyle = car.spec.body2;
  ctx.fillRect(-4, -8, 12, 16);
  ctx.fillStyle = "#06070a";
  ctx.fillRect(7, -8, 7, 16);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(14, -7, 3, 5);
  ctx.fillRect(14, 2, 3, 5);
  if (car.drifting) {
    ctx.globalAlpha *= 0.34;
    ctx.fillStyle = "#d8e7ef";
    ctx.beginPath();
    ctx.ellipse(-24, 0, 28, 13, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawRemoteName() {
  if (!state.remote) return;
  const cam = state.camera;
  const sx = W / 2 + (state.remote.x - cam.x) * cam.z;
  const sy = H / 2 + (state.remote.y - cam.y) * cam.z - 34;
  ctx.save();
  ctx.font = "800 12px system-ui";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.fillText(state.remote.name || "Opponent", sx, sy);
  ctx.restore();
}

function updateRemote() {
  if (!state.remote || state.remoteHistory.length === 0) return;
  const target = state.remoteHistory[state.remoteHistory.length - 1];
  const t = clamp((performance.now() - target.receivedAt) / 130, 0, 1);
  state.remote.x = lerp(state.remote.x, target.x, 0.24 + 0.34 * t);
  state.remote.y = lerp(state.remote.y, target.y, 0.24 + 0.34 * t);
  state.remote.h = state.remote.h + angNorm(target.h - state.remote.h) * (0.26 + 0.34 * t);
  state.remote.speed = target.speed;
  state.remote.gear = target.gear;
  state.remote.rpm = target.rpm;
  state.remote.drifting = target.drifting;
}

function formatTimer(ms) {
  ms = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(ms / 60);
  const s = ms % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function updateHud(remainingMs) {
  const car = state.car;
  els.speed.textContent = Math.round(car.speed * 0.35);
  els.gear.textContent = `G${car.gear}`;
  els.rpm.style.display = "block";
  els.rpm.style.width = `${Math.round(clamp(car.rpm, 0, 1) * 64)}px`;
  els.rpm.style.height = "3px";
  els.rpm.style.background = car.rpm > 0.92 ? "#ff5a5a" : "#75e8ff";
  els.score.textContent = Math.round(car.score);
  els.time.textContent = formatTimer(remainingMs);
}

let last = performance.now();
let accumulator = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  drawTrack();
  if (state.mode === "race" && state.car) {
    const serverNow = Date.now() + state.serverOffset;
    const remainingMs = state.startedAt + state.raceDurationMs - serverNow;
    if (serverNow < state.startedAt) {
      els.countdown.classList.remove("is-hidden");
      const left = Math.ceil((state.startedAt - serverNow) / 1000);
      els.countdown.textContent = left > 0 ? left : "GO";
    } else {
      els.countdown.classList.add("is-hidden");
      accumulator += dt;
      while (accumulator >= 1 / 120) {
        stepCar(state.car, 1 / 120, inputState());
        accumulator -= 1 / 120;
      }
      updateRemote();
      state.camera.x = lerp(state.camera.x, state.car.x + state.car.vx * 0.18, 0.08);
      state.camera.y = lerp(state.camera.y, state.car.y + state.car.vy * 0.18, 0.08);
      state.camera.z = lerp(state.camera.z, clamp(Math.min(W, H) / 760, 0.72, 1.05), 0.04);
      updateHud(remainingMs);
      if (now - state.lastStateSend > 50) sendState(now);
      if (now - state.lastScoreSend > 250) sendScore(now, remainingMs);
      if (!state.sentFinish && (remainingMs <= 0 || state.car.progress > 0.985)) {
        state.sentFinish = true;
        sendWs({ type: "finish", score: Math.round(state.car.score), progress: state.car.progress, remainingMs });
      }
    }
    drawCar(state.remote, true);
    drawCar(state.car, false);
    drawRemoteName();
  } else {
    const ghost = state.car || spawnCar(CARS[1], 0);
    ghost.x = TRACK.pts[(TRACK.startIdx + Math.floor(now / 50)) % TRACK.N].x;
    ghost.y = TRACK.pts[(TRACK.startIdx + Math.floor(now / 50)) % TRACK.N].y;
    ghost.h = Math.atan2(TRACK.pts[(TRACK.startIdx + Math.floor(now / 50)) % TRACK.N].ty, TRACK.pts[(TRACK.startIdx + Math.floor(now / 50)) % TRACK.N].tx);
    drawCar(ghost, false);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function sendState(now) {
  state.lastStateSend = now;
  const car = state.car;
  sendWs({
    type: "state",
    state: {
      x: car.x, y: car.y, h: car.h, vx: car.vx, vy: car.vy,
      speed: car.speed, gear: car.gear, rpm: car.rpm,
      drifting: car.drifting, score: car.score, progress: car.progress,
    },
  });
}

function sendScore(now, remainingMs) {
  state.lastScoreSend = now;
  sendWs({ type: "score", score: Math.round(state.car.score), progress: state.car.progress, finishedAt: state.sentFinish ? new Date().toISOString() : null, remainingMs });
}

function showResults(result) {
  state.mode = "results";
  els.hud.classList.add("is-hidden");
  els.countdown.classList.add("is-hidden");
  els.results.classList.remove("is-hidden");
  const winner = result.players.find((player) => player.id === result.winnerId);
  els.resultTitle.textContent = winner ? `${winner.name} wins` : "Race complete";
  els.resultList.innerHTML = result.players.map((player) => `
    <div class="result-row">
      <strong>${escapeHtml(player.name)}</strong>
      <span>${Math.round(player.score)} pts</span>
    </div>
  `).join("");
}

els.createTab.addEventListener("click", showCreate);
els.joinTab.addEventListener("click", showJoin);

els.createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("Sending code...");
  try {
    const result = await api("/api/online/request-otp", {
      method: "POST",
      body: JSON.stringify(formData(els.createForm)),
    });
    state.challengeId = result.challengeId;
    els.createForm.classList.add("is-hidden");
    els.otpForm.classList.remove("is-hidden");
    setMessage(result.devCode ? `Local dev OTP: ${result.devCode}` : `Code sent to ${result.sentTo}.`);
  } catch (error) {
    setMessage(error.message, true);
  }
});

els.otpForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("Verifying...");
  const otp = formData(els.otpForm);
  try {
    await api("/api/online/verify-otp", {
      method: "POST",
      body: JSON.stringify({
        email: formData(els.createForm).email,
        challengeId: state.challengeId,
        code: otp.code,
      }),
    });
    const result = await api("/api/online/create-room", {
      method: "POST",
      body: JSON.stringify({ name: otp.name, car: otp.car }),
    });
    state.playerId = result.playerId;
    state.playerToken = result.playerToken;
    sessionStorage.setItem("jdoPlayer", JSON.stringify({ playerId: state.playerId, playerToken: state.playerToken, room: result.room }));
    showLobby(result.room);
    connectSocket();
  } catch (error) {
    if (error.body?.room && error.body?.playerToken) {
      state.playerId = error.body.playerId;
      state.playerToken = error.body.playerToken;
      showLobby(error.body.room);
      connectSocket();
      return;
    }
    setMessage(error.message, true);
  }
});

els.joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("Joining room...");
  try {
    const result = await api("/api/online/join-room", {
      method: "POST",
      body: JSON.stringify(formData(els.joinForm)),
    });
    state.playerId = result.playerId;
    state.playerToken = result.playerToken;
    sessionStorage.setItem("jdoPlayer", JSON.stringify({ playerId: state.playerId, playerToken: state.playerToken, room: result.room }));
    showLobby(result.room);
    connectSocket();
  } catch (error) {
    setMessage(error.message, true);
  }
});

els.ready.addEventListener("click", () => {
  state.ready = true;
  els.ready.textContent = "Ready";
  sendWs({ type: "ready" });
});

els.leave.addEventListener("click", () => {
  if (state.socket) state.socket.close();
  location.reload();
});

els.copyCode.addEventListener("click", async () => {
  if (!state.room) return;
  await navigator.clipboard?.writeText(state.room.code).catch(() => null);
  els.copyCode.textContent = "COPIED";
  setTimeout(() => { if (state.room) els.copyCode.textContent = state.room.code; }, 900);
});

els.backOnline.addEventListener("click", () => location.reload());

addEventListener("keydown", (event) => {
  state.keys[event.code] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
});
addEventListener("keyup", (event) => {
  state.keys[event.code] = false;
});

for (const button of els.touch.querySelectorAll("button")) {
  const key = button.dataset.touch;
  const set = (value) => {
    state.touch[key === "gas" ? "gas" : key === "ebrake" ? "ebrake" : key] = value;
  };
  button.addEventListener("pointerdown", (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); set(true); });
  button.addEventListener("pointerup", () => set(false));
  button.addEventListener("pointercancel", () => set(false));
}

addEventListener("gamepadconnected", () => {
  state.gamepadActive = true;
  els.touch.classList.remove("is-visible");
  els.status.textContent = "Controller connected";
});
addEventListener("gamepaddisconnected", () => {
  state.gamepadActive = false;
  els.status.textContent = "Touch controls ready";
});

(async function restoreSession() {
  try {
    const result = await api("/api/online/session", { method: "GET", headers: {} });
    if (result.activeRoom) {
      els.createForm.classList.add("is-hidden");
      els.otpForm.classList.remove("is-hidden");
      setMessage(`Active room ${result.activeRoom.code} already exists. Join it or end it from the active session.`);
    }
  } catch {
    // Signed-out landing is the normal state.
  }
})();
