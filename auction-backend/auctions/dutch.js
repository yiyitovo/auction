// auctions/dutch.js  — v2025-08-17
module.exports = (io, socket, rooms) => {
  // ==== 工具 ====
  function isHost(room, username) { return !!room && !!username && room.owner === username; }

  function stopDutchTimer(room) {
    if (room && room.__dutchTimer) {
      clearInterval(room.__dutchTimer);
      room.__dutchTimer = null;
    }
  }

  function broadcastBudgets(io, rooms, roomId) {
    const room = rooms[roomId];
    if (!room) return;
    const budgets = Object.entries(room.balances || {}).map(([name, cap]) => ({ name, cap }));
    io.to(roomId).emit('budget-list', { budgets });
    io.to(`host:${roomId}`).emit('budget-list', { budgets });
  }

  function startDutchTimer(io, rooms, roomId) {
    const room = rooms[roomId];
    if (!room) return;
    stopDutchTimer(room);

    const cfg = room.dutchCfg || {};
    const step = Number(cfg.step || 1);
    const intervalMs = Number(cfg.intervalMs || 1000);
    const minPrice = Number(cfg.minPrice ?? 0);

    // 没有起始价则不启动
    if (!Number.isFinite(room.currentPrice)) return;

    room.status = "in-progress";
    room.__dutchTimer = setInterval(() => {
      if (room.status === "ended") {
        stopDutchTimer(room);
        return;
      }
      let next = Number(room.currentPrice) - step;
      if (!Number.isFinite(next)) next = 0;
      if (next < minPrice) next = minPrice;

      room.currentPrice = next;

      io.to(roomId).emit("dutch-price", { price: next });
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'clock', price: next });

      // 到底价后自动暂停
      if (next <= minPrice) {
        stopDutchTimer(room);
        room.status = "paused";
        io.to(roomId).emit("dutch-state", { status: room.status, cfg: room.dutchCfg });
      }
    }, intervalMs);
  }

  // ==== 入房 ====
  socket.on("join-dutch", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;

    socket.join(roomId);
    room.status = room.status || 'waiting';
    room.dutchCfg = room.dutchCfg || { step: 1, intervalMs: 1000, minPrice: 0 };

    // 同步状态
    if (room.currentPrice != null) socket.emit("dutch-price", { price: room.currentPrice });
    socket.emit("dutch-state", { status: room.status, cfg: room.dutchCfg });

    // 广播预算列表（所有人可见）
    broadcastBudgets(io, rooms, roomId);

    if (room.status === "ended" && room.winner) socket.emit("auction-ended", { winner: room.winner });
  });

  // ==== 老 API：手动设当前价（仅房主） ====
  socket.on("dutch-set-price", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    if (!isHost(room, socket.username)) return;

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    stopDutchTimer(room);
    room.currentPrice = p;
    room.status = "paused";
    io.to(roomId).emit("dutch-price", { price: p });
    io.to(roomId).emit("dutch-state", { status: room.status, cfg: room.dutchCfg });
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'clock', price: p });
  });

  // ==== 新 API：配置时钟（仅房主） ====
  socket.on("dutch-config", ({ roomId, startPrice, step, intervalSec, minPrice }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    if (!isHost(room, socket.username)) return;

    const start = Number(startPrice);
    const stp   = Number(step);
    const sec   = Number(intervalSec);
    const min   = Number(minPrice ?? 0);

    if (!Number.isFinite(start) || start <= 0) return;
    if (!Number.isFinite(stp) || stp <= 0) return;
    if (!Number.isFinite(sec) || sec <= 0) return;

    stopDutchTimer(room);
    room.currentPrice = start;
    room.status = "paused";
    room.dutchCfg = {
      step: stp,
      intervalMs: Math.max(200, sec * 1000),
      minPrice: Math.max(0, min)
    };

    io.to(roomId).emit("dutch-state", { status: room.status, cfg: room.dutchCfg });
    io.to(roomId).emit("dutch-price", { price: start });

    // 配置后也同步预算列表（以防创建后才进人）
    broadcastBudgets(io, rooms, roomId);
  });

  // ==== 开始/停止（仅房主） ====
  socket.on("dutch-start", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    if (!isHost(room, socket.username)) return;
    startDutchTimer(io, rooms, roomId);
    io.to(roomId).emit("dutch-state", { status: rooms[roomId].status, cfg: rooms[roomId].dutchCfg });
  });

  socket.on("dutch-stop", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    if (!isHost(room, socket.username)) return;
    stopDutchTimer(room);
    room.status = "paused";
    io.to(roomId).emit("dutch-state", { status: room.status, cfg: room.dutchCfg });
  });

  // ==== 接受当前价（先到先得） ====
  socket.on("accept-price", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;

    // 必须在进行中
    if (room.status !== "in-progress") {
      return socket.emit('bid-rejected', { reason: 'NOT_STARTED' });
    }

    // 原子锁，防止并发同时取胜
    if (room.__accepting) return;
    room.__accepting = true;

    try {
      if (room.status === "ended") return; // 双重保险

      const priceNow = Number(room.currentPrice);
      if (!Number.isFinite(priceNow) || priceNow <= 0) return;

      const username = socket.username || `User-${socket.id.slice(0,4)}`;

      // 预算校验：cap >= 当前价
      const cap = room.balances?.[username];
      if (cap != null && priceNow > cap) {
        return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
      }

      // 宣布胜者
      room.status = "ended";
      room.winner = { username, price: priceNow };
      stopDutchTimer(room);

      room.bidHistory = room.bidHistory || [];
      room.bidHistory.push({
        username, amount: priceNow, time: new Date().toISOString(), action: "dutch-accept"
      });

      io.to(roomId).emit("auction-ended", { winner: room.winner });
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'accept', actor: username, amount: priceNow });
    } finally {
      room.__accepting = false;
    }
  });
};
