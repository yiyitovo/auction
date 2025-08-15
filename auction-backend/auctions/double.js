// auctions/double.js
module.exports = (io, socket, rooms) => {
  socket.on("join-double", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    socket.join(roomId);
    room.buys = room.buys || [];
    room.sells = room.sells || [];
    room.trades = room.trades || [];
    room.status = room.status || 'running';
  });

  // 买单
  socket.on("submit-buy", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    const username = socket.username || `User-${socket.id.slice(0,4)}`;

    // ⭐ cap 校验（关键）
    const cap = room.balances?.[username];
    if (cap != null && p > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    room.buys.push({ username, price: p, time: new Date().toISOString() });
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({ username, amount: p, time: new Date().toISOString(), side: "buy" });

    // 审计
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
      type: 'order', actor: username, side: 'buy', price: p
    });
  });

  // 卖单
  socket.on("submit-sell", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    const username = socket.username || `User-${socket.id.slice(0,4)}`;

    // ⭐ cap 校验（关键）
    const cap = room.balances?.[username];
    if (cap != null && p > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    room.sells.push({ username, price: p, time: new Date().toISOString() });
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({ username, amount: p, time: new Date().toISOString(), side: "sell" });

    // 审计
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
      type: 'order', actor: username, side: 'sell', price: p
    });
  });

  // 撮合
  socket.on("match-double", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    const buys = (room.buys || []).slice().sort((a,b) => b.price - a.price);
    const sells = (room.sells || []).slice().sort((a,b) => a.price - b.price);
    const matches = [];

    while (buys.length && sells.length && buys[0].price >= sells[0].price) {
      const buy = buys.shift();
      const sell = sells.shift();
      const price = (buy.price + sell.price) / 2;

      room.trades.push({ buyer: buy.username, seller: sell.username, price, time: new Date().toISOString() });
      matches.push({ buyer: buy.username, seller: sell.username, price });

      // 成交审计（买家视角；如需也可再发一条卖家视角）
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, {
        type: 'trade', actor: buy.username, price
      });
      // 可选：再记一条卖家视角
      // io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'trade', actor: sell.username, price });
    }

    // 覆盖盘面
    room.buys = buys;
    room.sells = sells;

    // 业务事件
    io.to(roomId).emit("double-match", matches);
  });
};
