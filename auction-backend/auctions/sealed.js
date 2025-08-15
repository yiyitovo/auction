// auctions/sealed.js
module.exports = (io, socket, rooms) => {
  socket.on("join-sealed", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;
    socket.join(roomId);

    // 收集阶段
    if (!room.status || room.status === 'waiting') {
      room.status = 'collecting';
    }
  });

  // 提交密封标（收集阶段不向参与者公开金额与身份）
  socket.on("submit-bid", ({ roomId, amount }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;

    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return;

    const username = socket.username || `User-${socket.id.slice(0,4)}`;

    // ⭐ cap 校验（关键）
    const cap = room.balances?.[username];
    if (cap != null && a > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    room.bids = room.bids || [];
    const idx = room.bids.findIndex(b => b.username === username);
    if (idx >= 0) room.bids[idx] = { username, amount: a };
    else room.bids.push({ username, amount: a });

    // 历史
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({
      username, amount: a, time: new Date().toISOString(), action: "sealed-submit"
    });

    // 审计（参与者侧会自动隐藏金额与身份）
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
      type: 'sealed-bid', actor: username, amount: a
    });

    socket.emit("sealed-submitted", { ok: true });
  });

  // 揭标
  socket.on("reveal-bids", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;

    const bids = (room.bids || []).slice().sort((a,b) => b.amount - a.amount);
    const winner = bids[0] || null;

    room.status = 'reveal';
    if (winner) {
      // 动态流里 reveal（参与者代号，房主真名）
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
        type: 'reveal', actor: winner.username, amount: winner.amount
      });

      // 结束事件分流，保证前端一致
      const labelP = io.__privacy?.labelFor ? io.__privacy.labelFor(room, winner.username, 'participant') : winner.username;
      io.to(roomId).emit("auction-ended", { winner: { username: labelP, amount: winner.amount } });
      io.to(`host:${roomId}`).emit("auction-ended", { winner });
    } else {
      io.to(roomId).emit("auction-ended", { winner: null });
      io.to(`host:${roomId}`).emit("auction-ended", { winner: null });
    }
    room.status = 'ended';
  });
};
