// auctions/double.js — classroom double auction with order book & teacher submit
// - Mode fixed at room creation: 'cda' (continuous) | 'call' (uniform price)
// - Students auto-assigned Buyer/Seller on join (host excluded)
// - Teacher can start/stop AND submit quotes (choose buy/sell on UI)
// - Order book:
//    * CDA: visible to ALL (students + teacher)
//    * Call: visible to TEACHER ONLY
// - Trades are always broadcast to all

module.exports = (io, socket, rooms) => {
  const now = () => Date.now();
  const nowISO = () => new Date().toISOString();

  // ---------- helpers ----------
  function isHost(room, sock) {
    if (!room || !sock) return false;
    const name = sock.username || `User-${sock.id.slice(0,4)}`;
    return room.owner === name;
  }

  function ensureBook(room) {
    room.double = room.double || {
      mode: 'cda',            // fixed at creation: 'cda' | 'call'
      status: 'waiting'       // 'waiting' | 'running' | 'paused'
    };
    room.buys   = room.buys   || []; // { id, username, price, ts }
    room.sells  = room.sells  || []; // { id, username, price, ts }
    room.trades = room.trades || []; // { buyer, seller, price, time }
    room.roles  = room.roles  || {}; // { [username]: 'buy' | 'sell' }
  }

  function sortBooks(room) {
    room.buys.sort((a,b)  => b.price - a.price || a.ts - b.ts); // higher first, earlier first
    room.sells.sort((a,b) => a.price - b.price || a.ts - b.ts); // lower first, earlier first
  }

  function emitState(roomId) {
    const room = rooms[roomId]; if (!room) return;
    const s = {
      mode: room.double.mode,
      status: room.double.status
    };
    io.to(roomId).emit('double-state', s);
  }

  function recordOrder(io, rooms, roomId, username, side, price) {
    const room = rooms[roomId];
    room.bidHistory = room.bidHistory || [];
    room.bidHistory.push({ username, amount: price, time: nowISO(), side });
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'order', actor: username, side, price });
  }

  // Auto-assign Buyer/Seller to students (host excluded)
  function autoAssignRole(room, username) {
    if (room.owner === username) return null; // do not assign host
    if (room.roles[username]) return room.roles[username];
    const buyers = Object.values(room.roles).filter(x => x === 'buy').length;
    const sellers = Object.values(room.roles).filter(x => x === 'sell').length;
    const side = buyers <= sellers ? 'buy' : 'sell';
    room.roles[username] = side;
    return side;
  }

  // --- NEW: broadcast order book (visibility depends on mode) ---
  function broadcastBook(roomId) {
    const room = rooms[roomId]; if (!room) return;
    sortBooks(room);
    const payload = {
      buys: room.buys.map(o => ({ price: o.price, name: o.username, time: new Date(o.ts).toISOString() })),
      sells: room.sells.map(o => ({ price: o.price, name: o.username, time: new Date(o.ts).toISOString() }))
    };
    if ((room.double.mode || 'cda') === 'cda') {
      io.to(roomId).emit('double-book', payload);                // CDA: everyone sees
    } else {
      io.to(`host:${roomId}`).emit('double-book', payload);      // Call: teacher-only
    }
  }

  // CDA: trade at resting order price
  function matchCDA(roomId) {
    const room = rooms[roomId]; if (!room) return;
    sortBooks(room);
    const trades = [];

    while (room.buys.length && room.sells.length && room.buys[0].price >= room.sells[0].price) {
      const B = room.buys[0], S = room.sells[0];

      let price, buyer, seller;
      if (B.ts >= S.ts) { // buyer hits resting ask -> trade at ask
        price = S.price; buyer = B.username; seller = S.username;
      } else {           // seller hits resting bid -> trade at bid
        price = B.price; buyer = B.username; seller = S.username;
      }

      room.buys.shift(); room.sells.shift();

      const trade = { buyer, seller, price, time: nowISO() };
      trades.push(trade);
      room.trades.push(trade);
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'trade', actor: buyer, price });
    }

    if (trades.length) io.to(roomId).emit('double-match', trades);

    // update book after matching
    broadcastBook(roomId);
  }

  // Call: uniform-price clearing at stop
  function clearCall(roomId) {
    const room = rooms[roomId]; if (!room) return;
    sortBooks(room);
    const B = room.buys.slice();
    const S = room.sells.slice();

    let k = 0;
    while (k < B.length && k < S.length && B[k].price >= S[k].price) k++;
    if (k === 0) {
      io.to(roomId).emit('double-match', []);
      // nothing traded, but still broadcast current book to teacher
      broadcastBook(roomId);
      return;
    }

    const clearing = S[k-1].price;
    const trades = [];
    for (let i=0; i<k; i++) {
      const t = { buyer: B[i].username, seller: S[i].username, price: clearing, time: nowISO() };
      room.trades.push(t);
      trades.push(t);
      io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'trade', actor: B[i].username, price: clearing });
    }

    const bSet = new Set(B.slice(0,k).map(o => o.id));
    const sSet = new Set(S.slice(0,k).map(o => o.id));
    room.buys  = room.buys.filter(o => !bSet.has(o.id));
    room.sells = room.sells.filter(o => !sSet.has(o.id));

    io.to(roomId).emit('double-match', trades);

    // update book after clearing
    broadcastBook(roomId);
  }

  // ---------- events ----------
  socket.on('join-double', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || (room.type || '').toLowerCase() !== 'double') return;

    ensureBook(room);
    socket.join(roomId);

    const uname = socket.username || `User-${socket.id.slice(0,4)}`;
    const side = autoAssignRole(room, uname);
    if (side) io.to(socket.id).emit('double-side', { side });

    // host 频道加入（server.js 已在 join-room 时处理；这里不重复）

    emitState(roomId);

    // 推送当前订单簿（CDA: 所有人；Call: 老师）
    broadcastBook(roomId);
  });

  // buy
  socket.on('submit-buy', ({ roomId, price }) => {
    const room = rooms[roomId]; if (!room || (room.type||'').toLowerCase() !== 'double') return;
    ensureBook(room);
    if (room.double.status !== 'running') { io.to(socket.id).emit('bid-rejected',{reason:'NOT_RUNNING'}); return; }

    const uname = socket.username || `User-${socket.id.slice(0,4)}`;
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    // host 可提交，不受角色限制；学生需 buy 角色
    if (!isHost(room, socket)) {
      if ((room.roles?.[uname] || null) !== 'buy') {
        return io.to(socket.id).emit('bid-rejected', { reason: (room.roles?.[uname] ? 'SIDE_MISMATCH' : 'NO_SIDE') });
      }
    }

    const cap = room.balances?.[uname];
    if (cap != null && p > cap) return io.to(socket.id).emit('bid-rejected', { reason: 'OVER_BUDGET', cap });

    room.buys.push({ id:`b_${Date.now()}_${Math.random()}`, username: uname, price: p, ts: now() });
    recordOrder(io, rooms, roomId, uname, 'buy', p);

    // 广播订单簿
    broadcastBook(roomId);

    if (room.double.mode === 'cda') matchCDA(roomId);
  });

  // sell
  socket.on('submit-sell', ({ roomId, price }) => {
    const room = rooms[roomId]; if (!room || (room.type||'').toLowerCase() !== 'double') return;
    ensureBook(room);
    if (room.double.status !== 'running') { io.to(socket.id).emit('bid-rejected',{reason:'NOT_RUNNING'}); return; }

    const uname = socket.username || `User-${socket.id.slice(0,4)}`;
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    // host 可提交，不受角色限制；学生需 sell 角色
    if (!isHost(room, socket)) {
      if ((room.roles?.[uname] || null) !== 'sell') {
        return io.to(socket.id).emit('bid-rejected', { reason: (room.roles?.[uname] ? 'SIDE_MISMATCH' : 'NO_SIDE') });
      }
    }

    const cap = room.balances?.[uname];
    if (cap != null && p > cap) return io.to(socket.id).emit('bid-rejected', { reason: 'OVER_BUDGET', cap });

    room.sells.push({ id:`s_${Date.now()}_${Math.random()}`, username: uname, price: p, ts: now() });
    recordOrder(io, rooms, roomId, uname, 'sell', p);

    // 广播订单簿
    broadcastBook(roomId);

    if (room.double.mode === 'cda') matchCDA(roomId);
  });

  // teacher-only: start/stop
  socket.on('double-start', ({ roomId }) => {
    const room = rooms[roomId]; if (!room || (room.type||'').toLowerCase() !== 'double') return;
    if (!isHost(room, socket)) return;
    ensureBook(room);
    room.double.status = 'running';
    emitState(roomId);
    broadcastBook(roomId);
  });

  socket.on('double-stop', ({ roomId }) => {
    const room = rooms[roomId]; if (!room || (room.type||'').toLowerCase() !== 'double') return;
    if (!isHost(room, socket)) return;
    ensureBook(room);

    // stop & (if call) clear now
    if (room.double.mode === 'call') clearCall(roomId);
    room.double.status = 'paused';
    emitState(roomId);
    broadcastBook(roomId);
  });
};
