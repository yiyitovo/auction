// auctions/double.js — choose side + host-only match
module.exports = (io, socket, rooms) => {
  function isHost(room, sock) {
    const name = sock.username || `User-${sock.id.slice(0,4)}`;
    return !!room && room.owner === name;
  }

  socket.on("join-double", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    socket.join(roomId);
    room.buys = room.buys || [];
    room.sells = room.sells || [];
    room.trades = room.trades || [];
    room.roles = room.roles || {}; // { [username]: 'buy' | 'sell' }
    room.status = room.status || 'running';

    // 若已选过边，入房时同步给本人
    const uname = socket.username || `User-${socket.id.slice(0,4)}`;
    if (room.roles[uname]) socket.emit('double-side', { side: room.roles[uname] });
  });

  // 角色选择：二选一
  socket.on("double-set-side", ({ roomId, side }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;
    const s = String(side || '').toLowerCase();
    if (s !== 'buy' && s !== 'sell') return;

    const uname = socket.username || `User-${socket.id.slice(0,4)}`;
    room.roles = room.roles || {};
    room.roles[uname] = s;

    socket.emit('double-side-set', { side: s });
  });

  // 买单
  socket.on("submit-buy", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    const uname = socket.username || `User-${socket.id.slice(0,4)}`;
    if ((room.roles?.[uname] || null) !== 'buy') {
      return socket.emit('bid-rejected', { reason: (room.roles?.[uname] ? 'SIDE_MISMATCH' : 'NO_SIDE') });
    }

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    // cap 校验（如需）
    const cap = room.balances?.[uname];
    if (cap != null && p > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    room.buys.push({ username: uname, price: p, time: new Date().toISOString() });
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({ username: uname, amount: p, time: new Date().toISOString(), side: "buy" });

    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'order', actor: uname, side: 'buy', price: p });
  });

  // 卖单
  socket.on("submit-sell", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    const uname = socket.username || `User-${socket.id.slice(0,4)}`;
    if ((room.roles?.[uname] || null) !== 'sell') {
      return socket.emit('bid-rejected', { reason: (room.roles?.[uname] ? 'SIDE_MISMATCH' : 'NO_SIDE') });
    }

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    // cap 校验（如需保留同买方规则）
    const cap = room.balances?.[uname];
    if (cap != null && p > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    room.sells.push({ username: uname, price: p, time: new Date().toISOString() });
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({ username: uname, amount: p, time: new Date().toISOString(), side: "sell" });

    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'order', actor: uname, side: 'sell', price: p });
  });

  // 撮合（仅房主）
  socket.on("match-double", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;
    if (!isHost(room, socket)) return; // 仅房主可按

    const buys = (room.buys || []).slice().sort((a,b) => b.price - a.price);
    const sells = (room.sells || []).slice().sort((a,b) => a.price - b.price);
    const matches = [];

    while (buys.length && sells.length && buys[0].price >= sells[0].price) {
      const buy = buys.shift();
      const sell = sells.shift();
      const price = (buy.price + sell.price) / 2; // 你也可以改成其它成交价规则

      room.trades.push({ buyer: buy.username, seller: sell.username, price, time: new Date().toISOString() });
      matches.push({ buyer: buy.username, seller: sell.username, price });

      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'trade', actor: buy.username, price });
    }

    room.buys = buys;
    room.sells = sells;

    io.to(roomId).emit("double-match", matches);
  });
};
