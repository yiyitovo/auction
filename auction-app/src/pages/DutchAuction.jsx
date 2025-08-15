// src/pages/DutchAuction.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function DutchAuction() {
  const { id: roomId } = useParams();
  const [username, setUsername] = useState('');
  const [myCap, setMyCap] = useState(null);
  const [price, setPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState(null);

  useEffect(() => {
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);

    const onDutchPrice = ({ price }) => setCurrentPrice(price);
    const onEnd = ({ winner }) => {
      alert(winner ? `Winner: ${winner.username} @ ${winner.price}` : 'No winner');
    };
    const onBudget = ({ cap }) => setMyCap(cap);
    const onRejected = ({ reason, cap }) => {
      if (reason === 'OVER_BUDGET') alert(`接受的价格超过你的上限：${cap}`);
      else alert('Bid rejected');
    };

    socket.on('dutch-price', onDutchPrice);
    socket.on('auction-ended', onEnd);
    socket.on('your-budget', onBudget);
    socket.on('bid-rejected', onRejected);

    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-dutch', { roomId });

    return () => {
      socket.off('dutch-price', onDutchPrice);
      socket.off('auction-ended', onEnd);
      socket.off('your-budget', onBudget);
      socket.off('bid-rejected', onRejected);
    };
  }, [roomId]);

  const handleAccept = () => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;
    socket.emit('accept-price', { roomId, price: p });
    setPrice('');
  };

  return (
    <div style={{ maxWidth: 520, margin: '16px auto' }}>
      <h2>Dutch Auction</h2>
      <p><b>User:</b> {username}</p>
      <p><b>My Cap:</b> {myCap ?? '—'}</p>
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
  );
}

export default DutchAuction;
