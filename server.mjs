import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const rooms = new Map();
const unitSettings = {
  swordsman: { cost: 25, hp: 100, damage: 20, range: 28, speed: 33, interval: 0.8 },
  archer: { cost: 40, hp: 65, damage: 17, range: 165, speed: 25, interval: 1.15 },
  knight: { cost: 65, hp: 190, damage: 38, range: 34, speed: 21, interval: 1.05 }
};
const towerCost = 50;
const towerSettings = { damage: 22, range: 220, interval: 1.4, limit: 3 };
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function sendJson(response, status, value) {
  response.writeHead(status, jsonHeaders);
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) throw new Error("So‘rov hajmi juda katta.");
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new Error("JSON so‘rovi noto‘g‘ri.");
  }
}

function normalizedPlayerName(value, playerNumber) {
  if (value === undefined || value === null || value === "") return `O‘yinchi ${playerNumber}`;
  if (typeof value !== "string") throw new Error("O‘yinchi ismi matn bo‘lishi kerak.");
  const name = value.trim();
  if (name.length > 20) throw new Error("O‘yinchi ismi 20 ta belgidan oshmasin.");
  return name || `O‘yinchi ${playerNumber}`;
}

function createRoom(playerName, code) {
  if (rooms.size >= 1000) throw new Error("Hozir xonalar soni limiti to‘ldi.");
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    throw new Error("Xona kodini o‘zingiz kiriting: u aynan 6 ta raqam bo‘lsin.");
  }
  if (rooms.has(code)) {
    const error = new Error("Bu xona kodi band. Boshqa 6 xonali kod tanlang.");
    error.status = 409;
    throw error;
  }
  const hostToken = randomBytes(24).toString("hex");
  const room = {
    code,
    players: [{ token: hostToken, name: playerName, lastSeen: Date.now() }, null],
    started: false,
    lastSeen: Date.now(),
    lastTick: Date.now(),
    revision: 0,
    messages: [],
    nextMessageId: 1,
    game: {
      gold: [100, 100], hp: [1000, 1000], chain: 0, diamonds: 0, units: [],
      towers: [0, 0], towerCooldowns: [[], []],
      elapsed: 0, winner: null, nextUnitId: 1
    }
  };
  rooms.set(code, room);
  return { room, token: hostToken, player: 1 };
}

function playerFor(room, token) {
  if (!token) return null;
  const index = room.players.findIndex(player => player?.token === token);
  if (index < 0) return null;
  room.players[index].lastSeen = Date.now();
  return index;
}

function snapshot(room, afterMessageId = 0) {
  return {
    code: room.code,
    started: room.started,
    players: room.players.filter(Boolean).length,
    revision: room.revision,
    game: room.game,
    messages: room.messages.filter(message => message.id > afterMessageId)
  };
}

function updateRoom(room, dt) {
  if (!room.started || room.game.winner) return;
  const game = room.game;
  game.elapsed += dt;
  for (let side = 0; side < 2; side++) {
    game.towerCooldowns[side] = game.towerCooldowns[side].map(cooldown => cooldown - dt);
    for (let i = 0; i < game.towers[side]; i++) {
      if (game.towerCooldowns[side][i] > 0) continue;
      const targetSide = side === 0 ? "enemy" : "player";
      const castleX = side === 0 ? 90 : 910;
      const target = game.units
        .filter(unit => unit.side === targetSide && Math.abs(unit.x - castleX) <= towerSettings.range)
        .sort((a, b) => Math.abs(a.x - castleX) - Math.abs(b.x - castleX))[0];
      if (target) {
        target.hp -= towerSettings.damage;
        game.towerCooldowns[side][i] = towerSettings.interval;
      }
    }
  }
  for (const unit of game.units) {
    unit.cooldown -= dt;
    let target = null;
    let nearest = Infinity;
    for (const other of game.units) {
      if (other.side === unit.side || other.hp <= 0) continue;
      const distance = Math.abs(other.x - unit.x);
      if (distance < nearest && distance <= unit.stats.range) {
        target = other;
        nearest = distance;
      }
    }
    if (target) {
      if (unit.cooldown <= 0) {
        target.hp -= unit.stats.damage;
        unit.cooldown = unit.stats.interval;
      }
      continue;
    }
    const targetX = unit.side === "player" ? 910 - 67 : 90 + 67;
    const distance = Math.abs(targetX - unit.x);
    if (distance <= unit.stats.range) {
      if (unit.cooldown <= 0) {
        const castle = unit.side === "player" ? 1 : 0;
        game.hp[castle] = Math.max(0, game.hp[castle] - unit.stats.damage);
        unit.cooldown = unit.stats.interval;
      }
    } else {
      unit.x += (unit.side === "player" ? 1 : -1) * unit.stats.speed * dt;
    }
  }
  game.units = game.units.filter(unit => unit.hp > 0);
  if (game.hp[0] <= 0) game.winner = "enemy";
  if (game.hp[1] <= 0) game.winner = "player";
  if (game.winner) {
    const winnerIndex = game.winner === "player" ? 0 : 1;
    game.gold[winnerIndex] += 10;
    game.chain += 10;
    game.diamonds += 10;
  }
  room.revision++;
}

function serveFile(response) {
  readFile(join(root, "index.html"))
    .then(contents => {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff"
      });
      response.end(contents);
    })
    .catch(error => {
      console.error("O‘yin sahifasini o‘qib bo‘lmadi:", error);
      sendJson(response, 500, { error: "O‘yin sahifasini yuklab bo‘lmadi." });
    });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      return sendJson(response, 200, { ok: true });
    }
    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const body = await readJson(request);
      if (body.action === "create") {
        const name = normalizedPlayerName(body.name, 1);
        const { room, token, player } = createRoom(name, body.code);
        return sendJson(response, 201, { code: room.code, token, player, name, state: snapshot(room) });
      }
      if (body.action === "join") {
        const code = String(body.code || "").trim();
        const room = rooms.get(code);
        if (!/^\d{6}$/.test(code) || !room) return sendJson(response, 404, { error: "Bunday xona topilmadi." });
        if (room.started || room.players[1]) return sendJson(response, 409, { error: "Xona to‘lgan yoki jang boshlangan." });
        const name = normalizedPlayerName(body.name, 2);
        const token = randomBytes(24).toString("hex");
        room.players[1] = { token, name, lastSeen: Date.now() };
        room.started = true;
        room.lastSeen = Date.now();
        room.lastTick = Date.now();
        room.revision++;
        return sendJson(response, 200, { code, token, player: 2, name, state: snapshot(room) });
      }
      return sendJson(response, 400, { error: "Xona amali noto‘g‘ri." });
    }
    const roomMatch = url.pathname.match(/^\/api\/rooms\/(\d{6})(?:\/(action|chat))?$/);
    if (roomMatch) {
      const room = rooms.get(roomMatch[1]);
      if (!room) return sendJson(response, 404, { error: "Xona topilmadi yoki yopilgan." });
      const playerIndex = playerFor(room, request.headers["x-player-token"]);
      if (playerIndex === null) return sendJson(response, 401, { error: "Xona ruxsat kaliti noto‘g‘ri." });
      if (request.method === "GET" && !roomMatch[2]) {
        room.lastSeen = Date.now();
        const afterMessageId = Math.max(0, Number(url.searchParams.get("after")) || 0);
        return sendJson(response, 200, snapshot(room, afterMessageId));
      }
      if (request.method === "POST" && roomMatch[2] === "chat") {
        const body = await readJson(request);
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text || text.length > 200) return sendJson(response, 400, { error: "Xabar 1–200 belgi oralig‘ida bo‘lishi kerak." });
        const player = room.players[playerIndex];
        if (Date.now() - (player.lastChatAt || 0) < 700) {
          return sendJson(response, 429, { error: "Xabar yuborishdan oldin biroz kuting." });
        }
        player.lastChatAt = Date.now();
        const chatMessage = {
          id: room.nextMessageId++,
          player: playerIndex + 1,
          name: player.name,
          text,
          sentAt: Date.now()
        };
        room.messages.push(chatMessage);
        if (room.messages.length > 100) room.messages.shift();
        room.lastSeen = Date.now();
        room.revision++;
        return sendJson(response, 201, { message: chatMessage, revision: room.revision });
      }
      if (request.method === "POST" && roomMatch[2] === "action") {
        const body = await readJson(request);
        if (body.type === "tower") {
          if (!room.started) return sendJson(response, 409, { error: "Ikkinchi o‘yinchi hali ulanmagan." });
          if (room.game.winner) return sendJson(response, 409, { error: "Jang allaqachon tugagan." });
          if (room.game.towers[playerIndex] >= towerSettings.limit) {
            return sendJson(response, 409, { error: "Qal’ada minoralar uchun joy qolmadi." });
          }
          if (room.game.gold[playerIndex] < towerCost) return sendJson(response, 409, { error: "Minora qurish uchun tanga yetarli emas." });
          room.game.gold[playerIndex] -= towerCost;
          room.game.towers[playerIndex]++;
          room.game.towerCooldowns[playerIndex].push(0);
          room.lastSeen = Date.now();
          room.revision++;
          return sendJson(response, 200, snapshot(room));
        }
        const stats = unitSettings[body.type];
        if (!stats) return sendJson(response, 400, { error: "Askar turi noto‘g‘ri." });
        if (!room.started) return sendJson(response, 409, { error: "Ikkinchi o‘yinchi hali ulanmagan." });
        if (room.game.winner) return sendJson(response, 409, { error: "Jang allaqachon tugagan." });
        if (room.game.gold[playerIndex] < stats.cost) return sendJson(response, 409, { error: "Tanga yetarli emas." });
        if (room.game.units.length >= 200) return sendJson(response, 429, { error: "Jang maydonida askarlar juda ko‘p." });
        room.game.gold[playerIndex] -= stats.cost;
        room.game.units.push({
          id: room.game.nextUnitId++,
          type: body.type,
          side: playerIndex === 0 ? "player" : "enemy",
          x: playerIndex === 0 ? 160 : 840,
          hp: stats.hp,
          cooldown: 0,
          stats
        });
        room.lastSeen = Date.now();
        room.revision++;
        return sendJson(response, 200, snapshot(room));
      }
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return serveFile(response);
    }
    sendJson(response, 404, { error: "Sahifa topilmadi." });
  } catch (error) {
    console.error("So‘rovni bajarib bo‘lmadi:", error);
    sendJson(response, error.status || 400, { error: error.message || "So‘rovni bajarib bo‘lmadi." });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastSeen > 4 * 60 * 60 * 1000) {
      rooms.delete(code);
      continue;
    }
    const dt = Math.min((now - room.lastTick) / 1000, 0.1);
    room.lastTick = now;
    updateRoom(room, dt);
  }
}, 50).unref();

server.listen(port, "0.0.0.0", () => {
  console.log(`Qal'alar jangi serveri http://localhost:${port} manzilida ishga tushdi.`);
});
