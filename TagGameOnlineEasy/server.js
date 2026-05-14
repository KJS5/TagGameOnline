const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_, res) => {
  res.send("ok");
});

const W = 960;
const H = 600;

const platforms = [
  { x: 0, y: 560, w: 960, h: 40 },
  { x: 85, y: 450, w: 235, h: 22 },
  { x: 410, y: 450, w: 235, h: 22 },
  { x: 735, y: 450, w: 170, h: 22 },
  { x: 160, y: 330, w: 220, h: 22 },
  { x: 510, y: 330, w: 250, h: 22 },
  { x: 330, y: 220, w: 300, h: 22 },
  { x: 55, y: 150, w: 180, h: 22 },
  { x: 730, y: 150, w: 180, h: 22 }
];

const rooms = new Map();

const colors = ["#2196f3", "#ff3b30", "#ffd60a", "#af52de"];

const spawns = [
  { x: 120, y: 515 },
  { x: 800, y: 515 },
  { x: 205, y: 285 },
  { x: 710, y: 285 }
];

function makeCode() {
  let c;

  do {
    c = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(c));

  return c;
}

function publicRoom(r) {
  return {
    code: r.code,
    host: r.host,
    started: r.started,
    time: Math.max(0, Math.ceil(r.time)),
    taggerId: r.taggerId,
    players: r.players,
    message: r.message
  };
}

function newPlayer(id, name) {
  const s = spawns[id - 1];

  return {
    id,
    name: (name || `P${id}`).slice(0, 12),
    x: s.x,
    y: s.y,
    w: 34,
    h: 34,
    vx: 0,
    vy: 0,
    left: false,
    right: false,
    jump: false,
    ground: false,

    // Double jump
    jumpsUsed: 0,
    maxJumps: 2,

    color: colors[id - 1],
    score: 0
  };
}

function overlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function collidePlatform(p, dt) {
  p.ground = false;

  for (const pl of platforms) {
    if (!overlap(p, pl)) continue;

    const oldBottom = p.y + p.h - p.vy * dt;
    const oldTop = p.y - p.vy * dt;
    const oldRight = p.x + p.w - p.vx * dt;
    const oldLeft = p.x - p.vx * dt;

    if (oldBottom <= pl.y && p.vy >= 0) {
      p.y = pl.y - p.h;
      p.vy = 0;
      p.ground = true;
      p.jumpsUsed = 0;
    } else if (oldTop >= pl.y + pl.h && p.vy < 0) {
      p.y = pl.y + pl.h;
      p.vy = 0;
    } else if (oldRight <= pl.x && p.vx > 0) {
      p.x = pl.x - p.w;
      p.vx = 0;
    } else if (oldLeft >= pl.x + pl.w && p.vx < 0) {
      p.x = pl.x + pl.w;
      p.vx = 0;
    }
  }
}

function resetPositions(r) {
  Object.values(r.players).forEach((p) => {
    const s = spawns[p.id - 1];

    p.x = s.x;
    p.y = s.y;
    p.vx = 0;
    p.vy = 0;
    p.left = false;
    p.right = false;
    p.jump = false;
    p.ground = false;
    p.jumpsUsed = 0;
  });
}

function startRoom(r) {
  const ids = Object.keys(r.players).map(Number);

  if (ids.length < 2) {
    r.message = "Need at least 2 players.";
    return;
  }

  resetPositions(r);

  r.started = true;
  r.time = 90;
  r.lastTag = 0;
  r.message = "";
  r.taggerId = ids[Math.floor(Math.random() * ids.length)];
  r.last = Date.now();
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }) => {
    const c = makeCode();

    const r = {
      code: c,
      host: socket.id,
      started: false,
      time: 90,
      taggerId: 1,
      last: Date.now(),
      lastTag: 0,
      players: {},
      sockets: {},
      message: ""
    };

    r.players[1] = newPlayer(1, name || "Host");
    r.sockets[socket.id] = 1;

    rooms.set(c, r);

    socket.join(c);
    socket.data.room = c;

    socket.emit("joined", {
      code: c,
      playerId: 1
    });

    io.to(c).emit("state", publicRoom(r));
  });

  socket.on("joinRoom", ({ code, name }) => {
    const c = String(code || "").trim();
    const r = rooms.get(c);

    if (!r) {
      socket.emit("errorMsg", "Room not found");
      return;
    }

    if (r.started) {
      socket.emit("errorMsg", "Game already started");
      return;
    }

    let id = null;

    for (let i = 1; i <= 4; i++) {
      if (!r.players[i]) {
        id = i;
        break;
      }
    }

    if (!id) {
      socket.emit("errorMsg", "Room is full");
      return;
    }

    r.players[id] = newPlayer(id, name || `Player ${id}`);
    r.sockets[socket.id] = id;

    socket.join(c);
    socket.data.room = c;

    socket.emit("joined", {
      code: c,
      playerId: id
    });

    io.to(c).emit("state", publicRoom(r));
  });

  socket.on("startGame", () => {
    const r = rooms.get(socket.data.room);

    if (!r) return;
    if (r.host !== socket.id) return;

    startRoom(r);
    io.to(r.code).emit("state", publicRoom(r));
  });

  socket.on("restart", () => {
    const r = rooms.get(socket.data.room);

    if (!r) return;
    if (r.host !== socket.id) return;

    r.started = false;
    r.time = 90;
    r.message = "";

    resetPositions(r);

    io.to(r.code).emit("state", publicRoom(r));
  });

  socket.on("input", ({ key, down }) => {
    const r = rooms.get(socket.data.room);
    if (!r) return;

    const id = r.sockets[socket.id];
    const p = r.players[id];
    if (!p) return;

    if (key === "left") {
      p.left = !!down;
    }

    if (key === "right") {
      p.right = !!down;
    }

    if (key === "jump") {
      if (down && !p.jump && p.jumpsUsed < p.maxJumps) {
        p.vy = -610;
        p.ground = false;
        p.jumpsUsed++;
      }

      p.jump = !!down;
    }
  });

  socket.on("disconnect", () => {
    const r = rooms.get(socket.data.room);
    if (!r) return;

    const id = r.sockets[socket.id];

    delete r.sockets[socket.id];

    if (id) {
      delete r.players[id];
    }

    const ids = Object.keys(r.players).map(Number);

    if (!ids.length) {
      rooms.delete(r.code);
      return;
    }

    if (r.host === socket.id) {
      r.host = Object.keys(r.sockets)[0];
    }

    if (!r.players[r.taggerId]) {
      r.taggerId = ids[0];
    }

    if (ids.length < 2) {
      r.started = false;
    }

    io.to(r.code).emit("state", publicRoom(r));
  });
});

setInterval(() => {
  const now = Date.now();

  for (const r of rooms.values()) {
    if (!r.started) {
      io.to(r.code).emit("state", publicRoom(r));
      continue;
    }

    const dt = Math.min((now - r.last) / 1000, 0.04);
    r.last = now;
    r.time -= dt;

    if (r.time <= 0) {
      r.started = false;
      r.message = `Player ${r.taggerId} was IT and lost!`;

      io.to(r.code).emit("state", publicRoom(r));
      continue;
    }

    for (const p of Object.values(r.players)) {
      const speed = p.id === r.taggerId ? 250 : 230;

      if (p.left && !p.right) {
        p.vx = -speed;
      } else if (p.right && !p.left) {
        p.vx = speed;
      } else {
        p.vx = 0;
      }

      p.vy += 1750 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      collidePlatform(p, dt);

      if (p.x < 0) {
        p.x = 0;
      }

      if (p.x + p.w > W) {
        p.x = W - p.w;
      }

      if (p.y > H + 100) {
        const s = spawns[p.id - 1];

        p.x = s.x;
        p.y = 40;
        p.vx = 0;
        p.vy = 0;
        p.ground = false;
        p.jumpsUsed = 0;
      }
    }

    const tagger = r.players[r.taggerId];

    if (tagger && now - r.lastTag > 850) {
      for (const p of Object.values(r.players)) {
        if (p.id !== tagger.id && overlap(tagger, p)) {
          r.taggerId = p.id;
          r.lastTag = now;
          break;
        }
      }
    }

    io.to(r.code).emit("state", publicRoom(r));
  }
}, 1000 / 30);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Tag Game Online Easy running on port " + PORT);
});
