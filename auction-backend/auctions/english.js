// auctions/english.js
module.exports = (io, socket, rooms) => {
  // ===== 工具 =====
  function isHost(room, username) {
    return !!room && !!username && room.owner === username;
  }
  function ensureEnglish(room) {
    room.english = room.english || {};
    if (typeof room.english.countdownSec !== 'number') room.english.countdownSec = 60;
    if (typeof room.english.remaining !== 'number') room.english.remaining = null;
    room.englishOrders = room.englishOrders || []; // [{user, amount, ts}]
    return room.english;
  }
  function stopTick(room) {
    if (room?.english?._tick) { clearInterval(room.english._tick); room.english._tick = null; }
  }
  function broadcastOrders(io, rooms, roomId) {
    const room = rooms[roomId]; if (!room) return;
    const list = (room.englishOrders || []).slice()
      .sort((a,b)=> b.amount - a.amount || a.ts - b.ts);
    io.to(roomId).emit('english:orders', { orders: list });
    io.to(`host:${roomId}`).emit('english:orders', { orders: list });
  }
  function emitState(io, rooms, roomId) {
    const room = rooms[roomId]; if (!room) return;
    io.to(roomId).emit('english:state', { status: room.status || 'waiting' });
    io.to(`host:${roomId}`).emit('english:state', { status: room.status || 'waiting' });
  }
  function endNow(io, rooms, roomId, reason='timeup') {
    const room = rooms[roomId]; if (!room) return;
    stopTick(room);
    if (room.status === 'ended') return;

    const winner = room.highestBidder
      ? { username: room.highestBidder, amount: room.currentPrice }
      : null;

    room.status = 'ended';

    // 新协议赢家
    io.to(roomId).emit('english:winner', { winner: winner?.username || null, price: winner?.amount ?? null });
    // 兼容旧协议
    io.to(roomId).emit('auction-ended', { winner });

    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
      type: 'win', actor: winner?.username || '—', amount: winner?.amount, reason
    });
    emitState(io, rooms, roomId);
  }

  // ===== 入房 =====
  socket.on('join-english', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== 'english') return;

    socket.join(roomId);
    room.status = room.status || 'waiting';
    const eg = ensureEnglish(room);

    // 同步现价/最高者
    if (room.currentPrice != null) {
      socket.emit('bid-update', { currentPrice: room.currentPrice, highestBidder: room.highestBidder ?? null });
    }
    // 同步配置/状态/倒计时
    socket.emit('english:config', { countdownSec: eg.countdownSec });
    socket.emit('english:state', { status: room.status });
    if (room.status === 'running' && typeof eg.remaining === 'number') {
      socket.emit('english:tick', { remaining: eg.remaining });
    }
    // 同步订单簿
    socket.emit('english:orders', { orders: (room.englishOrders || []).slice().sort((a,b)=> b.amount - a.amount || a.ts - b.ts) });

    // 若已结束，补结果
    if (room.status === 'ended') {
      const winner = room.highestBidder ? { username: room.highestBidder, amount: room.currentPrice } : null;
      socket.emit('auction-ended', { winner }); // 旧
      socket.emit('english:winner', { winner: winner?.username || null, price: winner?.amount ?? null }); // 新
    }
  });

  // ===== 出价 =====
  socket.on("place-bid", ({ roomId, amount }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "english") return;
    if (room.status === "ended") return;

    const bidAmount = Number(amount);
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) return;

    const prev = room.currentPrice ?? -Infinity;
    if (bidAmount <= prev) {
      return socket.emit('bid-rejected', { reason: 'INVALID_AMOUNT', curr: room.currentPrice ?? 0 });
    }

    // budget cap
    const cap = room.balances?.[socket.username];
    if (cap != null && bidAmount > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    room.currentPrice = bidAmount;
    room.highestBidder = socket.username;

    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({
      username: socket.username || `User-${socket.id.slice(0, 4)}`,
      amount: bidAmount,
      time: new Date().toISOString(),
      action: "english-bid"
    });

    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
      type: 'bid', actor: socket.username, amount: bidAmount
    });

    // 广播最新价格/最高者
    io.to(roomId).emit("bid-update", { currentPrice: bidAmount, highestBidder: room.highestBidder });

    // 订单簿
    ensureEnglish(room);
    room.englishOrders.push({ user: socket.username || `User-${socket.id.slice(0,4)}`, amount: bidAmount, ts: Date.now() });
    broadcastOrders(io, rooms, roomId);
  });

  // ===== 老的手动拍锤（兼容） =====
  socket.on("english-hammer", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "english") return;
    if (!isHost(room, socket.username)) return;
    if (room.status === "ended") return;
    endNow(io, rooms, roomId, 'legacy-hammer');
  });

  // ===== 新：仅设置 Countdown（不再有 startPrice） =====
  socket.on('english:set-config', ({ roomId, countdownSec = 60 }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== 'english') return;
    if (!isHost(room, socket.username)) return;
    const eg = ensureEnglish(room);
    eg.countdownSec = Number(countdownSec) || 60;
    io.to(roomId).emit('english:config', { countdownSec: eg.countdownSec });
  });

  // ===== 新：老师直接设置 current price（等同起拍价） =====
  socket.on('english:set-current', ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== 'english') return;
    if (!isHost(room, socket.username)) return;

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    // 设置现价并清空最高出价者（老师设价不代表有竞拍者）
    room.currentPrice = p;
    room.highestBidder = null;

    io.to(roomId).emit('bid-update', { currentPrice: p, highestBidder: null });
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'set-price', actor: socket.username, amount: p });
  });

  // ===== 新：开始 / 停止（使用 currentPrice，不覆盖） =====
  socket.on('english:start', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== 'english') return;
    if (!isHost(room, socket.username)) return;

    const eg = ensureEnglish(room);
    stopTick(room);

    room.status = 'running';
    if (!Number.isFinite(Number(room.currentPrice)) || Number(room.currentPrice) <= 0) {
      room.currentPrice = 1; // 若老师未设，则兜底为 1
      room.highestBidder = null;
      io.to(roomId).emit('bid-update', { currentPrice: room.currentPrice, highestBidder: null });
    }
    eg.remaining = Number(eg.countdownSec) || 60;
    emitState(io, rooms, roomId);

    eg._tick = setInterval(() => {
      if (room.status !== 'running') return;
      eg.remaining = Math.max(0, (eg.remaining || 0) - 1);
      io.to(roomId).emit('english:tick', { remaining: eg.remaining });
      if (eg.remaining <= 0) endNow(io, rooms, roomId, 'timeup');
    }, 1000);
  });

  socket.on('english:stop', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== 'english') return;
    if (!isHost(room, socket.username)) return;
    if (room.status === 'ended') return;
    endNow(io, rooms, roomId, 'stop');
  });
};
