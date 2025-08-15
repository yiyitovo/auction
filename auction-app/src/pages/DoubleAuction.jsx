// src/pages/DoubleAuction.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function DoubleAuction() {
  const { id: roomId } = useParams();
  const [username, setUsername] = useState('');
  const [myCap, setMyCap] = useState(null);
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);

    const onMatch = (matchList) => setMatches(matchList || []);
    const onBudget = ({ cap }) => setMyCap(cap);
    const onRejected = ({ reason, cap }) => {
      if (reason === 'OVER_BUDGET') alert(`Amount exceeds your cap: ${cap}`);
      else alert('Bid rejected');
    };

    socket.on('double-match', onMatch);
    socket.on('your-budget', onBudget);
    socket.on('bid-rejected', onRejected);

    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-double', { roomId });

    return () => {
      socket.off('double-match', onMatch);
      socket.off('your-budget', onBudget);
      socket.off('bid-rejected', onRejected);
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
    <div style={{ maxWidth: 560, margin: '16px auto' }}>
      <h2>Double Auction</h2>
      <p><b>User:</b> {username}</p>
      <p><b>My Cap:</b> {myCap ?? '—'}</p>

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
  );
}

export default DoubleAuction;
