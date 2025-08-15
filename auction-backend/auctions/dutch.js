// auctions/dutch.js
module.exports = (io, socket, rooms) => {
  // 加入 Dutch 房间
  socket.on("join-dutch", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    socket.join(roomId);

    // 可选：把当前价发给新加入者
    if (room.currentPrice != null) {
      socket.emit("dutch-price", { price: room.currentPrice });
    }
    if (room.status === "ended" && room.winner) {
      socket.emit("auction-ended", { winner: room.winner });
    }
  });

  // （可选）房主设置或更新当前价格
  socket.on("dutch-set-price", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    room.currentPrice = p;
    room.status = "in-progress";
    io.to(roomId).emit("dutch-price", { price: p });
    io.__privacy.logAndBroadcast(io, rooms, roomId, { type: 'clock', price: nextPrice }); // 无身份
  });

  // 你前端已有：接受当前价（传入 price）
  socket.on("accept-price", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    if (room.status === "ended") return;

    const finalPrice = Number(price ?? room.currentPrice);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) return;

    const username = socket.username || `User-${socket.id.slice(0,4)}`;
    room.status = "ended";
    room.winner = { username, price: finalPrice };

    // 记录历史
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({
      username,
      amount: finalPrice,
      time: new Date().toISOString(),
      action: "dutch-accept"
    });

    io.to(roomId).emit("auction-ended", { winner: room.winner });
    io.__privacy.logAndBroadcast(io, rooms, roomId, { type: 'clock', price: nextPrice }); // 无身份

  });

  // （可选）不带 price 的接受，取当前价
  socket.on("dutch-accept", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "dutch") return;
    if (room.status === "ended") return;

    const finalPrice = Number(room.currentPrice);
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) return;

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
  });
};
