// src/pages/DoubleAuction.jsx
// Double auction (buyer/seller forced), host-only match,
// host can choose integrated/dynamic and toggle public order feed.

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL, { autoConnect: true });

export default function DoubleAuction() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();

  const [username, setUsername]   = useState('');
  const [myCap, setMyCap]         = useState(null);

  const [side, setSide]           = useState(null); // 'buy' | 'sell' | null
  const [buyPrice, setBuyPrice]   = useState('');
  const [sellPrice, setSellPrice] = useState('');

  const [isHost, setIsHost]       = useState(false);

  // 来自后端的配置：撮合模式 + 是否公开订单
  const [mode, setMode]           = useState('integrated'); // 'integrated' | 'dynamic'
  const [showOrders, setShowOrders] = useState(false);       // 学生是否能看到订单 feed

  const [matches, setMatches]     = useState([]);
  const [orders, setOrders]       = useState([]);  // {price, name, time} from audit
  const [trades, setTrades]       = useState([]);  // {price, name?, time} (for显示用，可选)

  const ordersRef = useRef([]);
  const tradesRef = useRef([]);

  const canSubmitBuy  = useMemo(() => side === 'buy'  && Number(buyPrice)  > 0, [side, buyPrice]);
  const canSubmitSell = useMemo(() => side === 'sell' && Number(sellPrice) > 0, [side, sellPrice]);

  useEffect(() => {
    // 准备用户名
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);

    // 事件回调
    const onBudget = ({ cap }) => setMyCap(cap);
    const onRejected = ({ reason, cap }) => {
      if (reason === 'OVER_BUDGET') alert(`Amount exceeds your cap: ${cap}`);
      else if (reason === 'NO_SIDE') alert('Please choose Buyer or Seller first.');
      else if (reason === 'SIDE_MISMATCH') alert('You selected the opposite side. Change your role or submit on the chosen side.');
      else alert('Rejected.');
    };
    const onRoomInfo = ({ isHost }) => setIsHost(!!isHost);

    const onSideSet = ({ side }) => setSide(side || null);
    const onSide    = ({ side }) => setSide(side || null);

    // 老师或后端更新配置时推送：{ mode, showOrders }
    const onDoubleConfig = ({ mode, showOrders }) => {
      if (mode) setMode(String(mode));
      if (typeof showOrders === 'boolean') setShowOrders(showOrders);
    };

    const onMatch = (list) => {
      setMatches(Array.isArray(list) ? list : []);
      // 可选：也塞进 trades 侧边栏
      if (Array.isArray(list)) {
        tradesRef.current = [
          ...list.map(m => ({ price: m.price, who: `${m.buyer}↔${m.seller}`, time: new Date().toISOString() })),
          ...tradesRef.current
        ].slice(0, 200);
        setTrades(tradesRef.current);
      }
    };

    // audit 日志：order / trade
    const onAudit = (evt) => {
      // evt: { ts, type, actor, side, price, ... }
      if (evt?.type === 'order') {
        const row = {
          price: evt.price,
          name:  evt.actor,                         // 参与端可能是掩码；老师端是真名
          time:  new Date(evt.ts || Date.now()).toISOString(),
          side:  evt.side
        };
        ordersRef.current = [row, ...ordersRef.current].slice(0, 200);
        setOrders(ordersRef.current);
      } else if (evt?.type === 'trade') {
        const row = {
          price: evt.price,
          who:   evt.actor,                         // 日志里 actor = 买方（我们只显示价格和时间也可）
          time:  new Date(evt.ts || Date.now()).toISOString()
        };
        tradesRef.current = [row, ...tradesRef.current].slice(0, 200);
        setTrades(tradesRef.current);
      }
    };

    // 绑定监听
    socket.on('your-budget', onBudget);
    socket.on('bid-rejected', onRejected);
    socket.on('room-info', onRoomInfo);
    socket.on('double-side-set', onSideSet);
    socket.on('double-side', onSide);
    socket.on('double-config', onDoubleConfig);
    socket.on('double-match', onMatch);
    socket.on('audit', onAudit);

    // 入房
    socket.emit('join-room',   { roomId, username: name });
    socket.emit('join-double', { roomId });

    return () => {
      socket.off('your-budget', onBudget);
      socket.off('bid-rejected', onRejected);
      socket.off('room-info', onRoomInfo);
      socket.off('double-side-set', onSideSet);
      socket.off('double-side', onSide);
      socket.off('double-config', onDoubleConfig);
      socket.off('double-match', onMatch);
      socket.off('audit', onAudit);
    };
  }, [roomId]);

  // 二选一：告诉后端锁定角色
  const chooseSide = (s) => {
    if (s !== 'buy' && s !== 'sell') return;
    setSide(s);
    socket.emit('double-set-side', { roomId, side: s });
  };

  // 下单
  const handleSubmitBuy = () => {
    const p = Number(buyPrice);
    if (!Number.isFinite(p) || p <= 0) return;
    if (side !== 'buy') { alert('Please choose Buyer first.'); return; }
    socket.emit('submit-buy', { roomId, price: p });
    setBuyPrice('');
  };
  const handleSubmitSell = () => {
    const p = Number(sellPrice);
    if (!Number.isFinite(p) || p <= 0) return;
    if (side !== 'sell') { alert('Please choose Seller first.'); return; }
    socket.emit('submit-sell', { roomId, price: p });
    setSellPrice('');
  };

  // 撮合（老师端专用；dynamic 下相当于“扫一次”）
  const handleMatch = () => socket.emit('match-double', { roomId });

  // 老师端修改配置：mode / showOrders
  const handleApplyConfig = () => {
    // 需要后端实现对应的 handler：
    // socket.on("double-set-config", ({roomId, mode, showOrders}) => { room.double.mode=...; room.double.showOrders=...; io.to(roomId).emit("double-config", {...}); })
    socket.emit('double-set-config', {
      roomId,
      mode,
      showOrders: !!showOrders
    });
  };

  // 退出房间→大厅
  const handleExit = () => {
    socket.emit('leave-room');
    navigate('/');
  };

  // 右侧是否展示 order feed（老师总能看；学生看 showOrders）
  const canSeeOrders = isHost || showOrders;

  return (
    <div style={{ maxWidth: 980, margin: '16px auto', display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
      <div>
        {/* 顶栏 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>Double Auction</h2>
          <button onClick={handleExit} style={{ padding: '8px 12px' }}>Exit</button>
        </div>

        <p style={{ margin: '6px 0' }}>
          <b>User:</b> {username} &nbsp;&nbsp;
          <b>My Cap:</b> {myCap ?? '—'} &nbsp;&nbsp;
          <b>Mode:</b> {mode === 'dynamic' ? 'Dynamic (continuous)' : 'Integrated (clearing)'}
        </p>

        {/* 角色二选一（强制） */}
        <div style={{ display: 'flex', gap: 16, margin: '12px 0' }}>
          <label style={{ cursor: 'pointer' }}>
            <input type="radio" name="side" checked={side === 'buy'} onChange={() => chooseSide('buy')} /> Buyer
          </label>
          <label style={{ cursor: 'pointer' }}>
            <input type="radio" name="side" checked={side === 'sell'} onChange={() => chooseSide('sell')} /> Seller
          </label>
        </div>

        {/* 只显示所选一侧的输入与按钮 */}
        {side === 'buy' && (
          <div style={{ marginTop: 8 }}>
            <input
              type="number"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              placeholder="Buy Price"
              style={{ width: '100%', padding: 8, marginBottom: 8 }}
            />
            <button
              onClick={handleSubmitBuy}
              disabled={!canSubmitBuy}
              style={{ width: '100%', padding: 10, opacity: canSubmitBuy ? 1 : 0.6 }}
            >
              Submit Buy
            </button>
          </div>
        )}

        {side === 'sell' && (
          <div style={{ marginTop: 8 }}>
            <input
              type="number"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="Sell Price"
              style={{ width: '100%', padding: 8, marginBottom: 8 }}
            />
            <button
              onClick={handleSubmitSell}
              disabled={!canSubmitSell}
              style={{ width: '100%', padding: 10, opacity: canSubmitSell ? 1 : 0.6 }}
            >
              Submit Sell
            </button>
          </div>
        )}

        {/* 只有教师/房主能看到 Match */}
        {isHost && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={handleMatch} style={{ flex: 1, padding: 10 }}>
              {mode === 'dynamic' ? 'Sweep Now (Dynamic)' : 'Run Clearing (Integrated)'}
            </button>
          </div>
        )}

        {/* 最近成交列表（简单展示） */}
        <div style={{ marginTop: 16 }}>
          <h4 style={{ marginBottom: 8 }}>Latest Trades</h4>
          {trades.length === 0 && <p>No trades yet.</p>}
          {trades.map((t, idx) => (
            <p key={idx} style={{ margin: '6px 0' }}>
              Price: {t.price} <span style={{ color: '#888' }}>({new Date(t.time).toLocaleTimeString()})</span>
            </p>
          ))}
        </div>

        {/* 撮合结果（本轮） */}
        <div style={{ marginTop: 16 }}>
          <h4 style={{ marginBottom: 8 }}>This Run</h4>
          {(matches || []).length === 0 && <p>No trades in this run.</p>}
          {(matches || []).map((m, idx) => (
            <p key={idx} style={{ margin: '6px 0' }}>
              Buyer: {m.buyer}, Seller: {m.seller}, Price: {m.price}
            </p>
          ))}
        </div>
      </div>

      {/* 右侧：订单 Feed（老师总能看；学生取决于 showOrders） */}
      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, height: 'fit-content' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>Order Feed</h3>
          {!isHost && (
            <small style={{ color: '#666' }}>
              {showOrders ? 'Public by teacher' : 'Hidden by teacher'}
            </small>
          )}
        </div>

        {!canSeeOrders ? (
          <p style={{ marginTop: 12, color: '#666' }}>Teacher has hidden orders from students.</p>
        ) : (
          <>
            {orders.length === 0 && <p style={{ marginTop: 8 }}>No orders yet.</p>}
            {orders.slice(0, 50).map((o, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #eee' }}>
                <div>
                  <div><b>{o.side === 'buy' ? 'BUY' : 'SELL'}</b> @ {o.price}</div>
                  <small style={{ color: '#666' }}>{new Date(o.time).toLocaleTimeString()}</small>
                </div>
                <div style={{ marginLeft: 12, textAlign: 'right' }}>
                  <div>{o.name}</div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* 老师的配置面板 */}
        {isHost && (
          <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
            <h4 style={{ margin: 0, marginBottom: 8 }}>Teacher Controls</h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'integrated'}
                  onChange={() => setMode('integrated')}
                />
                Integrated
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === 'dynamic'}
                  onChange={() => setMode('dynamic')}
                />
                Dynamic
              </label>
              <label style={{ gridColumn: '1 / span 2', display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={showOrders}
                  onChange={(e) => setShowOrders(!!e.target.checked)}
                />
                Publicly show real-time orders to students
              </label>
            </div>

            <button onClick={handleApplyConfig} style={{ marginTop: 10, width: '100%', padding: 10 }}>
              Apply Config
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
