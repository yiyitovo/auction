// auctions/sealed.js
module.exports = (io, socket, rooms) => {
  socket.on("join-sealed", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;
    socket.join(roomId);

    // ⭐ 关键：密封投标收集阶段
    if (!room.status || room.status === 'waiting') {
      room.status = 'collecting';
    }
  });

  // ===== 提交密封投标（收集阶段不公开金额与身份给参与者） =====
  socket.on("submit-bid", ({ roomId, amount }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;

    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return;

    const username = socket.username || `User-${socket.id.slice(0,4)}`;

    room.bids = room.bids || [];
    const idx = room.bids.findIndex(b => b.username === username);
    if (idx >= 0) room.bids[idx] = { username, amount: a };
    else room.bids.push({ username, amount: a });

    // 统一历史
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({
      username, amount: a, time: new Date().toISOString(), action: "sealed-submit"
    });

    // ⭐ 新增：审计（收集阶段 -> 参与者端会被自动隐藏金额与身份）
    io.__privacy.logAndBroadcast(io, rooms, roomId, {
      type: 'sealed-bid', actor: username, amount: a
    });

    socket.emit("sealed-submitted", { ok: true });
  });

  // ===== 揭标 =====
  socket.on("reveal-bids", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;

    const bids = (room.bids || []).slice().sort((a,b) => b.amount - a.amount);
    const winner = bids[0] || null;

    // ⭐ 揭标阶段：对所有参与者公布“代号化”的赢家与金额；房主看到真名
    room.status = 'reveal';
    if (winner) {
      // 动态流里逐条 reveal（参与者看到代号，房主真名）
      io.__privacy.logAndBroadcast(io, rooms, roomId, {
        type: 'reveal', actor: winner.username, amount: winner.amount
      });

      // 结束事件也做“分流发送”，保证前端 winner 显示一致
      const labelP = io.__privacy.labelFor(room, winner.username, 'participant');
      io.to(roomId).emit("auction-ended", { winner: { username: labelP, amount: winner.amount } });
      io.to(`host:${roomId}`).emit("auction-ended", { winner });
    } else {
      io.to(roomId).emit("auction-ended", { winner: null });
      io.to(`host:${roomId}`).emit("auction-ended", { winner: null });
    }
    room.status = 'ended';
  });
};
