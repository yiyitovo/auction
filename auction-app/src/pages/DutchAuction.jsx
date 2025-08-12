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
      alert(`Winner: ${winner.username} @ ${winner.price}`);
    };

    socket.on('dutch-price', onDutchPrice);
    socket.on('auction-ended', onEnd);

    return () => {
      socket.off('dutch-price', onDutchPrice);
      socket.off('auction-ended', onEnd);
    };
  }, [roomId]);

  const handleAccept = () => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;
    socket.emit('accept-price', { roomId, price: p });
    setPrice('');
  };

  return (
    <div style={{ maxWidth: 480, margin: '16px auto' }}>
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
  );
}

export default DutchAuction;
