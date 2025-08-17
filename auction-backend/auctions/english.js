// auctions/english.js  — order-only v2025-08-17
console.log("[English] module loaded: order-only v2025-08-17");

module.exports = (io, socket, rooms) => {
  function ensureEnglishConfig(room) {
    room.english = room.english || { baseAmount: 0, noBidAutoEndSec: 0, _timer: null };
    room.english.baseAmount = Number(room.english.baseAmount) || 0;
    room.english.noBidAutoEndSec = Number(room.english.noBidAutoEndSec) || 0;
    return room.english;
  }

  // 仅发送 'order'：[{ price, name, time }]
  function sendOrder(io, roomId) {
    const room = rooms[roomId]; if (!room) return;
    const list = (room.bidHistory || []).map(b => ({
      price: b.amount,
      name:  b.username,
      time:  b.time
    }));
    io.to(roomId).emit('order', list);
    io.to(`host:${roomId}`).emit('order', list);
    console.log(`[English] order broadcast room=${roomId} count=${list.length}`);
  }

  function announceEnd(io, roomId) {
    const room = rooms[roomId]; if (!room) return;
    if (room.status === 'ended') return;
    room.status = 'ended';

    const winner = (room.highestBidder && room.currentPrice != null)
      ? { username: room.highestBidder, amount: room.currentPrice }
      : null;

    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
      type: 'win', actor: winner ? winner.username : 'NO_WINNER', amount: winner?.amount
    });

    io.to(roomId).emit('english-ended', { winner });
    io.to(`host:${roomId}`).emit('english-ended', { winner });
    console.log(`[English] ended room=${roomId} winner=${winner ? winner.username + '@' + winner.amount : 'none'}`);
  }

  function resetAutoEndTimer(io, roomId) {
    const room = rooms[roomId]; if (!room) return;
    const cfg = ensureEnglishConfig(room);
    if (cfg._timer) { clearTimeout(cfg._timer); cfg._timer = null; }
    const sec = cfg.noBidAutoEndSec;
    if (sec > 0 && room.status !== 'ended') {
      cfg._timer = setTimeout(() => announceEnd(io, roomId), sec * 1000);
      console.log(`[English] timer reset room=${roomId} sec=${sec}`);
    }
  }

  socket.on("join-english", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "english") return;

    socket.join(roomId);
    room.status = room.status || 'running';
    const cfg = ensureEnglishConfig(room);

    if (room.currentPrice == null) {
      room.currentPrice = cfg.baseAmount;
      room.highestBidder = null;
    }

    socket.emit("bid-update", {
      currentPrice: room.currentPrice,
      highestBidder: room.highestBidder || null
    });

    sendOrder(io, roomId);
    console.log(`[English] join room=${roomId} user=${socket.username}`);
  });

  socket.on("place-bid", ({ roomId, amount }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "english" || room.status === 'ended') return;

    const bidAmount = Number(amount);
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) return;

    const prev = Number(room.currentPrice ?? 0);
    if (bidAmount <= prev) {
      return socket.emit('bid-rejected', { reason: 'INVALID_AMOUNT', curr: room.currentPrice ?? 0 });
    }

    const cap = room.balances?.[socket.username];
    if (cap != null && bidAmount > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    room.currentPrice = bidAmount;
    room.highestBidder = socket.username;

    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({
      username: socket.username || `User-${socket.id.slice(0,4)}`,
      amount: bidAmount,
      time: new Date().toISOString()
    });

    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
      type: 'bid', actor: socket.username, amount: bidAmount
    });

    io.to(roomId).emit("bid-update", { currentPrice: bidAmount, highestBidder: socket.username });
    io.to(`host:${roomId}`).emit("bid-update", { currentPrice: bidAmount, highestBidder: socket.username });

    sendOrder(io, roomId);
    resetAutoEndTimer(io, roomId);

    console.log(`[English] bid room=${roomId} user=${socket.username} amount=${bidAmount}`);
  });

  socket.on("end-english", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "english") return;
    const isHost = socket.rooms?.has?.(`host:${roomId}`);
    if (!isHost) return socket.emit('forbidden', { action: 'end-english', reason: 'HOST_ONLY' });
    announceEnd(io, roomId);
  });
};
