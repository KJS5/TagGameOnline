const socket = io();

const menu = document.getElementById("menu");
const game = document.getElementById("game");

const nameInput = document.getElementById("name");
const codeInput = document.getElementById("code");
const createBtn = document.getElementById("create");
const joinBtn = document.getElementById("join");
const err = document.getElementById("err");

const roomCodeText = document.getElementById("roomCode");
const youText = document.getElementById("you");
const timeText = document.getElementById("time");

const copyBtn = document.getElementById("copy");
const startBtn = document.getElementById("start");
const restartBtn = document.getElementById("restart");

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const jumpBtn = document.getElementById("jumpBtn");

let myPlayerId = null;
let currentRoomCode = null;
let state = null;

let cameraX = 0;
let cameraY = 0;

const defaultPlatforms = [
  { x: 0, y: 710, w: 1400, h: 40 }
];

function getName() {
  return nameInput.value.trim() || "Player";
}

function joinByCode(code) {
  socket.emit("joinRoom", {
    code,
    name: getName()
  });
}

createBtn.addEventListener("click", () => {
  err.textContent = "";
  socket.emit("createRoom", {
    name: getName()
  });
});

joinBtn.addEventListener("click", () => {
  err.textContent = "";
  const code = codeInput.value.trim();

  if (code.length !== 4) {
    err.textContent = "Enter a 4-digit room code.";
    return;
  }

  joinByCode(code);
});

copyBtn.addEventListener("click", async () => {
  const url = `${location.origin}?room=${currentRoomCode}`;

  try {
    await navigator.clipboard.writeText(url);
    copyBtn.textContent = "Copied!";
    setTimeout(() => {
      copyBtn.textContent = "Copy Link";
    }, 1000);
  } catch {
    alert(url);
  }
});

startBtn.addEventListener("click", () => {
  socket.emit("startGame");
});

restartBtn.addEventListener("click", () => {
  socket.emit("restart");
});

socket.on("joined", ({ code, playerId }) => {
  myPlayerId = playerId;
  currentRoomCode = code;

  menu.classList.add("hidden");
  game.classList.remove("hidden");

  roomCodeText.textContent = code;
  youText.textContent = `P${playerId}`;

  const url = new URL(location.href);
  url.searchParams.set("room", code);
  history.replaceState(null, "", url.toString());
});

socket.on("state", (s) => {
  state = s;

  if (s.code) {
    currentRoomCode = s.code;
    roomCodeText.textContent = s.code;
  }

  timeText.textContent = s.time;
});

socket.on("errorMsg", (message) => {
  err.textContent = message;
});

function sendInput(key, down) {
  socket.emit("input", {
    key,
    down
  });
}

const pressedKeys = new Set();

window.addEventListener("keydown", (e) => {
  const code = e.code;

  if (pressedKeys.has(code)) return;
  pressedKeys.add(code);

  if (code === "KeyA" || code === "ArrowLeft") {
    sendInput("left", true);
  }

  if (code === "KeyD" || code === "ArrowRight") {
    sendInput("right", true);
  }

  if (code === "KeyW" || code === "Space" || code === "ArrowUp") {
    sendInput("jump", true);
  }
});

window.addEventListener("keyup", (e) => {
  const code = e.code;
  pressedKeys.delete(code);

  if (code === "KeyA" || code === "ArrowLeft") {
    sendInput("left", false);
  }

  if (code === "KeyD" || code === "ArrowRight") {
    sendInput("right", false);
  }

  if (code === "KeyW" || code === "Space" || code === "ArrowUp") {
    sendInput("jump", false);
  }
});

function bindTouchButton(button, key) {
  function down(e) {
    e.preventDefault();
    sendInput(key, true);
  }

  function up(e) {
    e.preventDefault();
    sendInput(key, false);
  }

  button.addEventListener("touchstart", down, { passive: false });
  button.addEventListener("touchend", up, { passive: false });
  button.addEventListener("touchcancel", up, { passive: false });

  button.addEventListener("mousedown", down);
  button.addEventListener("mouseup", up);
  button.addEventListener("mouseleave", up);
}

bindTouchButton(leftBtn, "left");
bindTouchButton(rightBtn, "right");
bindTouchButton(jumpBtn, "jump");

function drawBackground(mapW, mapH) {
  ctx.fillStyle = "#7ee03f";
  ctx.fillRect(0, 0, mapW, mapH);

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#ffffff";

  for (let i = 0; i < 70; i++) {
    const x = (i * 193) % mapW;
    const y = (i * 97) % mapH;

    ctx.beginPath();
    ctx.arc(x, y, 34 + (i % 3) * 8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

function drawPlatforms(platforms) {
  for (const p of platforms) {
    const isGround = p.y > 680;

    ctx.fillStyle = isGround ? "#332211" : "#b96a23";
    ctx.fillRect(p.x, p.y, p.w, p.h);

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(p.x, p.y, p.w, 5);
  }
}

function drawPlayer(p, isTagger) {
  ctx.fillStyle = p.color;
  ctx.fillRect(p.x, p.y, p.w, p.h);

  ctx.strokeStyle = "#111";
  ctx.lineWidth = 3;
  ctx.strokeRect(p.x, p.y, p.w, p.h);

  ctx.fillStyle = "#111";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(p.id, p.x + p.w / 2, p.y + 23);

  if (isTagger) {
    drawTagArrow(p.x + p.w / 2, p.y - 13);
  }
}

function drawTagArrow(x, y) {
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(x, y + 22);
  ctx.lineTo(x - 12, y + 5);
  ctx.lineTo(x - 4, y + 5);
  ctx.lineTo(x - 4, y - 14);
  ctx.lineTo(x + 4, y - 14);
  ctx.lineTo(x + 4, y + 5);
  ctx.lineTo(x + 12, y + 5);
  ctx.closePath();

  ctx.fill();
  ctx.stroke();
}

function drawTimer(time, mapW) {
  ctx.font = "bold 38px Arial";
  ctx.textAlign = "center";
  ctx.lineWidth = 4;

  ctx.strokeStyle = "#222";
  ctx.fillStyle = "#fff";

  ctx.strokeText(String(time), mapW / 2, 58);
  ctx.fillText(String(time), mapW / 2, 58);
}

function drawMessage(message, mapW, mapH) {
  if (!message) return;

  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(mapW / 2 - 290, mapH / 2 - 70, 580, 140);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px Arial";
  ctx.textAlign = "center";
  ctx.fillText(message, mapW / 2, mapH / 2 + 8);
}

function drawWaiting(mapW, mapH) {
  if (!state || state.started) return;

  ctx.fillStyle = "rgba(0,0,0,0.62)";
  ctx.fillRect(mapW / 2 - 310, mapH / 2 - 85, 620, 150);

  ctx.fillStyle = "#fff";
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "center";

  if (state.code) {
    ctx.fillText(`Room ${state.code}: waiting/start game`, mapW / 2, mapH / 2 - 20);
  } else {
    ctx.fillText("Create or join a room", mapW / 2, mapH / 2 - 20);
  }

  ctx.font = "16px Arial";
  ctx.fillText("Need 2 players to start", mapW / 2, mapH / 2 + 20);
}

function updateCamera(mapW, mapH) {
  const myPlayer = state?.players?.[myPlayerId];

  if (!myPlayer) {
    cameraX = 0;
    cameraY = 0;
    return;
  }

  const scaleX = canvas.width / canvas.clientWidth;
  const scaleY = canvas.height / canvas.clientHeight;

  const viewW = canvas.width;
  const viewH = canvas.height;

  let targetX = myPlayer.x + myPlayer.w / 2 - viewW / 2;
  let targetY = myPlayer.y + myPlayer.h / 2 - viewH / 2;

  targetX = Math.max(0, Math.min(targetX, mapW - viewW));
  targetY = Math.max(0, Math.min(targetY, mapH - viewH));

  cameraX += (targetX - cameraX) * 0.12;
  cameraY += (targetY - cameraY) * 0.12;
}

function render() {
  const mapW = state?.mapW || 1400;
  const mapH = state?.mapH || 750;
  const platforms = state?.platforms || defaultPlatforms;

  canvas.width = mapW;
  canvas.height = mapH;

  updateCamera(mapW, mapH);

  ctx.save();

  drawBackground(mapW, mapH);
  drawPlatforms(platforms);

  if (state && state.players) {
    for (const p of Object.values(state.players)) {
      drawPlayer(p, p.id === state.taggerId);
    }
  }

  drawTimer(state?.time || 120, mapW);
  drawWaiting(mapW, mapH);
  drawMessage(state?.message || "", mapW, mapH);

  ctx.restore();

  requestAnimationFrame(render);
}

render();

const urlRoom = new URLSearchParams(location.search).get("room");

if (urlRoom) {
  codeInput.value = urlRoom;
}
