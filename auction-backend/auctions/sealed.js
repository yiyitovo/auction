// auctions/sealed.js — v2025-08-29 with Online & Submitted stats
module.exports = (io, socket, rooms) => {
  // ========== 工具 ==========
  function isSocketHost(sock, room, roomId) {
    const hostRoom = `host:${roomId}`;
    const name = sock.username || `User-${sock.id.slice(0,4)}`;
    return (
      (typeof sock.rooms?.has === 'function' && sock.rooms.has(hostRoom)) ||
      (room && (room.owner === name || room.ownerUsername === name))
    );
  }

  function ensureCfg(room) {
    room.sealedCfg = room.sealedCfg || { pricing: 'first' }; // 'first' | 'second'
    return room.sealedCfg;
  }

  // 仅教师端广播订单列表
  function sendOrdersToHost(io, rooms, roomId) {
    const room = rooms[roomId]; if (!room) return;
    const list = (room.bids || []).map(b => ({
      price: b.amount,
      name:  b.username,
      time:  b.time
    }));
    io.to(`host:${roomId}`).emit('order', list);
  }

  // ★ 新增：广播“完成出价人数”（以唯一用户名计数）
  function broadcastSealedStats(io, rooms, roomId) {
    const room = rooms[roomId]; if (!room) return;
    const submitted = new Set((room.bids || []).map(b => b.username)).size;
    io.to(roomId).emit('sealed:stats', { submitted });
    io.to(`host:${roomId}`).emit('sealed:stats', { submitted });
  }

  // ========== 事件 ==========
  socket.on("join-sealed", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;
    socket.join(roomId);

    if (!room.status || room.status === 'waiting') room.status = 'collecting';
    ensureCfg(room);

    // 告知当前状态（用于前端显示 first/second）
    socket.emit('sealed-state', { status: room.status, pricing: room.sealedCfg.pricing });

    // 教师端刚进来就推一次订单列表
    if (isSocketHost(socket, room, roomId)) sendOrdersToHost(io, rooms, roomId);

    // ★ 新增：补发当前“完成出价人数”
    broadcastSealedStats(io, rooms, roomId);
  });

  // 供前端自检是否是 host（用于显示“Reveal/配置”）
  socket.on("am-i-host", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    socket.emit("you-are-host", { roomId, isHost: isSocketHost(socket, room, roomId) });
  });

  // 教师设置定价模式（first / second）
  socket.on("sealed-config", ({ roomId, pricing }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;
    if (!isSocketHost(socket, room, roomId)) return socket.emit('forbidden', { action: 'sealed-config', reason: 'HOST_ONLY' });
    const p = String(pricing || '').toLowerCase();
    if (p !== 'first' && p !== 'second') return;
    ensureCfg(room).pricing = p;
    io.to(`host:${roomId}`).emit('sealed-state', { status: room.status, pricing: p });
  });

  // 收集密封标
  socket.on("submit-bid", ({ roomId, amount }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;
    if (room.status === 'ended') return;

    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return;

    const username = socket.username || `User-${socket.id.slice(0,4)}`;

    // ⭐ cap 校验
    const cap = room.balances?.[username];
    if (cap != null && a > cap) {
      return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });
    }

    const now = new Date().toISOString();
    room.bids = room.bids || [];

    // 覆盖该用户的最新出价 & 时间（如果你想禁止多次，改成：若已存在则 return ALREADY_BID）
    const idx = room.bids.findIndex(b => b.username === username);
    if (idx >= 0) room.bids[idx] = { username, amount: a, time: now };
    else room.bids.push({ username, amount: a, time: now });

    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({ username, amount: a, time: now, action: "sealed-submit" });

    // 审计（参与者不泄露数额/身份，策略里已处理）
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'sealed-bid', actor: username, amount: a });

    // 给教师端推实时订单列表
    sendOrdersToHost(io, rooms, roomId);

    // ★ 新增：广播已完成出价人数
    broadcastSealedStats(io, rooms, roomId);

    socket.emit("sealed-submitted", { ok: true });
  });

  // 仅教师可“揭标”
  socket.on("reveal-bids", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "sealed") return;

    if (!isSocketHost(socket, room, roomId)) {
      return socket.emit('forbidden', { action: 'reveal-bids', reason: 'HOST_ONLY' });
    }

    const cfg = ensureCfg(room);

    // 排序：金额降序；同价按时间升序（先到先得）
    const bids = (room.bids || []).slice().sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return new Date(a.time) - new Date(b.time);
    });

    const winner = bids[0] || null;

    // 计算应支付价格：first-price 或 second-price
    let payPrice = null;
    if (winner) {
      if (cfg.pricing === 'second') {
        const second = bids[1];
        payPrice = second ? second.amount : winner.amount;
      } else {
        payPrice = winner.amount;
      }
    }

    room.status = 'reveal';

    if (winner) {
      // 审计（揭标事件）
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'reveal', actor: winner.username, amount: payPrice, pricing: cfg.pricing });

      // 参与端：掩码身份；教师端：实名 + 实付价
      const labelP = io.__privacy?.labelFor ? io.__privacy.labelFor(room, winner.username, 'participant') : winner.username;

      io.to(roomId).emit("auction-ended", { winner: { username: labelP, amount: payPrice, pricing: cfg.pricing } });
      io.to(`host:${roomId}`).emit("auction-ended", { winner: { username: winner.username, amount: payPrice, pricing: cfg.pricing } });
    } else {
      io.to(roomId).emit("auction-ended", { winner: null });
      io.to(`host:${roomId}`).emit("auction-ended", { winner: null });
    }

    room.status = 'ended';
  });
};
