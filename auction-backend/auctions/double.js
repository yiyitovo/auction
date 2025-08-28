// auctions/double.js — CDA (continuous) + Call (uniform-price) classroom double auction
// Features:
// - Modes: 'cda' (continuous double auction) | 'call' (uniform-price call auction)
// - Price–time priority; CDA trades at resting order price
// - Teacher config: mode, round length, showOrders (public order feed), start/stop/clear
// - Students must pick side (buy/sell) before submitting
// - Everyone sees Best Bid / Best Ask; full order feed is host-only unless showOrders=true
// - Always display username (no uid shown)

module.exports = (io, socket, rooms) => {
  const now     = () => Date.now();
  const nowISO  = () => new Date().toISOString();

  // ===== helpers =====
  function isHost(room, sock) {
    if (!room || !sock) return false;
    const name = sock.username || `User-${sock.id.slice(0,4)}`;
    return room.owner === name;
  }

  function ensureBook(room) {
    room.double = room.double || {
      mode: 'cda',           // 'cda' | 'call'
      showOrders: false,     // whether order list is public to students
      roundSec: 120,         // default round length
      status: 'waiting',     // 'waiting' | 'running' | 'paused' | 'ended'
      endAt: 0,              // timestamp when round ends (if running)
      _timer: null
    };
    room.buys   = room.buys   || [];   // { id, username, price, ts }
    room.sells  = room.sells  || [];   // { id, username, price, ts }
    room.trades = room.trades || [];   // { buyer, seller, price, time }
    room.roles  = room.roles  || {};   // { [username]: 'buy' | 'sell' }
  }

  function sortBooks(room) {
    // price-time priority
    room.buys.sort((a,b)  => b.price - a.price || a.ts - b.ts); // higher price better; earlier time wins
    room.sells.sort((a,b) => a.price - b.price || a.ts - b.ts); // lower price better; earlier time wins
  }

  function bestQuote(room) {
    sortBooks(room);
    const bestBid = room.buys.length  ? room.buys[0].price  : null;
    const bestAsk = room.sells.length ? room.sells[0].price : null;
    return { bestBid, bestAsk, bidCount: room.buys.length, askCount: room.sells.length };
  }

  function emitBestQuote(roomId) {
    const room = rooms[roomId]; if (!room) return;
    const q = bestQuote(room);
    io.to(roomId).emit('best-quote', q);
  }

  function broadcastOrders(roomId) {
    const room = rooms[roomId]; if (!room) return;
    const payload = {
      buys:  room.buys.map(o => ({ price: o.price, name: o.username, time: o.ts })),
      sells: room.sells.map(o => ({ price: o.price, name: o.username, time: o.ts }))
    };
    // host always sees full orders
    io.to(`host:${roomId}`).emit('order', payload);
    // students only when showOrders=true
    if (room.double.showOrders) {
      io.to(roomId).emit('order', payload);
    }
  }

  function clearTimer(room) {
    if (room?.double?._timer) {
      clearInterval(room.double._timer);
      room.double._timer = null;
    }
  }

  function startRoundTimer(roomId) {
    const room = rooms[roomId]; if (!room) return;
    clearTimer(room);
    if (room.double.status !== 'running') return;
    room.double._timer = setInterval(() => {
      if (room.double.status !== 'running') return;
      const tLeft = Math.max(0, room.double.endAt - now());
      io.to(roomId).emit('round-tick', { timeLeftSec: Math.ceil(tLeft/1000) });
      if (tLeft <= 0) {
        // Round ends
        if (room.double.mode === 'call') {
          runCallClear(roomId); // uniform-price clearing at round end
        }
        room.double.status = 'paused';
        clearTimer(room);
        io.to(roomId).emit('double-state', stateView(room));
      }
    }, 500);
  }

  function stateView(room) {
    const q = bestQuote(room);
    return {
      mode: room.double.mode,
      showOrders: room.double.showOrders,
      roundSec: room.double.roundSec,
      status: room.double.status,
      timeLeftSec: room.double.status === 'running'
        ? Math.max(0, Math.ceil((room.double.endAt - now())/1000)) : 0,
      ...q
    };
  }

  function recordOrder(io, rooms, roomId, username, side, price) {
    const room = rooms[roomId];
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({ username, amount: price, time: nowISO(), side });
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'order', actor: username, side, price });
  }

  // ===== CDA matching: trade at resting order price =====
  function tryMatchCDA(roomId) {
    const room = rooms[roomId]; if (!room) return;
    sortBooks(room);

    const matches = [];
    while (room.buys.length && room.sells.length && room.buys[0].price >= room.sells[0].price) {
      const topB = room.buys[0];
      const topS = room.sells[0];

      // resting = the one posted earlier by ts
      let price, buyer, seller;
      if (topB.ts >= topS.ts) {
        // buyer aggressed into resting ask -> trade at ask
        price  = topS.price;
        buyer  = topB.username;
        seller = topS.username;
      } else {
        // seller aggressed into resting bid -> trade at bid
        price  = topB.price;
        buyer  = topB.username;
        seller = topS.username;
      }

      room.buys.shift();
      room.sells.shift();

      const trade = { buyer, seller, price, time: nowISO() };
      room.trades.push(trade);
      matches.push(trade);

      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
        type: 'trade', actor: buyer, price
      });
    }

    if (matches.length) {
      io.to(roomId).emit('double-match', matches);
      emitBestQuote(roomId);
      broadcastOrders(roomId);
    }
  }

  // ===== Call (uniform-price) clearing =====
  function runCallClear(roomId) {
    const room = rooms[roomId]; if (!room) return;
    sortBooks(room);
    const B = room.buys.slice();
    const S = room.sells.slice();

    let k = 0;
    while (k < B.length && k < S.length && B[k].price >= S[k].price) k++;
    if (k === 0) {
      io.to(roomId).emit("double-match", []);
      io.to(roomId).emit('call-cleared', { price: null, volume: 0 });
      return;
    }

    const clearing = S[k-1].price; // uniform price = kth best ask (common classroom rule)
    const matches = [];
    for (let i=0; i<k; i++) {
      const buy  = B[i];
      const sell = S[i];
      const trade = { buyer: buy.username, seller: sell.username, price: clearing, time: nowISO() };
      room.trades.push(trade);
      matches.push(trade);
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'trade', actor: buy.username, price: clearing });
    }

    // remove matched from live books
    const bSet = new Set(B.slice(0,k).map(o => o.id));
    const sSet = new Set(S.slice(0,k).map(o => o.id));
    room.buys  = room.buys.filter(o => !bSet.has(o.id));
    room.sells = room.sells.filter(o => !sSet.has(o.id));

    io.to(roomId).emit("double-match", matches);
    io.to(roomId).emit('call-cleared', { price: clearing, volume: k });
    emitBestQuote(roomId);
    broadcastOrders(roomId);
  }

  // ===== socket events =====
  socket.on("join-double", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    socket.join(roomId);
    ensureBook(room);

    // 回传当前配置/状态
    io.to(socket.id).emit('double-state', stateView(room));

    // 把他之前选过的 side 回传
    const uname = socket.username || `User-${socket.id.slice(0,4)}`;
    const side = room.roles[uname] || null;
    if (side) io.to(socket.id).emit('double-side', { side });

    // host 进来就推订单簿
    if (isHost(room, socket)) broadcastOrders(roomId);
  });

  // 角色二选一
  socket.on("double-set-side", ({ roomId, side }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;
    ensureBook(room);

    const s = String(side || '').toLowerCase();
    if (s !== 'buy' && s !== 'sell') return;

    const uname = socket.username || `User-${socket.id.slice(0,4)}`;
    room.roles[uname] = s;
    io.to(socket.id).emit('double-side-set', { side: s });
  });

  // 学生下买单
  socket.on("submit-buy", ({ roomId, price }) => {
    const room = rooms[roomId]; if (!room || (room.type || '').toLowerCase() !== "double") return;
    ensureBook(room);
    if (room.double.status !== 'running') {
      return io.to(socket.id).emit('bid-rejected', { reason: 'NOT_RUNNING' });
    }

    const uname = socket.username || `User-${socket.id.slice(0,4)}`;
    if ((room.roles?.[uname] || null) !== 'buy') {
      return io.to(socket.id).emit('bid-rejected', { reason: (room.roles?.[uname] ? 'SIDE_MISMATCH' : 'NO_SIDE') });
    }

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    const cap = room.balances?.[uname];
    if (cap != null && p > cap) {
      return io.to(socket.id).emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    const order = { id: `b_${Date.now()}_${Math.random()}`, username: uname, price: p, ts: now() };
    room.buys.push(order);
    recordOrder(io, rooms, roomId, uname, 'buy', p);

    emitBestQuote(roomId);
    broadcastOrders(roomId);

    if (room.double.mode === 'cda') tryMatchCDA(roomId);
  });

  // 学生下卖单
  socket.on("submit-sell", ({ roomId, price }) => {
    const room = rooms[roomId]; if (!room || (room.type || '').toLowerCase() !== "double") return;
    ensureBook(room);
    if (room.double.status !== 'running') {
      return io.to(socket.id).emit('bid-rejected', { reason: 'NOT_RUNNING' });
    }

    const uname = socket.username || `User-${socket.id.slice(0,4)}`;
    if ((room.roles?.[uname] || null) !== 'sell') {
      return io.to(socket.id).emit('bid-rejected', { reason: (room.roles?.[uname] ? 'SIDE_MISMATCH' : 'NO_SIDE') });
    }

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    const cap = room.balances?.[uname];
    if (cap != null && p > cap) {
      return io.to(socket.id).emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    const order = { id: `s_${Date.now()}_${Math.random()}`, username: uname, price: p, ts: now() };
    room.sells.push(order);
    recordOrder(io, rooms, roomId, uname, 'sell', p);

    emitBestQuote(roomId);
    broadcastOrders(roomId);

    if (room.double.mode === 'cda') tryMatchCDA(roomId);
  });

  // ===== teacher controls =====
  socket.on("double-config", ({ roomId, mode, showOrders, roundSec }) => {
    const room = rooms[roomId]; if (!room || (room.type || '').toLowerCase() !== "double") return;
    if (!isHost(room, socket)) return;

    ensureBook(room);

    // mode
    const m = String(mode || room.double.mode).toLowerCase();
    room.double.mode = (m === 'call') ? 'call' : 'cda';

    // show/hide order book for students
    if (typeof showOrders === 'boolean') room.double.showOrders = showOrders;

    // round length
    if (Number.isFinite(Number(roundSec)) && Number(roundSec) > 0) {
      room.double.roundSec = Math.max(5, Math.floor(Number(roundSec)));
    }

    io.to(`host:${roomId}`).emit('double-state', stateView(room));
    if (room.double.showOrders) {
      io.to(roomId).emit('double-state', stateView(room));
    } else {
      // 给学生也推状态，但他们不会收到订单簿
      io.to(roomId).emit('double-state', stateView(room));
    }
    broadcastOrders(roomId);
  });

  socket.on("double-start", ({ roomId }) => {
    const room = rooms[roomId]; if (!room || (room.type || '').toLowerCase() !== "double") return;
    if (!isHost(room, socket)) return;
    ensureBook(room);

    room.double.status = 'running';
    room.double.endAt  = now() + room.double.roundSec * 1000;
    io.to(roomId).emit('double-state', stateView(room));
    emitBestQuote(roomId);
    broadcastOrders(roomId);
    startRoundTimer(roomId);
  });

  socket.on("double-stop", ({ roomId }) => {
    const room = rooms[roomId]; if (!room || (room.type || '').toLowerCase() !== "double") return;
    if (!isHost(room, socket)) return;
    ensureBook(room);

    room.double.status = 'paused';
    clearTimer(room);
    io.to(roomId).emit('double-state', stateView(room));
  });

  // 手动清算（仅 Call 模式有效；CDA 下视为“扫一遍可成交”）
  socket.on("double-clear", ({ roomId }) => {
    const room = rooms[roomId]; if (!room || (room.type || '').toLowerCase() !== "double") return;
    if (!isHost(room, socket)) return;
    ensureBook(room);

    if (room.double.mode === 'call') {
      runCallClear(roomId);
    } else {
      tryMatchCDA(roomId);
    }
    io.to(roomId).emit('double-state', stateView(room));
  });

  // 清空订单簿（开始下一回合前可用）
  socket.on("double-reset-books", ({ roomId }) => {
    const room = rooms[roomId]; if (!room || (room.type || '').toLowerCase() !== "double") return;
    if (!isHost(room, socket)) return;
    ensureBook(room);

    room.buys = [];
    room.sells = [];
    emitBestQuote(roomId);
    broadcastOrders(roomId);
  });
};
