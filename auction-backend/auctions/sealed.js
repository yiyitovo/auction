// auctions/sealed.js
module.exports = (io, socket, rooms) => {
  socket.on("join-sealed", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;
    socket.join(roomId);

    if (!room.status || room.status === 'waiting') {
      room.status = 'collecting';
    }
  });

  // 收集密封标
  socket.on("submit-bid", ({ roomId, amount }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;

    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return;

    const username = socket.username || `User-${socket.id.slice(0,4)}`;

    // ⭐ 硬校验 cap
    const cap = room.balances?.[username];
    if (cap != null && a > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    room.bids = room.bids || [];
    const idx = room.bids.findIndex(b => b.username === username);
    if (idx >= 0) room.bids[idx] = { username, amount: a };
    else room.bids.push({ username, amount: a });

    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({ username, amount: a, time: new Date().toISOString(), action: "sealed-submit" });

    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'sealed-bid', actor: username, amount: a });
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
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'reveal', actor: winner.username, amount: winner.amount });

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
