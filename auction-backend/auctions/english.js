// auctions/english.js
module.exports = (io, socket, rooms) => {
  socket.on("join-english", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "english") return;

    socket.join(roomId);
    room.status = room.status || 'running';

    // 可选：把当前价先发给新加入者
    if (room.currentPrice != null) {
      socket.emit("bid-update", { currentPrice: room.currentPrice });
    }
  });

  socket.on("place-bid", ({ roomId, amount }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "english") return;

    const bidAmount = Number(amount);
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) return;

    const prev = room.currentPrice ?? -Infinity;
    if (bidAmount <= prev) {
      return socket.emit('bid-rejected', { reason: 'INVALID_AMOUNT', curr: room.currentPrice ?? 0 });
    }

    // ⭐ 预算上限硬校验（关键）
    const cap = room.balances?.[socket.username];
    if (cap != null && bidAmount > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    // 通过：更新当前价格与历史
    room.currentPrice = bidAmount;
    room.highestBidder = socket.username;
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({
      username: socket.username || `User-${socket.id.slice(0, 4)}`,
      amount: bidAmount,
      time: new Date().toISOString()
    });

    // 审计 + 最高出价者标签（隐私分流）
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'bid', actor: socket.username, amount: bidAmount });
    if (io.__privacy?.emitBidUpdate) {
      io.__privacy.emitBidUpdate(io, rooms, roomId, socket.username, bidAmount);
    } else {
      io.to(roomId).emit("bid-update", { currentPrice: bidAmount });
    }
  });
};
