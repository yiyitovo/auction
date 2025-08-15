// auctions/dutch.js
module.exports = (io, socket, rooms) => {
  // 加入 Dutch 房间
  socket.on("join-dutch", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    socket.join(roomId);

    room.status = room.status || 'waiting';

    // 把当前价与已结束状态发给新加入者（可选）
    if (room.currentPrice != null) {
      socket.emit("dutch-price", { price: room.currentPrice });
    }
    if (room.status === "ended" && room.winner) {
      socket.emit("auction-ended", { winner: room.winner });
    }
  });

  // 房主设置/更新当前价格（时钟）
  socket.on("dutch-set-price", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    room.currentPrice = p;
    room.status = "in-progress";
    io.to(roomId).emit("dutch-price", { price: p });

    // 正确的时钟审计（不要用未定义的 nextPrice）
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'clock', price: p }); // 无身份
  });

  // 接受当前价（你前端传入 price；不传则取当前价）
  socket.on("accept-price", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    if (room.status === "ended") return;

    const finalPrice = Number(price ?? room.currentPrice);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) return;

    // ⭐ cap 校验（关键）
    const cap = room.balances?.[socket.username];
    if (cap != null && finalPrice > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    const username = socket.username || `User-${socket.id.slice(0,4)}`;
    room.status = "ended";
    room.winner = { username, price: finalPrice };

    // 历史
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({
      username,
      amount: finalPrice,
      time: new Date().toISOString(),
      action: "dutch-accept"
    });

    // 结束广播 + 审计“accept”
    io.to(roomId).emit("auction-ended", { winner: room.winner });
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'accept', actor: username, amount: finalPrice });
  });

  // （可选）不带 price 的接受，取当前价
  socket.on("dutch-accept", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    if (room.status === "ended") return;

    const finalPrice = Number(room.currentPrice);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) return;

    // ⭐ cap 校验
    const cap = room.balances?.[socket.username];
    if (cap != null && finalPrice > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    const username = socket.username || `User-${socket.id.slice(0,4)}`;
    room.status = "ended";
    room.winner = { username, price: finalPrice };

    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({
      username,
      amount: finalPrice,
      time: new Date().toISOString(),
      action: "dutch-accept"
    });

    io.to(roomId).emit("auction-ended", { winner: room.winner });
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'accept', actor: username, amount: finalPrice });
  });
};
