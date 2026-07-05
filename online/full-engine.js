"use strict";

(function () {
  const frame = document.querySelector("#offline-game");
  if (!frame) return;

  let engineActive = false;
  let remoteSnapshot = null;
  let bridgeReady = false;
  let bridgeLast = performance.now();

  function debugApi() {
    try {
      return frame.contentWindow?.__dbg || null;
    } catch {
      return null;
    }
  }

  function gameApi() {
    try {
      return frame.contentWindow?.__JD_ONLINE_API || null;
    } catch {
      return null;
    }
  }

  function enhanceOfflineHtml(html) {
    let out = html.replace("<script>", "<script>window.__EBISU_TEST=true;</script><script>");
    if (out.includes("__JD_ONLINE_API")) return out;

    out = out.replace(
      "  let car = null;\n",
      "  let car = null;\n  let onlineMode = false;\n  let onlineRemote = null;\n  let onlineRemoteTarget = null;\n"
    );

    out = out.replace(
      "    G.state = 'count'; G.cd = 3.6; G.cdLast = 4;\n  }\n  function respawn()",
      `    G.state = 'count'; G.cd = 3.6; G.cdLast = 4;
  }
  function carSpecById(id) {
    return CARS.find(s => s.id === id) || CARS[0];
  }
  function onlineScore() {
    return Math.round(score.total + (score.chain > 0 ? score.chain * score.mult : 0));
  }
  function onlineProgress() {
    if (!car) return 0;
    return ((car.prog - TRACK.startIdx + TRACK.N) % TRACK.N) / TRACK.N;
  }
  function onlineStartRace(opts = {}) {
    const spec = carSpecById(opts.carId);
    G.sel = Math.max(0, CARS.indexOf(spec));
    G.mode = 'free';
    onlineMode = true;
    onlineRemote = null;
    onlineRemoteTarget = null;
    newRace();
    const p = TRACK.pts[TRACK.startIdx];
    const lane = Number.isFinite(opts.lane) ? opts.lane : 0;
    car.x = p.x + p.nx * lane;
    car.y = p.y + p.ny * lane;
    car.prog = TRACK.startIdx;
    cam.x = car.x;
    cam.y = car.y;
    const cd = Number.isFinite(opts.countdownSeconds) ? opts.countdownSeconds : 3.6;
    G.cd = Math.max(-0.5, cd);
    G.cdLast = Math.ceil(Math.max(0, G.cd)) + 1;
    G.state = G.cd > -0.55 ? 'count' : 'play';
    return true;
  }
  function onlineLocalState() {
    if (!car) return null;
    return {
      x: car.x, y: car.y, h: car.h, vx: car.vx, vy: car.vy,
      speed: car.speed, gear: car.gear, rpm: car.rpm,
      drifting: car.drifting, score: onlineScore(), progress: onlineProgress(),
      steer: car.steer, slip: car.slip, roll: car.roll, pitch: car.pitch,
      brake: car.brakeOn || car.inEb, carId: car.spec.id, mode: G.state
    };
  }
  function onlineSetRemoteState(snapshot = {}, meta = {}) {
    const spec = carSpecById(meta.carId || snapshot.carId);
    const now = performance.now();
    const next = {
      spec, x: Number(snapshot.x) || 0, y: Number(snapshot.y) || 0,
      h: Number(snapshot.h) || 0, vx: Number(snapshot.vx) || 0,
      vy: Number(snapshot.vy) || 0, speed: Number(snapshot.speed) || 0,
      gear: Number(snapshot.gear) || 1, rpm: Number(snapshot.rpm) || 0,
      drifting: !!snapshot.drifting, steer: Number(snapshot.steer) || 0,
      slip: Number(snapshot.slip) || 0, roll: Number(snapshot.roll) || 0,
      pitch: Number(snapshot.pitch) || 0, brake: !!snapshot.brake,
      name: meta.name || snapshot.name || 'Opponent', receivedAt: now
    };
    onlineRemoteTarget = next;
    if (!onlineRemote) onlineRemote = { ...next };
  }
  function updateOnlineRemote(dt) {
    if (!onlineRemote || !onlineRemoteTarget) return;
    const age = clamp((performance.now() - onlineRemoteTarget.receivedAt) / 1000, 0, 0.2);
    const targetX = onlineRemoteTarget.x + onlineRemoteTarget.vx * age;
    const targetY = onlineRemoteTarget.y + onlineRemoteTarget.vy * age;
    const k = clamp(dt * 13, 0.08, 0.42);
    onlineRemote.x = lerp(onlineRemote.x, targetX, k);
    onlineRemote.y = lerp(onlineRemote.y, targetY, k);
    onlineRemote.h += angNorm(onlineRemoteTarget.h - onlineRemote.h) * k;
    onlineRemote.vx = onlineRemoteTarget.vx;
    onlineRemote.vy = onlineRemoteTarget.vy;
    onlineRemote.speed = onlineRemoteTarget.speed;
    onlineRemote.gear = onlineRemoteTarget.gear;
    onlineRemote.rpm = onlineRemoteTarget.rpm;
    onlineRemote.drifting = onlineRemoteTarget.drifting;
    onlineRemote.steer = lerp(onlineRemote.steer || 0, onlineRemoteTarget.steer || 0, k);
    onlineRemote.slip = onlineRemoteTarget.slip;
    onlineRemote.roll = lerp(onlineRemote.roll || 0, onlineRemoteTarget.roll || 0, k);
    onlineRemote.pitch = lerp(onlineRemote.pitch || 0, onlineRemoteTarget.pitch || 0, k);
    onlineRemote.brake = onlineRemoteTarget.brake;
    onlineRemote.name = onlineRemoteTarget.name;
    onlineRemote.spec = onlineRemoteTarget.spec;
    onlineRemote.receivedAt = onlineRemoteTarget.receivedAt;
  }
  function onlineSetKey(code, down) {
    const k = KEYMAP[code];
    if (!k) return false;
    if (down && !keys[k]) onPress(k);
    keys[k] = !!down;
    return true;
  }
  function onlineStopRace() {
    onlineMode = false;
    onlineRemote = null;
    onlineRemoteTarget = null;
    for (const k in keys) keys[k] = false;
    if (G.state === 'play' || G.state === 'count') G.state = 'pause';
  }
  function respawn()`
    );

    out = out.replace(
      "    if (inRace) {\n      list.push({",
      `    if (onlineRemote && inRace) {
      const stale = performance.now() - (onlineRemote.receivedAt || 0) > 2200;
      list.push({
        d: (onlineRemote.x - cam.x) ** 2 + (onlineRemote.y - cam.y) ** 2,
        draw: g => drawCarWorld(g, onlineRemote.x, onlineRemote.y, onlineRemote.h, onlineRemote.spec || CARS[0], {
          steer: onlineRemote.steer, roll: onlineRemote.roll, pitch: onlineRemote.pitch,
          brake: onlineRemote.brake, alpha: stale ? 0.42 : 0.9
        })
      });
    }
    if (inRace) {
      list.push({`
    );

    out = out.replace(
      "    SND.update(dt, car, G.state === 'play' || G.state === 'count');\n",
      "    if (onlineMode) updateOnlineRemote(dt);\n    SND.update(dt, car, G.state === 'play' || G.state === 'count');\n"
    );

    out = out.replace(
      "  if (window.__EBISU_TEST) {\n",
      `  window.__JD_ONLINE_API = {
    startRace: onlineStartRace,
    getLocalState: onlineLocalState,
    setRemoteState: onlineSetRemoteState,
    setKey: onlineSetKey,
    stopRace: onlineStopRace,
    cars: CARS.map(s => ({ id: s.id, name: s.name })),
    isReady: true
  };
  try { window.parent && window.parent.postMessage({ type: 'jd-online-ready' }, '*'); } catch (e) {}

  if (window.__EBISU_TEST) {
`
    );

    return out;
  }

  function setBridgeStatus(ok) {
    bridgeReady = ok;
    document.body.classList.toggle("fallback-canvas", !ok);
  }

  async function bootOfflineEngine() {
    try {
      const response = await fetch(`../?onlineShell=1&bridge=${Date.now()}`, { cache: "no-store" });
      const html = await response.text();
      frame.srcdoc = enhanceOfflineHtml(html);
    } catch {
      setBridgeStatus(false);
    }
  }

  frame.addEventListener("load", () => {
    setTimeout(() => setBridgeStatus(Boolean(gameApi() || debugApi())), 120);
  });
  addEventListener("message", (event) => {
    if (event.data?.type === "jd-online-ready") setBridgeStatus(true);
  });
  setTimeout(() => {
    if (!gameApi() && !debugApi()) setBridgeStatus(false);
  }, 5000);
  bootOfflineEngine();

  function playerFor(id) {
    return state.room?.players.find((player) => player.id === id) || null;
  }

  function currentLocalState() {
    const engine = gameApi();
    if (engine?.getLocalState) return engine.getLocalState();
    const api = debugApi();
    const car = api?.car;
    if (!api || !car) return null;
    const track = api.TRACK;
    const progress = ((car.prog - track.startIdx + track.N) % track.N) / track.N;
    const total = api.score.total + (api.score.chain > 0 ? api.score.chain * api.score.mult : 0);
    return {
      x: car.x,
      y: car.y,
      h: car.h,
      vx: car.vx,
      vy: car.vy,
      speed: car.speed,
      gear: car.gear,
      rpm: car.rpm,
      drifting: car.drifting,
      score: Math.round(total),
      progress,
      steer: car.steer,
      slip: car.slip,
      roll: car.roll,
      pitch: car.pitch,
      brake: car.brakeOn || car.inEb,
      carId: car.spec.id,
    };
  }

  function updateBridgeHud(snapshot, remainingMs) {
    if (!snapshot) return;
    els.speed.textContent = Math.round(snapshot.speed * 0.35);
    els.gear.textContent = `G${snapshot.gear || 1}`;
    els.rpm.style.display = "block";
    els.rpm.style.width = `${Math.round(clamp(snapshot.rpm || 0, 0, 1) * 64)}px`;
    els.rpm.style.height = "3px";
    els.rpm.style.background = (snapshot.rpm || 0) > 0.92 ? "#ff5a5a" : "#75e8ff";
    els.score.textContent = Math.round(snapshot.score || 0);
    els.time.textContent = formatTimer(remainingMs);
  }

  function startOfflineRace(myPlayer) {
    const engine = gameApi();
    if (engine?.startRace) {
      const countdownSeconds = (state.startedAt - (Date.now() + state.serverOffset)) / 1000;
      engine.startRace({
        carId: myPlayer?.car || "s15",
        lane: state.playerId === "p1" ? -28 : 28,
        countdownSeconds,
        playerName: myPlayer?.name || "Driver",
      });
      setTimeout(() => frame.contentWindow?.focus?.(), 0);
      return true;
    }
    const api = debugApi();
    if (!api) return false;
    const carIndex = Math.max(0, api.CARS.findIndex((car) => car.id === myPlayer?.car));
    api.G.sel = carIndex;
    api.G.mode = "free";
    api.G.state = "mode";
    api.onPress("enter");
    const car = api.car;
    if (!car) return false;
    const start = api.TRACK.pts[api.TRACK.startIdx];
    const lane = state.playerId === "p1" ? -28 : 28;
    car.x = start.x + start.nx * lane;
    car.y = start.y + start.ny * lane;
    car.prog = api.TRACK.startIdx;
    const countdownSeconds = (state.startedAt - (Date.now() + state.serverOffset)) / 1000;
    api.G.cd = Math.max(-0.5, countdownSeconds);
    api.G.cdLast = Math.ceil(Math.max(0, api.G.cd)) + 1;
    api.G.state = api.G.cd > -0.55 ? "count" : "play";
    setTimeout(() => frame.contentWindow?.focus?.(), 0);
    return true;
  }

  function forwardKey(event, type) {
    if (!engineActive) return;
    const code = event.code || "";
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "KeyR"].includes(code)) return;
    try {
      const engine = gameApi();
      if (engine?.setKey && engine.setKey(code, type === "keydown")) {
        event.preventDefault();
        return;
      }
      frame.contentWindow?.dispatchEvent(new KeyboardEvent(type, {
        code,
        key: event.key,
        bubbles: true,
        cancelable: true,
      }));
      event.preventDefault();
    } catch {}
  }

  const originalStartRace = startRace;
  startRace = function () {
    const myPlayer = playerFor(state.playerId);
    const remotePlayer = state.room?.players.find((player) => player.id !== state.playerId);
    if (!bridgeReady || !startOfflineRace(myPlayer)) {
      document.body.classList.add("fallback-canvas");
      engineActive = false;
      originalStartRace();
      return;
    }
    engineActive = true;
    remoteSnapshot = null;
    state.mode = "race";
    state.car = null;
    state.remote = spawnCar(CAR_BY_ID[remotePlayer?.car] || CARS[2], state.playerId === "p1" ? 28 : -28);
    state.remote.name = remotePlayer?.name || "Opponent";
    state.engineState = null;
    state.sentFinish = false;
    state.sentTimerFinish = false;
    state.remoteHistory = [];
    bridgeLast = performance.now();
    document.body.classList.add("engine-race");
    document.body.classList.remove("fallback-canvas");
    els.shell.classList.add("is-hidden");
    els.hud.classList.remove("is-hidden");
    els.results.classList.add("is-hidden");
    els.countdown.classList.add("is-hidden");
  };

  const originalHandleWs = handleWs;
  handleWs = function (msg) {
    if (engineActive && msg.type === "state" && msg.playerId !== state.playerId) {
      const meta = playerFor(msg.playerId);
      gameApi()?.setRemoteState?.(msg.state, { carId: msg.state.carId || meta?.car, name: meta?.name || "Opponent" });
      remoteSnapshot = {
        ...msg.state,
        carId: msg.state.carId || meta?.car,
        name: meta?.name || "Opponent",
        receivedAt: performance.now(),
      };
    }
    originalHandleWs(msg);
  };

  const originalSendState = sendState;
  sendState = function (now) {
    if (!engineActive) {
      originalSendState(now);
      return;
    }
    state.lastStateSend = now;
    const snapshot = currentLocalState();
    if (!snapshot) return;
    state.engineState = snapshot;
    sendWs({ type: "state", state: snapshot });
  };

  const originalSendScore = sendScore;
  sendScore = function (now, remainingMs) {
    if (!engineActive) {
      originalSendScore(now, remainingMs);
      return;
    }
    state.lastScoreSend = now;
    const snapshot = state.engineState || currentLocalState();
    if (!snapshot) return;
    sendWs({
      type: "score",
      score: Math.round(snapshot.score || 0),
      progress: snapshot.progress || 0,
      finishedAt: state.sentFinish ? new Date().toISOString() : null,
      remainingMs,
    });
  };

  const originalShowResults = showResults;
  showResults = function (result) {
    engineActive = false;
    document.body.classList.remove("engine-race");
    gameApi()?.stopRace?.();
    originalShowResults(result);
  };

  addEventListener("keydown", (event) => forwardKey(event, "keydown"), true);
  addEventListener("keyup", (event) => forwardKey(event, "keyup"), true);

  function drawRemoteOverlay(local) {
    ctx.clearRect(0, 0, W, H);
    if (gameApi()?.setRemoteState) return;
    if (!remoteSnapshot || !local) return;
    const lead = clamp((performance.now() - remoteSnapshot.receivedAt) / 1000, 0, 0.16);
    const targetX = remoteSnapshot.x + (remoteSnapshot.vx || 0) * lead;
    const targetY = remoteSnapshot.y + (remoteSnapshot.vy || 0) * lead;
    if (!state.remote) state.remote = spawnCar(CAR_BY_ID[remoteSnapshot.carId] || CARS[2], 0);
    state.remote.spec = CAR_BY_ID[remoteSnapshot.carId] || state.remote.spec;
    state.remote.name = remoteSnapshot.name || state.remote.name || "Opponent";
    state.remote.x = lerp(state.remote.x, targetX, 0.34);
    state.remote.y = lerp(state.remote.y, targetY, 0.34);
    state.remote.h += angNorm((remoteSnapshot.h || 0) - state.remote.h) * 0.34;
    state.remote.speed = remoteSnapshot.speed || 0;
    state.remote.gear = remoteSnapshot.gear || 1;
    state.remote.rpm = remoteSnapshot.rpm || 0;
    state.remote.drifting = !!remoteSnapshot.drifting;
    state.camera.x = local.x + (local.vx || 0) * 0.5;
    state.camera.y = local.y + (local.vy || 0) * 0.5;
    const spec = CAR_BY_ID[local.carId] || CARS[1];
    state.camera.z = clamp(1.40 - ((local.speed || 0) / spec.phys.maxSpeed) * 0.36, 1.02, 1.40);
    drawCar(state.remote, true);
    drawRemoteName();
  }

  const originalLoop = loop;
  loop = function (now) {
    if (!engineActive) {
      originalLoop(now);
      return;
    }
    const dt = Math.min(0.05, (now - bridgeLast) / 1000);
    bridgeLast = now;
    const serverNow = Date.now() + state.serverOffset;
    const remainingMs = state.startedAt + state.raceDurationMs - serverNow;
    const snapshot = currentLocalState();
    state.engineState = snapshot;
    if (snapshot) {
      updateBridgeHud(snapshot, remainingMs);
      if (now - state.lastStateSend > 50) sendState(now);
      if (now - state.lastScoreSend > 250) sendScore(now, remainingMs);
      if (!state.sentFinish && snapshot.progress > 0.985) {
        state.sentFinish = true;
        sendWs({ type: "finish", score: Math.round(snapshot.score || 0), progress: snapshot.progress, remainingMs });
      }
      if (remainingMs <= 0 && !state.sentTimerFinish) {
        state.sentTimerFinish = true;
        state.sentFinish = true;
        sendWs({ type: "finish", score: Math.round(snapshot.score || 0), progress: snapshot.progress || 0, remainingMs: 0 });
      }
    }
    drawRemoteOverlay(snapshot);
    requestAnimationFrame(loop);
  };
})();
