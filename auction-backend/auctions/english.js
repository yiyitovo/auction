// auctions/english.js
module.exports = (io, socket, rooms) => {
  // ---- 工具：仅房主 ----
  function isHost(room, username) {
    return !!room && !!username && room.owner === username;
  }
  function stopNoBidTimer(room) {
    if (room?.english?._timer) {
      clearTimeout(room.english._timer);
      room.english._timer = null;
    }
  }

  socket.on("join-english", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "english") return;

    socket.join(roomId);
    room.status = room.status || 'running';

    if (room.currentPrice != null) {
      socket.emit("bid-update", {
        currentPrice: room.currentPrice,
        highestBidder: room.highestBidder ?? null
      });
    }
    // 如果已结束，把结果补给新加入者
    if (room.status === "ended") {
      const winner = room.highestBidder
        ? { username: room.highestBidder, amount: room.currentPrice }
        : null;
      socket.emit("auction-ended", { winner });
    }
  });

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

    // cap
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

    // 活动流
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
      type: 'bid', actor: socket.username, amount: bidAmount
    });

    // 广播价格与最高出价者（真实用户名）
    io.to(roomId).emit("bid-update", {
      currentPrice: bidAmount,
      highestBidder: room.highestBidder
    });

    // 如果你有“无人加价自动结束”的逻辑，这里可以重置定时器（可选）
    if (room.english?.noBidAutoEndSec > 0) {
      stopNoBidTimer(room);
      room.english._timer = setTimeout(() => {
        if (room.status === 'ended') return;
        const winner = room.highestBidder
          ? { username: room.highestBidder, amount: room.currentPrice }
          : null;
        room.status = 'ended';
        io.to(roomId).emit("auction-ended", { winner });
        io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
          type: 'win', actor: winner?.username || '—', amount: winner?.amount
        });
      }, Number(room.english.noBidAutoEndSec) * 1000);
    }
  });

  // ⭐ 教师“拍锤”：手动结束
  socket.on("english-hammer", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "english") return;
    if (!isHost(room, socket.username)) return; // 仅房主
    if (room.status === "ended") return;

    stopNoBidTimer(room);

    const winner = room.highestBidder
      ? { username: room.highestBidder, amount: room.currentPrice }
      : null;

    room.status = "ended";

    // 记录一次 hammer 行为
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({
      username: socket.username,
      amount: room.currentPrice ?? 0,
      time: new Date().toISOString(),
      action: "english-hammer"
    });

    io.to(roomId).emit("auction-ended", { winner });
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
      type: 'win', actor: winner?.username || '—', amount: winner?.amount
    });
  });
};
