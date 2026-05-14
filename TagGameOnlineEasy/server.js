const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

const rooms = {};

function makeRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function getPublicRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return null;

  return {
    code: room.code,
    players: room.players,
    taggerId: room.taggerId,
    timeLeft: room.timeLeft,
    gameStarted: room.gameStarted
  };
}

function createPlayer(playerId, name) {
  const spawnPoints = [
    { x: 120, y: 430 },
    { x: 650, y: 430 },
    { x: 260, y: 220 },
    { x: 520, y: 120 }
  ];

  const spawn = spawnPoints[playerId - 1];

  return {
    id: playerId,
    name: name || `Player ${playerId}`,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    width: 32,
    height: 32,
    onGround: false,

    // DOUBLE JUMP SETTINGS
    jumpsUsed: 0,
    maxJumps: 2,

    left: false,
    right: false,
    jump: false,
    color: ["#1e90ff", "#ff3333", "#ffd12a", "#b14cff"][playerId - 1],
    connected: true
  };
}

function startGame(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const playerIds = Object.keys(room.players).map(Number);
  if (playerIds.length < 2) return;

  room.gameStarted = true;
  room.timeLeft = 120;
  room.taggerId = playerIds[Math.floor(Math.random() * playerIds.length)];
  room.lastTick = Date.now();

  io.to(roomCode).emit("roomState", getPublicRoom(roomCode));
}

function resetRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  const oldPlayers = Object.values(room.players);

  room.players = {};
  oldPlayers.forEach((oldPlayer, index) => {
    const id = index + 1;
    room.players[id] = createPlayer(id, oldPlayer.name);
    room.players[id].connected = oldPlayer.connected;
  });

  room.taggerId = null;
  room.timeLeft = 120;
  room.gameStarted = false;
  room.lastTagTime = 0;
  room.lastTick = Date.now();

  io.to(roomCode).emit("roomState", getPublicRoom(roomCode));
}

io.on("connection", (socket) => {
  socket.on("hostCreateRoom", () => {
    let roomCode = makeRoomCode();

    while (rooms[roomCode]) {
      roomCode = makeRoomCode();
    }

    rooms[roomCode] = {
      code: roomCode,
      hostSocketId: socket.id,
      players: {},
      socketToPlayer: {},
      taggerId: null,
      timeLeft: 120,
      gameStarted: false,
      lastTick: Date.now(),
      lastTagTime: 0
    };

    socket.join(roomCode);

    socket.emit("hostRoomCreated", {
      roomCode
    });

    io.to(roomCode).emit("roomState", getPublicRoom(roomCode));
  });

  socket.on("hostJoinRoom", ({ roomCode }) => {
    const room = rooms[roomCode];

    if (!room) {
      socket.emit("errorMessage", "Room not found.");
      return;
    }

    room.hostSocketId = socket.id;
    socket.join(roomCode);

    socket.emit("hostRoomCreated", {
      roomCode
    });

    socket.emit("roomState", getPublicRoom(roomCode));
  });

  socket.on("controllerJoin", ({ roomCode, name }) => {
    const room = rooms[roomCode];

    if (!room) {
      socket.emit("joinFailed", "Room not found.");
      return;
    }

    if (room.gameStarted) {
      socket.emit("joinFailed", "Game already started.");
      return;
    }

    const usedIds = Object.keys(room.players).map(Number);
    let playerId = null;

    for (let i = 1; i <= 4; i++) {
      if (!usedIds.includes(i)) {
        playerId = i;
        break;
      }
    }

    if (!playerId) {
      socket.emit("joinFailed", "Room is full.");
      return;
    }

    room.players[playerId] = createPlayer(playerId, name);
    room.socketToPlayer[socket.id] = playerId;

    socket.join(roomCode);

    socket.emit("controllerJoined", {
      roomCode,
      playerId,
      color: room.players[playerId].color
    });

    io.to(roomCode).emit("roomState", getPublicRoom(roomCode));
  });

  socket.on("startGame", ({ roomCode }) => {
    const room = rooms[roomCode];

    if (!room) return;
    if (socket.id !== room.hostSocketId) return;

    startGame(roomCode);
  });

  socket.on("resetGame", ({ roomCode }) => {
    const room = rooms[roomCode];

    if (!room) return;
    if (socket.id !== room.hostSocketId) return;

    resetRoom(roomCode);
  });

  socket.on("control", ({ roomCode, playerId, input, pressed }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players[playerId];
    if (!player) return;

    if (input === "left") {
      player.left = pressed;
    }

    if (input === "right") {
      player.right = pressed;
    }

    if (input === "jump") {
      if (pressed && !player.jump && player.jumpsUsed < player.maxJumps) {
        player.vy = -560;
        player.onGround = false;
        player.jumpsUsed++;
      }

      player.jump = pressed;
    }
  });

  socket.on("disconnect", () => {
    for (const roomCode of Object.keys(rooms)) {
      const room = rooms[roomCode];
      const playerId = room.socketToPlayer[socket.id];

      if (playerId && room.players[playerId]) {
        room.players[playerId].connected = false;
        room.players[playerId].left = false;
        room.players[playerId].right = false;
        room.players[playerId].jump = false;

        io.to(roomCode).emit("roomState", getPublicRoom(roomCode));
      }

      delete room.socketToPlayer[socket.id];

      const noHost = room.hostSocketId === socket.id;
      const noPlayers = Object.values(room.players).every((p) => !p.connected);

      if (noHost && noPlayers) {
        delete rooms[roomCode];
      }
    }
  });
});

const platforms = [
  { x: 90, y: 480, w: 680, h: 28 },
  { x: 160, y: 300, w: 520, h: 25 },
  { x: 320, y: 165, w: 320, h: 25 },
  { x: 45, y: 130, w: 175, h: 25 },
  { x: 700, y: 190, w: 180, h: 25 },
  { x: 0, y: 560, w: 900, h: 40 }
];

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.width > b.x &&
    a.y < b.y + b.h &&
    a.y + a.height > b.y
  );
}

function playerOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function updateRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room || !room.gameStarted) return;

  const now = Date.now();
  const dt = Math.min((now - room.lastTick) / 1000, 0.05);
  room.lastTick = now;

  room.timeLeft -= dt;

  if (room.timeLeft <= 0) {
    room.timeLeft = 0;
    room.gameStarted = false;

    io.to(roomCode).emit("gameOver", {
      loserId: room.taggerId
    });

    io.to(roomCode).emit("roomState", getPublicRoom(roomCode));
    return;
  }

  const players = Object.values(room.players);

  for (const p of players) {
    const speed = room.taggerId === p.id ? 245 : 225;
    const gravity = 1500;

    if (p.left && !p.right) {
      p.vx = -speed;
    } else if (p.right && !p.left) {
      p.vx = speed;
    } else {
      p.vx = 0;
    }

    p.vy += gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    p.onGround = false;

    for (const platform of platforms) {
      if (rectsOverlap(p, platform)) {
        const previousBottom = p.y + p.height - p.vy * dt;

        if (previousBottom <= platform.y && p.vy >= 0) {
          p.y = platform.y - p.height;
          p.vy = 0;
          p.onGround = true;

          // RESET DOUBLE JUMP WHEN PLAYER LANDS
          p.jumpsUsed = 0;
        }
      }
    }

    if (p.x < 0) {
      p.x = 0;
    }

    if (p.x + p.width > 900) {
      p.x = 900 - p.width;
    }

    if (p.y > 620) {
      p.x = 120 + p.id * 80;
      p.y = 100;
      p.vx = 0;
      p.vy = 0;
      p.onGround = false;
      p.jumpsUsed = 0;
    }
  }

  const tagger = room.players[room.taggerId];

  if (tagger && now - room.lastTagTime > 1000) {
    for (const p of players) {
      if (p.id !== tagger.id && playerOverlap(tagger, p)) {
        room.taggerId = p.id;
        room.lastTagTime = now;

        io.to(roomCode).emit("tagChanged", {
          taggerId: room.taggerId
        });

        break;
      }
    }
  }

  io.to(roomCode).emit("roomState", getPublicRoom(roomCode));
}

setInterval(() => {
  for (const roomCode of Object.keys(rooms)) {
    updateRoom(roomCode);
  }
}, 1000 / 60);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Tag game running on port ${PORT}`);
});
