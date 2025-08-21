// src/pages/SealedAuction.jsx — v2025-08-17
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function SealedAuction() {
  const { id: roomId } = useParams();
  const [username, setUsername] = useState('');
  const [myCap, setMyCap] = useState(null);
  const [bid, setBid] = useState('');
  const [winner, setWinner] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [pricing, setPricing] = useState('first'); // 'first' | 'second'
  const [orders, setOrders] = useState([]);        // 教师端可见 [{price,name,time}]

  useEffect(() => {
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);

    const onEnd = ({ winner }) => setWinner(winner || null);
    const onBudget = ({ cap }) => setMyCap(cap);
    const onRejected = ({ reason, cap }) => {
      if (reason === 'OVER_BUDGET') alert(`Amount exceeds your cap: ${cap}`);
      else if (reason === 'NOT_STARTED') alert('Not started yet.');
      else alert('Bid rejected');
    };
    const onForbidden = ({ action, reason }) => {
      if (action === 'reveal-bids' && reason === 'HOST_ONLY') alert('Only the teacher (host) can reveal the winner.');
      if (action === 'sealed-config' && reason === 'HOST_ONLY') alert('Only the teacher (host) can set pricing.');
    };
    const onYouAreHost = ({ roomId: rid, isHost }) => { if (rid === roomId) setIsHost(!!isHost); };
    const onState = ({ status, pricing }) => { if (pricing) setPricing(pricing); };
    const onOrders = (list) => { if (Array.isArray(list)) setOrders(list); };

    socket.on('auction-ended', onEnd);
    socket.on('your-budget', onBudget);
    socket.on('bid-rejected', onRejected);
    socket.on('forbidden', onForbidden);
    socket.on('you-are-host', onYouAreHost);
    socket.on('sealed-state', onState);
    socket.on('order', onOrders);             // 仅教师端会收到

    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-sealed', { roomId });

    // 询问自己是不是 host（教师）
    socket.emit('am-i-host', { roomId });

    return () => {
      socket.off('auction-ended', onEnd);
      socket.off('your-budget', onBudget);
      socket.off('bid-rejected', onRejected);
      socket.off('forbidden', onForbidden);
      socket.off('you-are-host', onYouAreHost);
      socket.off('sealed-state', onState);
      socket.off('order', onOrders);
    };
  }, [roomId]);

  const handleSubmitBid = () => {
    const a = parseFloat(bid);
    if (!Number.isFinite(a) || a <= 0) return;
    socket.emit('submit-bid', { roomId, amount: a });
    setBid('');
  };

  const handleReveal = () => {
    socket.emit('reveal-bids', { roomId });
  };

  const handleSetPricing = (p) => {
    setPricing(p);
    socket.emit('sealed-config', { roomId, pricing: p });
  };

  return (
    <div style={{ maxWidth: 760, margin: '16px auto' }}>
      <h2>Sealed Bid Auction</h2>
      <p><b>User:</b> {username}</p>
      <p><b>My Cap:</b> {myCap ?? '—'}</p>

      {/* 教师端：定价模式切换 + 揭标 */}
      {isHost && (
        <div style={{ padding: 10, border: '1px solid #eee', borderRadius: 6, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8 }}>
            <span><b>Pricing:</b></span>
            <label>
              <input type="radio" name="pricing" checked={pricing==='first'} onChange={()=>handleSetPricing('first')} /> First-Price
            </label>
            <label>
              <input type="radio" name="pricing" checked={pricing==='second'} onChange={()=>handleSetPricing('second')} /> Second-Price
            </label>
            <button onClick={handleReveal} style={{ marginLeft: 'auto', padding: '6px 10px' }}>
              Reveal Winner (Host)
            </button>
          </div>

          {/* 教师端专属：订单列表 */}
          <div>
            <h4 style={{ margin: '8px 0' }}>Orders (Host only)</h4>
            {orders.length === 0 && <p>No orders yet.</p>}
            {orders.map((o, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, padding: '6px 0', borderBottom: '1px solid #eee' }}>
                <span>{o.price}</span>
                <span>{o.name}</span>
                <span style={{ color: '#888' }}>{new Date(o.time).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 参与者出价（任何人都可提交密封价） */}
      <input
        type="number"
        value={bid}
        onChange={(e) => setBid(e.target.value)}
        placeholder="Enter sealed bid"
        style={{ width: '100%', padding: 8, marginRight: 8, marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSubmitBid} style={{ flex: 1, padding: 10 }}>Submit Bid</button>
        {/* 非教师端不显示揭标按钮 */}
      </div>

      <div style={{ marginTop: 12 }}>
        {winner
          ? <p>Winner: <b>{winner.username}</b>, Amount: <b>{winner.amount}</b> <i>({winner.pricing})</i></p>
          : <p>No winner yet.</p>
        }
      </div>
    </div>
  );
}

export default SealedAuction;
