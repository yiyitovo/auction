// auctions/double.js
module.exports = (io, socket, rooms) => {
  socket.on("join-double", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    socket.join(roomId);
    room.buys = room.buys || [];
    room.sells = room.sells || [];
    room.trades = room.trades || [];
    // 可选：标记状态
    room.status = room.status || 'running';
  });

  // ===== 买单 =====
  socket.on("submit-buy", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    const username = socket.username || `User-${socket.id.slice(0,4)}`;
    room.buys.push({ username, price: p, time: new Date().toISOString() });

    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({ username, amount: p, time: new Date().toISOString(), side: "buy" });

    // ⭐ 新增：挂单审计（房主真名，参与者半匿名）
    io.__privacy.logAndBroadcast(io, rooms, roomId, {
      type: 'order', actor: username, side: 'buy', price: p
    });
  });

  // ===== 卖单 =====
  socket.on("submit-sell", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    const username = socket.username || `User-${socket.id.slice(0,4)}`;
    room.sells.push({ username, price: p, time: new Date().toISOString() });

    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({ username, amount: p, time: new Date().toISOString(), side: "sell" });

    // ⭐ 新增：挂单审计
    io.__privacy.logAndBroadcast(io, rooms, roomId, {
      type: 'order', actor: username, side: 'sell', price: p
    });
  });

  // ===== 撮合 =====
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

      // ⭐ 新增：成交审计（记录买家视角；需要也可再发一条 seller 视角）
      io.__privacy.logAndBroadcast(io, rooms, roomId, {
        type: 'trade', actor: buy.username, price
      });
      // 可选：再记录卖家视角
      // io.__privacy.logAndBroadcast(io, rooms, roomId, { type: 'trade', actor: sell.username, price });
    }

    // 覆盖盘面
    room.buys = buys;
    room.sells = sells;

    // 保持你原事件名（业务 UI）
    io.to(roomId).emit("double-match", matches);
  });
};
