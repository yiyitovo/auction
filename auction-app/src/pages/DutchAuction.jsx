// src/pages/DutchAuction.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function DutchAuction() {
  const { id: roomId } = useParams();
  const [username, setUsername] = useState('');
  const [price, setPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState(null);

  // Live Feed
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);

    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-dutch', { roomId });

    const onDutchPrice = ({ price }) => setCurrentPrice(price);
    const onEnd = ({ winner }) => {
      // winner.username 已按隐私策略分流（房主真名，参与者代号）
      alert(winner ? `Winner: ${winner.username} @ ${winner.price}` : 'No winner');
    };
    const onAudit = (evt) => setActivity(list => [...list, evt].slice(-200));

    socket.on('dutch-price', onDutchPrice);
    socket.on('auction-ended', onEnd);
    socket.on('audit', onAudit);

    fetch(`${BACKEND_URL}/auctions/${roomId}/activity`)
      .then(r => r.json())
      .then(arr => Array.isArray(arr) && setActivity(arr))
      .catch(() => {});

    return () => {
      socket.off('dutch-price', onDutchPrice);
      socket.off('auction-ended', onEnd);
      socket.off('audit', onAudit);
    };
  }, [roomId]);

  const handleAccept = () => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;
    socket.emit('accept-price', { roomId, price: p });
    setPrice('');
  };

  return (
    <div style={{ maxWidth: 980, margin: '16px auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div>
        <h2>Dutch Auction</h2>
        <p><b>User:</b> {username}</p>
        <p><b>Current Price:</b> {currentPrice ?? 'Not set'}</p>

        <input
          type="number"
          placeholder="Accept price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          style={{ width: '100%', padding: 8, marginBottom: 8 }}
        />
        <button onClick={handleAccept} style={{ width: '100%', padding: 10 }}>
          Accept Price
        </button>
      </div>

      {/* 右侧 Live Feed */}
      <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, height: 360, overflow: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Live Feed</h3>
        <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
          {activity.map((e, i) => {
            const time = new Date(e.ts || Date.now()).toLocaleTimeString();
            let line = '';
            if (e.type === 'join') line = `${e.actor ?? '—'} joined`;
            else if (e.type === 'leave') line = `${e.actor ?? '—'} left`;
            else if (e.type === 'clock') line = `Clock => ${e.price}`;
            else if (e.type === 'accept') line = `${e.actor} accepted @ ${e.amount}`;
            else line = `${e.actor ?? '—'} ${e.type}`;
            return <li key={i}>[{time}] {line}</li>;
          })}
        </ul>
      </div>
    </div>
  );
}

export default DutchAuction;
