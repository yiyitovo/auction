// src/pages/SealedAuction.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function SealedAuction() {
  const { id: roomId } = useParams();
  const [username, setUsername] = useState('');
  const [bid, setBid] = useState('');
  const [winner, setWinner] = useState(null);

  // Live Feed
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    // 统一用户名 & join-room（用于隐私分流/房主识别）
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);

    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-sealed', { roomId });

    const onEnd = ({ winner }) => setWinner(winner || null);
    const onAudit = (evt) => setActivity(list => [...list, evt].slice(-200));

    socket.on('auction-ended', onEnd);
    socket.on('audit', onAudit);

    fetch(`${BACKEND_URL}/auctions/${roomId}/activity`)
      .then(r => r.json())
      .then(arr => Array.isArray(arr) && setActivity(arr))
      .catch(() => {});

    return () => {
      socket.off('auction-ended', onEnd);
      socket.off('audit', onAudit);
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

  return (
    <div style={{ maxWidth: 980, margin: '16px auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div>
        <h2>Sealed Bid Auction</h2>
        <p><b>User:</b> {username}</p>

        <input
          type="number"
          value={bid}
          onChange={(e) => setBid(e.target.value)}
          placeholder="Enter sealed bid"
          style={{ width: '100%', padding: 8, marginRight: 8, marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSubmitBid} style={{ flex: 1, padding: 10 }}>Submit Bid</button>
          <button onClick={handleReveal} style={{ flex: 1, padding: 10 }}>Reveal Winner</button>
        </div>

        <div style={{ marginTop: 12 }}>
          {winner
            ? <p>Winner: <b>{winner.username}</b>, Amount: <b>{winner.amount}</b></p>
            : <p>No winner yet.</p>
          }
        </div>
      </div>

      {/* 右侧 Live Feed */}
      <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, height: 360, overflow: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Live Feed</h3>
        <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
          {activity.map((e, i) => {
            const time = new Date(e.ts || Date.now()).toLocaleTimeString();
            let line = '';
            if (e.type === 'join') line = `${e.actor} joined`;
            else if (e.type === 'leave') line = `${e.actor} left`;
            else if (e.type === 'sealed-bid') line = `A sealed bid was received`;
            else if (e.type === 'reveal') line = `${e.actor} revealed ${e.amount}`;
            else line = `${e.actor} ${e.type}`;
            return <li key={i}>[{time}] {line}</li>;
          })}
        </ul>
      </div>
    </div>
  );
}

export default SealedAuction;
