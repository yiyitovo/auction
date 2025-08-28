// src/pages/DoubleAuction.jsx — auto role, fixed mode, teacher only start/stop
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const BACKEND_URL = 'https://auction-backend-k44x.onrender.com';
const socket = io(BACKEND_URL);

export default function DoubleAuction() {
  const { id: roomId } = useParams();

  const [username, setUsername] = useState('');
  const [myCap, setMyCap] = useState(null);
  const [role, setRole] = useState(null); // 'buy' | 'sell'
  const [mode, setMode] = useState('cda'); // 'cda' | 'call'
  const [status, setStatus] = useState('waiting');
  const [isHost, setIsHost] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  const [price, setPrice] = useState('');
  const [trades, setTrades] = useState([]);

  useEffect(() => {
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);
    setIsTeacher((localStorage.getItem('role') || '') === 'teacher');

    const onRoomInfo   = ({ isHost }) => setIsHost(!!isHost);
    const onBudgetMine = ({ cap }) => setMyCap(cap);
    const onSide       = ({ side }) => setRole(side || null);
    const onState      = (s) => { if (s.mode) setMode(s.mode); if (s.status) setStatus(s.status); };
    const onTrades     = (list) => setTrades(t => [...t, ...(list || [])]);
    const onRejected   = ({ reason, cap }) => {
      const map = {
        OVER_BUDGET: `Price exceeds your cap: ${cap}`,
        NO_SIDE: 'Role not assigned.',
        SIDE_MISMATCH: 'Your role does not match this action.',
        NOT_RUNNING: 'The round has not started yet.',
      };
      alert(map[reason] || 'Rejected.');
    };

    socket.on('room-info', onRoomInfo);
    socket.on('your-budget', onBudgetMine);
    socket.on('double-side', onSide);
    socket.on('double-state', onState);
    socket.on('double-match', onTrades);
    socket.on('bid-rejected', onRejected);

    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-double', { roomId });

    return () => {
      socket.off('room-info', onRoomInfo);
      socket.off('your-budget', onBudgetMine);
      socket.off('double-side', onSide);
      socket.off('double-state', onState);
      socket.off('double-match', onTrades);
      socket.off('bid-rejected', onRejected);
    };
  }, [roomId]);

  const submit = () => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;
    if (role === 'buy') socket.emit('submit-buy', { roomId, price: p });
    if (role === 'sell') socket.emit('submit-sell', { roomId, price: p });
    setPrice('');
  };

  const start = () => socket.emit('double-start', { roomId });
  const stop  = () => socket.emit('double-stop',  { roomId });

  const isTeacherHost = isTeacher && isHost;

  return (
    <div style={{ maxWidth: 820, margin: '16px auto' }}>
      <h2>Double Auction</h2>

      {/* Guidance like sealed page */}
      <div style={{ background:'#e8f3ff', border:'1px solid #cfe3ff', borderRadius:6, padding:12, marginBottom:12 }}>
        <b>How it works (Students):</b>{' '}
        {mode === 'cda' ? (
          <>This is a <b>Continuous Double Auction</b>. You are automatically assigned as a
          <b> Buyer</b> or <b>Seller</b>. Submit your quote at any time; the market matches by
          <i> price–time priority</i>, and trades execute at the <i>resting</i> order&apos;s price.</>
        ) : (
          <>This is a <b>Call  Double Auction</b>. Quotes are collected while the
          round is running. When the teacher clicks <i>Stop</i>, all feasible trades clear at a
          single <i>uniform price</i>.</>
        )}
        <ul style={{ margin:'6px 0 0 18px' }}>
          <li><b>My Cap</b> is your personal budget ceiling — your quote cannot exceed it.</li>
          <li>Your role is <b>{role ? role.toUpperCase() : 'assigning...'}</b>. Enter a {role === 'sell' ? 'sell (ask)' : 'buy (bid)'} price and submit.</li>
          <li>Status: <b>{status}</b> {status==='waiting' && '(waiting for teacher to start)'}</li>
        </ul>
      </div>

      <p>
        <b>User:</b> {username} &nbsp; | &nbsp;
        <b>Role:</b> {role ? role.toUpperCase() : '—'} &nbsp; | &nbsp;
        <b>My Cap:</b> {myCap ?? '—'} &nbsp; | &nbsp;
        <b>Mode:</b> {mode === 'cda' ? 'CDA ' : 'Call '}
      </p>

      {/* Single input based on role */}
      <div style={{ display:'flex', gap:8, margin:'8px 0' }}>
        <input
          type="number"
          placeholder={role === 'sell' ? 'Enter your ask' : 'Enter your bid '}
          value={price}
          onChange={(e)=>setPrice(e.target.value)}
          style={{ flex:1, padding:8 }}
          disabled={status !== 'running' || !role}
        />
        <button
          onClick={submit}
          disabled={status !== 'running' || !role}
          style={{ padding:'8px 16px' }}
        >
          {role === 'sell' ? 'SUBMIT SELL' : 'SUBMIT BUY'}
        </button>
      </div>

      {/* Teacher-only controls */}
      {isTeacherHost && (
        <div style={{ border:'1px solid #eaeaea', borderRadius:6, padding:12, marginTop:8 }}>
          <div style={{ fontWeight:600, marginBottom:6 }}>Teacher Controls</div>
          <div style={{ fontSize:13, color:'#555', marginBottom:8 }}>
            Press <b>Start</b> to open the round. Press <b>Stop</b> to pause the market.
            In <i>Call</i> mode, stopping will clear the market to a uniform price.
          </div>
          <button onClick={start} style={{ marginRight:8, padding:'8px 12px' }}>Start</button>
          <button onClick={stop}  style={{ padding:'8px 12px' }}>Stop</button>
        </div>
      )}

      {/* Trades */}
      <div style={{ marginTop:16 }}>
        <h4>Trades</h4>
        {trades.length === 0 ? (
          <div style={{ color:'#777' }}>No trades yet.</div>
        ) : trades.map((t, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, borderBottom:'1px solid #eee', padding:'4px 0' }}>
            <span>{t.price}</span>
            <span>{t.buyer}</span>
            <span>{t.seller}</span>
            <span style={{ color:'#888' }}>{new Date(t.time).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
