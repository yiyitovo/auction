// auctions/english.js
module.exports = (io, socket, rooms) => {
  socket.on("join-english", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "english") return;

    socket.join(roomId);

    // 首次进入时把当前价格发给新加入的人（可选）
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
    if (bidAmount <= prev) return; // 必须严格高于当前价

    // 更新当前价格
    room.currentPrice = bidAmount;

    // 记录出价历史（username 依赖于 server.js 里的 join-room 设置）
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({
      username: socket.username || `User-${socket.id.slice(0, 4)}`,
      amount: bidAmount,
      time: new Date().toISOString()
    });

    // 广播最新价格
    io.to(roomId).emit("bid-update", { currentPrice: bidAmount });
  });
};
