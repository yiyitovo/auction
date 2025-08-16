// auctions/double.js
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

  // 教师加入 host 专用房间（前端用 ?host=1 触发）
  socket.on("join-host", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    socket.join(`host:${roomId}`);
    socket.emit("you-are-host", { roomId, isHost: true });
  });

  socket.on("join-double", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    socket.join(roomId);
    room.buys = room.buys || [];     // [{username, price, time}]
    room.sells = room.sells || [];   // [{username, price, time}]
    room.trades = room.trades || []; // 成交明细
    room.roles = room.roles || {};   // { username: 'buy'|'sell' }
    room.status = room.status || 'collecting';
  });

  // 前端查询是否为 host（用于隐藏 Match 按钮）
  socket.on("am-i-host", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const isHost = isSocketHost(socket, room, roomId);
    socket.emit("you-are-host", { roomId, isHost });
  });

  // 选择角色：buy/sell（切换角色会清掉该用户之前的挂单，确保每人仅一侧一个意愿价）
  socket.on("set-role", ({ roomId, role }) => {
    const room = rooms[roomId];
    if (!room || (role !== 'buy' && role !== 'sell')) return;

    const username = socket.username || `User-${socket.id.slice(0,4)}`;
    room.roles = room.roles || {};
    room.roles[username] = role;

    // 清除该用户之前在两侧的订单
    room.buys = (room.buys || []).filter(o => o.username !== username);
    room.sells = (room.sells || []).filter(o => o.username !== username);

    socket.emit("role-updated", { roomId, role });
  });

  // 买方提交意愿价（仅当角色为 buy）
  socket.on("submit-buy", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    const username = socket.username || `User-${socket.id.slice(0,4)}`;
    if ((room.roles?.[username] || '') !== 'buy') {
      return socket.emit('forbidden', { action: 'submit-buy', reason: 'ROLE_MISMATCH' });
    }

    // ⭐ 硬校验 cap（仅买方）
    const cap = room.balances?.[username];
    if (cap != null && p > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    room.buys = room.buys || [];
    const idx = room.buys.findIndex(o => o.username === username);
    const now = new Date().toISOString();
    if (idx >= 0) room.buys[idx] = { username, price: p, time: now };
    else room.buys.push({ username, price: p, time: now });

    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({ username, amount: p, time: now, side: "buy" });

    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'order', actor: username, side: 'buy', price: p });
    socket.emit("order-accepted", { side: 'buy', price: p });
  });

  // 卖方提交意愿价（仅当角色为 sell）
  socket.on("submit-sell", ({ roomId, price }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    const username = socket.username || `User-${socket.id.slice(0,4)}`;
    if ((room.roles?.[username] || '') !== 'sell') {
      return socket.emit('forbidden', { action: 'submit-sell', reason: 'ROLE_MISMATCH' });
    }

    room.sells = room.sells || [];
    const idx = room.sells.findIndex(o => o.username === username);
    const now = new Date().toISOString();
    if (idx >= 0) room.sells[idx] = { username, price: p, time: now };
    else room.sells.push({ username, price: p, time: now });

    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({ username, amount: p, time: now, side: "sell" });

    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'order', actor: username, side: 'sell', price: p });
    socket.emit("order-accepted", { side: 'sell', price: p });
  });

  // 教师端手动撮合（仅 host 可触发）
  // 成交价采用：卖方报价（ask price），不取折中价
  socket.on("match-double", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;

    if (!isSocketHost(socket, room, roomId)) {
      return socket.emit('forbidden', { action: 'match-double', reason: 'HOST_ONLY' });
    }

    const buys = (room.buys || []).slice().sort((a,b) => b.price - a.price || a.time.localeCompare(b.time));
    const sells = (room.sells || []).slice().sort((a,b) => a.price - b.price || a.time.localeCompare(b.time));
    const matches = [];

    while (buys.length && sells.length && buys[0].price >= sells[0].price) {
      const buy = buys.shift();
      const sell = sells.shift();
      const price = sell.price; // ← 成交价 = 卖方报价，不是折中

      const now = new Date().toISOString();
      room.trades.push({ buyer: buy.username, seller: sell.username, price, time: now });
      matches.push({ buyer: buy.username, seller: sell.username, price, time: now });

      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'trade', actor: buy.username, price });
    }

    // 更新剩余挂单（继续等待下次撮合）
    room.buys = buys;
    room.sells = sells;

    // 向参与者端广播匿名结果；向教师端广播真实结果
    const pub = matches.map(m => {
      const roomRef = rooms[roomId];
      const buyerP = io.__privacy?.labelFor ? io.__privacy.labelFor(roomRef, m.buyer, 'participant') : m.buyer;
      const sellerP = io.__privacy?.labelFor ? io.__privacy.labelFor(roomRef, m.seller, 'participant') : m.seller;
      return { buyer: buyerP, seller: sellerP, price: m.price, time: m.time };
    });

    io.to(roomId).emit("double-match", pub);               // 匿名给所有参与者
    io.to(`host:${roomId}`).emit("double-match", matches); // 真实给教师端
  });
};
