// auctions/english.js
module.exports = (io, socket, rooms) => {
  function ensureEnglishConfig(room) {
    room.english = room.english || { baseAmount: 0, noBidAutoEndSec: 0, _timer: null };
    if (typeof room.english.baseAmount !== 'number') room.english.baseAmount = Number(room.english.baseAmount) || 0;
    if (typeof room.english.noBidAutoEndSec !== 'number') room.english.noBidAutoEndSec = Number(room.english.noBidAutoEndSec) || 0;
    return room.english;
  }

  // 给所有人发送“订单记录”：price / name / time（实名）
  function sendOrder(io, roomId) {
    const room = rooms[roomId]; if (!room) return;
    const list = (room.bidHistory || []).map(b => ({
      price: b.amount,
      name:  b.username,
      time:  b.time
    }));
    io.to(roomId).emit('order', list);               // 所有人（含教师）同样收到
    io.to(`host:${roomId}`).emit('order', list);     // 冗余同步，保证教师端也能收到
  }

  function announceEnd(io, roomId) {
    const room = rooms[roomId]; if (!room) return;
    if (room.status === 'ended') return;
    room.status = 'ended';

    const winner = (room.highestBidder && room.currentPrice != null)
      ? { username: room.highestBidder, amount: room.currentPrice }
      : null;

    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'win', actor: winner ? winner.username : 'NO_WINNER', amount: winner?.amount });

    // 公布结果（实名）
    io.to(roomId).emit('english-ended', { winner });
    io.to(`host:${roomId}`).emit('english-ended', { winner });
  }

  function resetAutoEndTimer(io, roomId) {
    const room = rooms[roomId]; if (!room) return;
    const cfg = ensureEnglishConfig(room);
    if (cfg._timer) { clearTimeout(cfg._timer); cfg._timer = null; }
    const sec = Number(cfg.noBidAutoEndSec) || 0;
    if (sec > 0 && room.status !== 'ended') {
      cfg._timer = setTimeout(() => announceEnd(io, roomId), sec * 1000);
    }
  }

  socket.on("join-english", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "english") return;

    socket.join(roomId);
    room.status = room.status || 'running';
    const cfg = ensureEnglishConfig(room);

    // 起拍价初始化
    if (room.currentPrice == null) {
      room.currentPrice = Number(cfg.baseAmount) || 0;
      room.highestBidder = null;
    }

    // 当前价 + 最高出价者（实名）
    socket.emit("bid-update", {
      currentPrice: room.currentPrice,
      highestBidder: room.highestBidder || null
    });

    // 首次下发订单记录（price/name/time）
    sendOrder(io, roomId);
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

    // ⭐ 硬校验 cap
    const cap = room.balances?.[socket.username];
    if (cap != null && bidAmount > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    // 更新最高价与历史
    room.currentPrice = bidAmount;
    room.highestBidder = socket.username;

    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({
      username: socket.username || `User-${socket.id.slice(0, 4)}`,
      amount: bidAmount,
      time: new Date().toISOString()
    });

    // 审计
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'bid', actor: socket.username, amount: bidAmount });

    // 广播当前价 + 最高出价者（实名）
    io.to(roomId).emit("bid-update", {
      currentPrice: bidAmount,
      highestBidder: socket.username
    });
    io.to(`host:${roomId}`).emit("bid-update", {
      currentPrice: bidAmount,
      highestBidder: socket.username
    });

    // 广播订单记录（price/name/time）
    sendOrder(io, roomId);

    // 自动结束倒计时
    resetAutoEndTimer(io, roomId);
  });

  // 手动结束（仅教师）
  socket.on("end-english", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "english") return;
    const isHost = socket.rooms?.has?.(`host:${roomId}`);
    if (!isHost) return socket.emit('forbidden', { action: 'end-english', reason: 'HOST_ONLY' });
    announceEnd(io, roomId);
  });
};
