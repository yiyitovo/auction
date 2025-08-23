// auctions/double.js
// 支持：教师配置 integrated/dynamic 模式 + 是否公开实时订单（showOrders）
// 普通用户必须先选择 Buyer/Seller 才能下单；非房主看不到 Match 按钮（由前端控制）

module.exports = (io, socket, rooms) => {
  const nowISO = () => new Date().toISOString();

  // ===== 工具 =====
  function isHost(room, username) {
    return !!room && !!username && room.owner === username;
  }

  function ensureBook(room) {
    room.double = room.double || { mode: 'integrated', showOrders: false }; // 默认：集中清算 + 不公开订单
    room.buys   = room.buys   || [];
    room.sells  = room.sells  || [];
    room.trades = room.trades || [];
    room.roles  = room.roles  || {}; // { [username]: 'buy' | 'sell' }
    room.status = room.status || 'running';
  }

  function sortBooks(room) {
    // 价优先 + 时间优先（ts 越小=越早）
    room.buys.sort((a,b)=> b.price - a.price || a.ts - b.ts);
    room.sells.sort((a,b)=> a.price - b.price || a.ts - b.ts);
  }

  // 仅把审计事件发给 Host（老师）
  function hostOnlyAudit(io, rooms, roomId, evt) {
    const room = rooms[roomId]; if (!room) return;
    const e = { ts: Date.now(), ...evt };
    room.activity = room.activity || [];
    room.activity.push(e);
    if (room.activity.length > 5000) room.activity.shift();
    // 只发给 host 视图
    const hostView = io.__privacy?.viewFor
      ? io.__privacy.viewFor(room, e, 'host')
      : e;
    io.to(`host:${roomId}`).emit('audit', hostView);
  }

  // 根据 showOrders 决定是否给参与者广播订单
  function broadcastOrder(io, rooms, roomId, username, side, price) {
    const room = rooms[roomId]; if (!room) return;
    const evt = { type: 'order', actor: username, side, price };

    // 永远记录（activity）
    // 若不想写两遍，可复用 logAndBroadcast 再补一次 host-only，但为了“学生不可见”这里手动分流
    if (room.double?.showOrders) {
      // 正常：参与者 + 老师（按隐私策略掩码/实名）
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, evt);
    } else {
      // 隐藏：只发老师，不发参与者
      hostOnlyAudit(io, rooms, roomId, evt);
    }
  }

  // ===== 事件 =====
  socket.on("join-double", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;
    socket.join(roomId);
    ensureBook(room);

    // 告知当前配置（前端据此隐藏/显示 Match + 订单可见性说明）
    io.to(socket.id).emit('double-config', {
      mode: room.double.mode,
      showOrders: !!room.double.showOrders
    });

    // 如果该用户之前选过买/卖，恢复给他
    const uname = socket.username || `User-${socket.id.slice(0,4)}`;
    const side = room.roles[uname];
    if (side) io.to(socket.id).emit('double-side', { side });
  });

  // 教师配置：切换模式 + 切换是否公开订单
  socket.on("double-set-config", ({ roomId, mode, showOrders }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;
    if (!isHost(room, socket.username)) return; // 仅房主

    ensureBook(room);
    const m = String(mode || room.double.mode || 'integrated').toLowerCase();
    room.double.mode = (m === 'dynamic') ? 'dynamic' : 'integrated';
    room.double.showOrders = !!showOrders;

    // 广播最新配置
    io.to(roomId).emit('double-config', {
      mode: room.double.mode,
      showOrders: room.double.showOrders
    });
  });

  // 角色二选一
  socket.on("double-set-side", ({ roomId, side }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;
    const s = String(side || '').toLowerCase();
    if (s !== 'buy' && s !== 'sell') return;

    const uname = socket.username || `User-${socket.id.slice(0,4)}`;
    ensureBook(room);
    room.roles[uname] = s;
    socket.emit('double-side-set', { side: s });
  });

  // 记录订单 +（按需）广播
  function recordOrder(io, rooms, roomId, username, side, price) {
    const room = rooms[roomId];
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({ username, amount: price, time: nowISO(), side });
    broadcastOrder(io, rooms, roomId, username, side, price);
  }

  // 连续撮合（dynamic）：成交价 = 卖方挂单价（非折中）
  function tryMatchDynamic(io, rooms, roomId) {
    const room = rooms[roomId]; if (!room) return;
    ensureBook(room); sortBooks(room);

    const trades = [];
    while (room.buys.length && room.sells.length && room.buys[0].price >= room.sells[0].price) {
      const buy  = room.buys.shift();
      const sell = room.sells.shift();
      const price = sell.price; // 非折中价
      room.trades.push({ buyer: buy.username, seller: sell.username, price, time: nowISO() });
      trades.push({ buyer: buy.username, seller: sell.username, price });
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'trade', actor: buy.username, price });
    }
    if (trades.length) io.to(roomId).emit("double-match", trades);
  }

  // 集中清算（integrated）：统一价 = 第 K 个成交的卖价（按价优时序对齐）
  function runIntegratedClear(io, rooms, roomId) {
    const room = rooms[roomId]; if (!room) return;
    ensureBook(room); sortBooks(room);

    const B = room.buys.slice();
    const S = room.sells.slice();
    let k = 0;
    while (k < B.length && k < S.length && B[k].price >= S[k].price) k++;
    if (k === 0) { io.to(roomId).emit("double-match", []); return; }

    const clearing = S[k-1].price;
    const matches = [];
    for (let i = 0; i < k; i++) {
      const buy=B[i], sell=S[i];
      room.trades.push({ buyer: buy.username, seller: sell.username, price: clearing, time: nowISO() });
      matches.push({ buyer: buy.username, seller: sell.username, price: clearing });
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'trade', actor: buy.username, price: clearing });
    }
    // 从原订单簿移除已成交
    const buyIds  = new Set(B.slice(0,k).map(x=>x._id));
    const sellIds = new Set(S.slice(0,k).map(x=>x._id));
    room.buys  = room.buys.filter(x => !buyIds.has(x._id));
    room.sells = room.sells.filter(x => !sellIds.has(x._id));

    io.to(roomId).emit("double-match", matches);
  }

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

    // cap 硬校验
    const cap = room.balances?.[uname];
    if (cap != null && p > cap) return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });

    ensureBook(room);
    room.buys.push({ _id:`b_${Date.now()}_${Math.random()}`, username: uname, price: p, ts: Date.now() });
    recordOrder(io, rooms, roomId, uname, 'buy', p);

    if ((room.double?.mode || 'integrated') === 'dynamic') tryMatchDynamic(io, rooms, roomId);
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

    const cap = room.balances?.[uname];
    if (cap != null && p > cap) return socket.emit('bid-rejected', { reason: 'OVER_BUDGET', cap });

    ensureBook(room);
    room.sells.push({ _id:`s_${Date.now()}_${Math.random()}`, username: uname, price: p, ts: Date.now() });
    recordOrder(io, rooms, roomId, uname, 'sell', p);

    if ((room.double?.mode || 'integrated') === 'dynamic') tryMatchDynamic(io, rooms, roomId);
  });

  // 教师按下 Match（integrated 才会进行“清算”；dynamic 下相当于“扫一次”）
  socket.on("match-double", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== "double") return;
    if (!isHost(room, socket.username)) return;

    if ((room.double?.mode || 'integrated') === 'dynamic') {
      tryMatchDynamic(io, rooms, roomId);
    } else {
      runIntegratedClear(io, rooms, roomId);
    }
  });
};
