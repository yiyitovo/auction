// src/pages/DoubleAuction.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function DoubleAuction() {
  const { id: roomId } = useParams();
  const [username, setUsername] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [matches, setMatches] = useState([]);

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
    socket.emit('join-double', { roomId });

    const onMatch = (matchList) => setMatches(matchList || []);
    const onAudit = (evt) => setActivity(list => [...list, evt].slice(-200));

    socket.on('double-match', onMatch);
    socket.on('audit', onAudit);

    fetch(`${BACKEND_URL}/auctions/${roomId}/activity`)
      .then(r => r.json())
      .then(arr => Array.isArray(arr) && setActivity(arr))
      .catch(() => {});

    return () => {
      socket.off('double-match', onMatch);
      socket.off('audit', onAudit);
    };
  }, [roomId]);

  const handleSubmitBuy = () => {
    const p = Number(buyPrice);
    if (!Number.isFinite(p) || p <= 0) return;
    socket.emit('submit-buy', { roomId, price: p });
    setBuyPrice('');
  };

  const handleSubmitSell = () => {
    const p = Number(sellPrice);
    if (!Number.isFinite(p) || p <= 0) return;
    socket.emit('submit-sell', { roomId, price: p });
    setSellPrice('');
  };

  const handleMatch = () => {
    socket.emit('match-double', { roomId });
  };

  return (
    <div style={{ maxWidth: 980, margin: '16px auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div>
        <h2>Double Auction</h2>
        <p><b>User:</b> {username}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div>
            <input
              type="number"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              placeholder="Buy Price"
              style={{ width: '100%', padding: 8, marginBottom: 8 }}
            />
            <button onClick={handleSubmitBuy} style={{ width: '100%', padding: 10 }}>
              Submit Buy
            </button>
          </div>
          <div>
            <input
              type="number"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="Sell Price"
              style={{ width: '100%', padding: 8, marginBottom: 8 }}
            />
            <button onClick={handleSubmitSell} style={{ width: '100%', padding: 10 }}>
              Submit Sell
            </button>
          </div>
        </div>

        <button onClick={handleMatch} style={{ width: '100%', padding: 10, marginBottom: 12 }}>
          Match
        </button>

        <div>
          <h4>Matches</h4>
          {(matches || []).map((m, index) => (
            <p key={index}>Buyer: {m.buyer}, Seller: {m.seller}, Price: {m.price}</p>
          ))}
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
            else if (e.type === 'order') line = `${e.actor} ${e.side} @ ${e.price}`;
            else if (e.type === 'trade') line = `${e.actor} traded @ ${e.price}`;
            else line = `${e.actor} ${e.type}`;
            return <li key={i}>[{time}] {line}</li>;
          })}
        </ul>
      </div>
    </div>
  );
}

export default DoubleAuction;
