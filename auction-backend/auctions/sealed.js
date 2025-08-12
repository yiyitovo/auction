// auctions/sealed.js
module.exports = (io, socket, rooms) => {
  socket.on("join-sealed", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;
    socket.join(roomId);
    // 密封阶段不广播任何出价细节
  });

  socket.on("submit-bid", ({ roomId, amount }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;

    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return;

    const username = socket.username || `User-${socket.id.slice(0,4)}`;

    room.bids = room.bids || [];
    // 若想最后一次为准，可先删除旧的
    const idx = room.bids.findIndex(b => b.username === username);
    if (idx >= 0) room.bids[idx] = { username, amount: a };
    else room.bids.push({ username, amount: a });

    // 记录到统一 bidHistory（不对外广播细节）
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({
      username,
      amount: a,
      time: new Date().toISOString(),
      action: "sealed-submit"
    });

    // 可选：给提交者回执
    socket.emit("sealed-submitted", { ok: true });
  });

  socket.on("reveal-bids", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;

    const bids = (room.bids || []).slice().sort((a,b) => b.amount - a.amount);
    const winner = bids[0] || null;

    io.to(roomId).emit("auction-ended", { winner }); // 保持你原事件名
  });
};
