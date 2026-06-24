const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const CARDS = ['烂头', '枪', '老虎', '人', '鸡', '蜜蜂'];
const BEATS = { '烂头': '枪', '枪': '老虎', '老虎': '人', '人': '鸡', '鸡': '蜜蜂', '蜜蜂': '烂头' };

const app = express();
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();
let nextCardId = 0;

function genRoomCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function createDeck() {
  const deck = [];
  for (const type of CARDS) {
    for (let i = 0; i < 4; i++) {
      deck.push({ id: String(nextCardId++), type });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function getOutcome(typeP1, typeP2) {
  if (typeP1 === typeP2) return 'same';
  if (BEATS[typeP1] === typeP2) return 'p1';
  if (BEATS[typeP2] === typeP1) return 'p2';
  return 'none';
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function sendToPlayer(room, playerNum, msg) {
  const slot = playerNum === 1 ? room.p1 : room.p2;
  if (slot && slot.ws) send(slot.ws, msg);
}

function broadcastRoom(room, msg) {
  sendToPlayer(room, 1, msg);
  sendToPlayer(room, 2, msg);
}

function getPublicState(room, playerNum) {
  const me = playerNum === 1 ? room.p1 : room.p2;
  const opp = playerNum === 1 ? room.p2 : room.p1;
  let myPlayed = me.played ? { type: me.played.type } : null;
  let opponentPlayed = null;

  if (room.phase === 'revealed' && room.lastResult) {
    const lr = room.lastResult;
    myPlayed = { type: playerNum === 1 ? lr.cardP1.type : lr.cardP2.type };
    opponentPlayed = { type: playerNum === 1 ? lr.cardP2.type : lr.cardP1.type };
  } else if (opp && opp.played) {
    opponentPlayed = { hidden: true };
  }

  return {
    type: 'state',
    player: playerNum,
    round: room.round,
    phase: room.phase,
    hand: me.hand,
    opponentCount: opp ? opp.hand.length : 0,
    myPlayed,
    opponentPlayed,
    myReady: !!me.played || (room.phase === 'revealed' && !!room.lastResult),
    opponentReady: !!(opp && opp.played) || (room.phase === 'revealed' && !!room.lastResult),
    lastResult: room.lastResult,
    gameOver: room.gameOver,
    winner: room.winner
  };
}

function pushState(room) {
  if (room.p1) sendToPlayer(room, 1, getPublicState(room, 1));
  if (room.p2) sendToPlayer(room, 2, getPublicState(room, 2));
}

function startGame(room) {
  clearRoomTimers(room);
  nextCardId = 0;
  const deck = createDeck();
  room.p1.hand = deck.slice(0, 12);
  room.p2.hand = deck.slice(12);
  room.round = 0;
  room.phase = 'select';
  room.gameOver = false;
  room.winner = null;
  room.lastResult = null;
  room.p1.played = null;
  room.p2.played = null;
  pushState(room);
}

function resolveRound(room) {
  const c1 = room.p1.played;
  const c2 = room.p2.played;
  room.round++;
  room.phase = 'revealed';

  const outcome = getOutcome(c1.type, c2.type);
  let message = '';

  if (outcome === 'p1') {
    room.p1.hand.push(c1, c2);
    message = `玩家一「${c1.type}」克制玩家二「${c2.type}」`;
  } else if (outcome === 'p2') {
    room.p2.hand.push(c1, c2);
    message = `玩家二「${c2.type}」克制玩家一「${c1.type}」`;
  } else if (outcome === 'same') {
    message = `双方同出「${c1.type}」，全部丢弃`;
  } else {
    message = `「${c1.type}」vs「${c2.type}」互不克制，全部丢弃`;
  }

  room.lastResult = {
    round: room.round,
    cardP1: { type: c1.type },
    cardP2: { type: c2.type },
    outcome,
    message
  };

  room.p1.played = null;
  room.p2.played = null;

  if (room.p1.hand.length === 0 && room.p2.hand.length === 0) {
    room.gameOver = true;
    room.winner = 0;
  } else if (room.p1.hand.length === 0) {
    room.gameOver = true;
    room.winner = 2;
  } else if (room.p2.hand.length === 0) {
    room.gameOver = true;
    room.winner = 1;
  }

  pushState(room);

  clearRoomTimers(room);
  const revealDelay = room.gameOver ? 7000 : 6500;
  room.revealTimer = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    if (room.phase !== 'revealed') return;
    if (!room.gameOver) {
      room.phase = 'select';
      room.lastResult = null;
    }
    pushState(room);
  }, revealDelay);
}

function clearRoomTimers(room) {
  if (room.showdownTimer) {
    clearTimeout(room.showdownTimer);
    room.showdownTimer = null;
  }
  if (room.revealTimer) {
    clearTimeout(room.revealTimer);
    room.revealTimer = null;
  }
}

function tryResolve(room) {
  if (room.p1.played && room.p2.played) {
    if (room.phase === 'select') {
      room.phase = 'showdown';
      pushState(room);
      clearRoomTimers(room);
      room.showdownTimer = setTimeout(() => {
        if (!rooms.has(room.code)) return;
        if (room.phase !== 'showdown') return;
        resolveRound(room);
      }, 1500);
    }
  } else {
    pushState(room);
  }
}

function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    send(ws, { type: 'error', message: '无效消息' });
    return;
  }

  if (msg.type === 'createRoom') {
    const code = genRoomCode();
    const room = {
      code: code,
      p1: { ws, hand: [], played: null },
      p2: null,
      round: 0,
      phase: 'lobby',
      gameOver: false,
      winner: null,
      lastResult: null,
      createdAt: Date.now()
    };
    rooms.set(code, room);
    ws.roomCode = code;
    ws.playerNum = 1;
    send(ws, { type: 'roomCreated', code, player: 1 });
    return;
  }

  if (msg.type === 'joinRoom') {
    const code = String(msg.code || '').trim();
    const room = rooms.get(code);
    if (!room) {
      send(ws, { type: 'error', message: '房间不存在，请检查房间号' });
      return;
    }
    if (room.p2) {
      send(ws, { type: 'error', message: '房间已满' });
      return;
    }
    room.p2 = { ws, hand: [], played: null };
    ws.roomCode = code;
    ws.playerNum = 2;
    send(ws, { type: 'joined', code, player: 2 });
    sendToPlayer(room, 1, { type: 'opponentJoined' });
    startGame(room);
    return;
  }

  const room = rooms.get(ws.roomCode);
  if (!room) {
    send(ws, { type: 'error', message: '未加入房间' });
    return;
  }

  if (msg.type === 'playCard') {
    if (room.phase !== 'select' || room.gameOver) return;

    const player = ws.playerNum === 1 ? room.p1 : room.p2;
    if (player.played) return;

    const idx = player.hand.findIndex(c => c.id === msg.cardId);
    if (idx === -1) return;

    player.played = player.hand.splice(idx, 1)[0];
    tryResolve(room);
    return;
  }

  if (msg.type === 'nextRound') {
    if (room.phase === 'revealed' && !room.gameOver) {
      room.phase = 'select';
      room.lastResult = null;
      pushState(room);
    }
  }

  if (msg.type === 'rematch') {
    if (room.p1 && room.p2) startGame(room);
    return;
  }

  if (msg.type === 'ping') {
    send(ws, { type: 'pong' });
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.phase === 'lobby' && room.createdAt && now - room.createdAt > 30 * 60 * 1000) {
      if (room.p1 && room.p1.ws) send(room.p1.ws, { type: 'error', message: '房间超时已关闭，请重新创建' });
      cleanupRoom(code);
    }
  }
}, 60 * 1000);

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (room) clearRoomTimers(room);
  rooms.delete(code);
}

wss.on('connection', (ws) => {
  send(ws, { type: 'connected' });

  ws.on('message', (data) => handleMessage(ws, data.toString()));

  ws.on('close', () => {
    const code = ws.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;

    if (ws.playerNum === 1) {
      if (room.p2) sendToPlayer(room, 2, { type: 'opponentLeft', message: '玩家一已断开，房间关闭' });
      cleanupRoom(code);
    } else if (ws.playerNum === 2) {
      room.p2 = null;
      room.phase = 'lobby';
      sendToPlayer(room, 1, { type: 'opponentLeft', message: '玩家二已断开，等待新玩家加入…' });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`六兽相克服务器已启动: http://localhost:${PORT}`);
  console.log('同一 WiFi 下，另一台设备请访问: http://<本机IP>:' + PORT);
});
