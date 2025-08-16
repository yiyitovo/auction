// auctions/sealed.js
module.exports = (io, socket, rooms) => {
  // 判断是否为房主/教师
  function isSocketHost(sock, room, roomId) {
    const hostRoom = `host:${roomId}`;
    const name = sock.username || `User-${sock.id.slice(0,4)}`;
    return (
      (typeof sock.rooms?.has === 'function' && sock.rooms.has(hostRoom)) ||
      (room && (
        room.ownerSocketId === sock.id ||
        room.ownerId === sock.id ||
        room.ownerUsername === name ||
        room.hostUsername === name
      ))
    );
  }

  socket.on("join-sealed", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;
    socket.join(roomId);

    if (!room.status || room.status === 'waiting') {
      room.status = 'collecting';
    }
  });

  // 供前端自检是否是 host（用于隐藏“Reveal”按钮）
  socket.on("am-i-host", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const isHost = isSocketHost(socket, room, roomId);
    socket.emit("you-are-host", { roomId, isHost });
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
    room.bidHistory.push({
      username,
      amount: a,
      time: new Date().toISOString(),
      action: "sealed-submit"
    });

    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
      type: 'sealed-bid', actor: username, amount: a
    });
    socket.emit("sealed-submitted", { ok: true });
  });

  // 仅教师可“揭标”
  socket.on("reveal-bids", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;

    // 权限校验
    if (!isSocketHost(socket, room, roomId)) {
      return socket.emit('forbidden', { action: 'reveal-bids', reason: 'HOST_ONLY' });
    }

    const bids = (room.bids || []).slice().sort((a,b) => b.amount - a.amount);
    const winner = bids[0] || null;

    room.status = 'reveal';
    if (winner) {
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
        type: 'reveal', actor: winner.username, amount: winner.amount
      });

      // 参与端打码；host 端给真实用户名
      const labelP = io.__privacy?.labelFor
        ? io.__privacy.labelFor(room, winner.username, 'participant')
        : winner.username;

      io.to(roomId).emit("auction-ended", {
        winner: { username: labelP, amount: winner.amount }
      });
      io.to(`host:${roomId}`).emit("auction-ended", { winner });
    } else {
      io.to(roomId).emit("auction-ended", { winner: null });
      io.to(`host:${roomId}`).emit("auction-ended", { winner: null });
    }
    room.status = 'ended';
  });
};
