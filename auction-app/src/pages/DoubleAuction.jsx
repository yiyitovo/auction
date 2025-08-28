// src/pages/DoubleAuction.jsx — CDA/Call, side choose, order visibility, teacher controls
import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

export default function DoubleAuction() {
  const { id: roomId } = useParams();

  const [username, setUsername] = useState('');
  const [myCap, setMyCap] = useState(null);

  const [side, setSide] = useState(null);      // 'buy' | 'sell' | null
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');

  const [isHost, setIsHost] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  const [state, setState] = useState({
    mode: 'cda', showOrders: false, roundSec: 120,
    status: 'waiting', timeLeftSec: 0,
    bestBid: null, bestAsk: null, bidCount: 0, askCount: 0
  });
  const [orders, setOrders] = useState({ buys: [], sells: [] }); // {price,name,time}[]
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);
    setIsTeacher((localStorage.getItem('role') || '') === 'teacher');

    const onRoomInfo = ({ isHost }) => setIsHost(!!isHost);
    const onBudgetMine = ({ cap }) => setMyCap(cap);
    const onSide = ({ side }) => setSide(side || null);
    const onState = (s) => setState(prev => ({ ...prev, ...s }));
    const onBest = (q) => setState(prev => ({ ...prev, ...q }));
    const onOrders = (book) => setOrders(book || { buys: [], sells: [] });
    const onMatch = (list) => setMatches(m => [...m, ...(list || [])]);
    const onRejected = ({ reason, cap }) => {
      const map = {
        OVER_BUDGET: `Price exceeds your cap: ${cap}`,
        NO_SIDE: 'Please choose Buyer or Seller first.',
        SIDE_MISMATCH: 'You submitted on the opposite side.',
        NOT_RUNNING: 'Round not running yet.',
      };
      alert(map[reason] || 'Rejected');
    };

    socket.on('room-info', onRoomInfo);
    socket.on('your-budget', onBudgetMine);
    socket.on('double-side', onSide);
    socket.on('double-side-set', onSide);
    socket.on('double-state', onState);
    socket.on('best-quote', onBest);
    socket.on('order', onOrders);
    socket.on('double-match', onMatch);
    socket.on('bid-rejected', onRejected);
    socket.on('round-tick', ({ timeLeftSec }) => setState(prev => ({ ...prev, timeLeftSec })));

    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-double', { roomId });

    return () => {
      socket.off('room-info', onRoomInfo);
      socket.off('your-budget', onBudgetMine);
      socket.off('double-side', onSide);
      socket.off('double-side-set', onSide);
      socket.off('double-state', onState);
      socket.off('best-quote', onBest);
      socket.off('order', onOrders);
      socket.off('double-match', onMatch);
      socket.off('bid-rejected', onRejected);
      socket.off('round-tick');
    };
  }, [roomId]);

  const canControl = isTeacher && isHost;

  const chooseSide = (s) => {
    setSide(s);
    socket.emit('double-set-side', { roomId, side: s });
  };

  const submitBuy = () => {
    const p = Number(buyPrice);
    if (!Number.isFinite(p) || p <= 0) return;
    socket.emit('submit-buy', { roomId, price: p });
    setBuyPrice('');
  };
  const submitSell = () => {
    const p = Number(sellPrice);
    if (!Number.isFinite(p) || p <= 0) return;
    socket.emit('submit-sell', { roomId, price: p });
    setSellPrice('');
  };

  // teacher controls
  const [modeCtl, setModeCtl] = useState('cda');
  const [showOrdersCtl, setShowOrdersCtl] = useState(false);
  const [roundSecCtl, setRoundSecCtl] = useState(120);

  useEffect(() => {
    // 初次同步面板
    setModeCtl(state.mode);
    setShowOrdersCtl(state.showOrders);
    setRoundSecCtl(state.roundSec);
  }, [state.mode, state.showOrders, state.roundSec]);

  const applyConfig = () => {
    socket.emit('double-config', {
      roomId, mode: modeCtl, showOrders: showOrdersCtl, roundSec: Number(roundSecCtl) || 120
    });
  };
  const startRound = () => socket.emit('double-start', { roomId });
  const stopRound  = () => socket.emit('double-stop', { roomId });
  const clearNow   = () => socket.emit('double-clear', { roomId });
  const resetBooks = () => socket.emit('double-reset-books', { roomId });

  const disabledTrading = state.status !== 'running';

  return (
    <div style={{ maxWidth: 900, margin: '16px auto', padding: 8 }}>
      <h2>Double Auction ({state.mode === 'cda' ? 'Continuous' : 'Call / Uniform Price'})</h2>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <span><b>User:</b> {username}</span>
        <span><b>My Cap:</b> {myCap ?? '—'}</span>
        <span><b>Status:</b> {state.status}</span>
        <span><b>Time Left:</b> {state.timeLeftSec ?? 0}s</span>
        <span><b>Best Bid:</b> {state.bestBid ?? '—'}</span>
        <span><b>Best Ask:</b> {state.bestAsk ?? '—'}</span>
      </div>

      {/* Guidance */}
      <div style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, marginBottom: 12 }}>
        <b>How this market works:</b>{' '}
        {state.mode === 'cda'
          ? <>Continuous Double Auction (CDA): buyers and sellers submit quotes anytime. Orders match by <i>price–time priority</i>.
             A trade executes at the <i>resting</i> order&apos;s price. Everyone can see Best Bid/Ask in real time.</>
          : <>Call / Uniform-Price Auction: quotes are collected during the round. At the end (or when the teacher clicks <i>Clear</i>),
             all feasible trades execute at a single <i>uniform price</i>.</>}
        <br />
        <b>Your role:</b> pick <i>Buyer</i> or <i>Seller</i> first, then submit your quote. Your quote cannot exceed your <i>My Cap</i>.
      </div>

      {/* role choose */}
      <div style={{ display: 'flex', gap: 16, margin: '10px 0' }}>
        <label><input type="radio" name="side" checked={side==='buy'}  onChange={()=>chooseSide('buy')}  /> Buyer</label>
        <label><input type="radio" name="side" checked={side==='sell'} onChange={()=>chooseSide('sell')} /> Seller</label>
      </div>

      {/* only show the selected side's inputs */}
      {side === 'buy' && (
        <div style={{ marginBottom: 8 }}>
          <input
            type="number"
            value={buyPrice}
            onChange={(e)=>setBuyPrice(e.target.value)}
            placeholder="Buy price"
            style={{ width: '100%', padding: 8, marginBottom: 8 }}
            disabled={disabledTrading}
          />
          <button onClick={submitBuy} style={{ width: '100%', padding: 10 }} disabled={disabledTrading}>Submit Buy</button>
        </div>
      )}
      {side === 'sell' && (
        <div style={{ marginBottom: 8 }}>
          <input
            type="number"
            value={sellPrice}
            onChange={(e)=>setSellPrice(e.target.value)}
            placeholder="Sell price"
            style={{ width: '100%', padding: 8, marginBottom: 8 }}
            disabled={disabledTrading}
          />
          <button onClick={submitSell} style={{ width: '100%', padding: 10 }} disabled={disabledTrading}>Submit Sell</button>
        </div>
      )}

      {/* teacher controls */}
      {isTeacher && isHost && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginTop: 8 }}>
          <h4>Teacher Controls</h4>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
            <b>Mode</b>: <i>CDA</i> matches continuously at resting order price. <i>Call</i> collects quotes and clears to a uniform price at the end.<br/>
            <b>Show Orders</b>: whether students can see the live order book (names, prices, times). Everyone always sees Best Bid/Ask.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr', gap: 12, alignItems: 'center' }}>
            <div>
              <label>
                <input type="radio" name="mode" checked={modeCtl==='cda'} onChange={()=>setModeCtl('cda')} /> CDA
              </label>
              &nbsp;&nbsp;
              <label>
                <input type="radio" name="mode" checked={modeCtl==='call'} onChange={()=>setModeCtl('call')} /> Call
              </label>
            </div>
            <label>
              <input type="checkbox" checked={showOrdersCtl} onChange={(e)=>setShowOrdersCtl(e.target.checked)} />
              &nbsp; Show Orders to Students
            </label>
            <div>
              <input type="number" value={roundSecCtl} onChange={(e)=>setRoundSecCtl(e.target.value)} style={{ width: 110, padding: 6 }} />
              <div style={{ fontSize: 12, color: '#666' }}>Round length (sec)</div>
            </div>
            <div>
              <button onClick={applyConfig} style={{ padding: '8px 12px', marginRight: 8 }}>Apply</button>
              <button onClick={startRound}  style={{ padding: '8px 12px', marginRight: 8 }}>Start</button>
              <button onClick={stopRound}   style={{ padding: '8px 12px', marginRight: 8 }}>Pause</button>
              <button onClick={clearNow}    style={{ padding: '8px 12px', marginRight: 8 }}>
                {state.mode === 'call' ? 'Clear (Call)' : 'Sweep (CDA)'}
              </button>
              <button onClick={resetBooks}  style={{ padding: '8px 12px' }}>Reset Books</button>
            </div>
          </div>
        </div>
      )}

      {/* order book (host always; students only if showOrders=true) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
        <div>
          <h4>Buy Orders</h4>
          {orders.buys.length === 0 ? <div style={{ color: '#888' }}>—</div> : orders.buys.map((o, i) => (
            <div key={`b-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, borderBottom: '1px solid #eee', padding: '4px 0' }}>
              <span>{o.price}</span>
              <span>{o.name}</span>
              <span style={{ color: '#888' }}>{new Date(o.time).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
        <div>
          <h4>Sell Orders</h4>
          {orders.sells.length === 0 ? <div style={{ color: '#888' }}>—</div> : orders.sells.map((o, i) => (
            <div key={`s-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, borderBottom: '1px solid #eee', padding: '4px 0' }}>
              <span>{o.price}</span>
              <span>{o.name}</span>
              <span style={{ color: '#888' }}>{new Date(o.time).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* trades */}
      <div style={{ marginTop: 16 }}>
        <h4>Trades</h4>
        {matches.length === 0 ? <div style={{ color: '#888' }}>No trades yet.</div> : matches.map((t, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, borderBottom: '1px solid #eee', padding: '4px 0' }}>
            <span>{t.price}</span>
            <span>{t.buyer}</span>
            <span>{t.seller}</span>
            <span style={{ color: '#888' }}>{new Date(t.time).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
