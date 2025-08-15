// auctions/dutch.js
module.exports = (io, socket, rooms) => {
  // ==== 小工具：只允许房主 ====
  function isHost(room, username) {
    return !!room && !!username && room.owner === username;
  }
  function stopDutchTimer(room) {
    if (room && room.__dutchTimer) {
      clearInterval(room.__dutchTimer);
      room.__dutchTimer = null;
    }
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

      // 广播给所有人
      io.to(roomId).emit("dutch-price", { price: next });
      // 记入审计（匿名时钟）
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'clock', price: next });

      // 到底价后自动暂停
      if (next <= minPrice) {
        stopDutchTimer(room);
        room.status = "paused";
      }
    }, intervalMs);
  }

  // ==== 加入房间 ====
  socket.on("join-dutch", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    socket.join(roomId);

    room.status = room.status || 'waiting';
    room.dutchCfg = room.dutchCfg || { step: 1, intervalMs: 1000, minPrice: 0 };

    // 把当前状态发给新加入者
    if (room.currentPrice != null) socket.emit("dutch-price", { price: room.currentPrice });
    socket.emit("dutch-state", {
      status: room.status,
      cfg: room.dutchCfg
    });
    if (room.status === "ended" && room.winner) socket.emit("auction-ended", { winner: room.winner });
  });

  // ==== 老 API：手动设当前价（兼容保留） ====
  socket.on("dutch-set-price", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    if (!isHost(room, socket.username)) return; // 仅房主

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    stopDutchTimer(room);
    room.currentPrice = p;
    room.status = "paused";
    io.to(roomId).emit("dutch-price", { price: p });
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'clock', price: p });
  });

  // ==== 新 API：配置时钟（每隔 N 秒降 M 元、可设底价） ====
  socket.on("dutch-config", ({ roomId, startPrice, step, intervalSec, minPrice }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    if (!isHost(room, socket.username)) return; // 仅房主

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
      intervalMs: Math.max(200, sec * 1000), // 不少于200ms
      minPrice: Math.max(0, min)
    };

    // 把配置和最新价格同步给所有人
    io.to(roomId).emit("dutch-state", {
      status: room.status,
      cfg: room.dutchCfg
    });
    io.to(roomId).emit("dutch-price", { price: start });
  });

  // ==== 新 API：开始/停止 时钟 ====
  socket.on("dutch-start", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    if (!isHost(room, socket.username)) return; // 仅房主
    startDutchTimer(io, rooms, roomId);
  });

  socket.on("dutch-stop", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    if (!isHost(room, socket.username)) return; // 仅房主
    stopDutchTimer(room);
    room.status = "paused";
    io.to(roomId).emit("dutch-state", { status: room.status, cfg: room.dutchCfg });
  });

  // ==== 接受价格（谁先点谁得）；结束同时停止时钟 ====
  socket.on("accept-price", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    if (room.status === "ended") return;

    const finalPrice = Number(price ?? room.currentPrice);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) return;

    // 硬校验 cap
    const cap = room.balances?.[socket.username];
    if (cap != null && finalPrice > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    const username = socket.username || `User-${socket.id.slice(0,4)}`;
    room.status = "ended";
    room.winner = { username, price: finalPrice };

    stopDutchTimer(room);

    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({
      username, amount: finalPrice, time: new Date().toISOString(), action: "dutch-accept"
    });

    io.to(roomId).emit("auction-ended", { winner: room.winner });
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'accept', actor: username, amount: finalPrice });
  });
};
