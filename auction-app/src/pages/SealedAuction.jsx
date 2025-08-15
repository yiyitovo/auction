// src/pages/SealedAuction.jsx
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
      else alert('Bid rejected');
    };

    socket.on('auction-ended', onEnd);
    socket.on('your-budget', onBudget);
    socket.on('bid-rejected', onRejected);

    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-sealed', { roomId });

    return () => {
      socket.off('auction-ended', onEnd);
      socket.off('your-budget', onBudget);
      socket.off('bid-rejected', onRejected);
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
    <div style={{ maxWidth: 520, margin: '16px auto' }}>
      <h2>Sealed Bid Auction</h2>
      <p><b>User:</b> {username}</p>
      <p><b>My Cap:</b> {myCap ?? '—'}</p>

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
  );
}

export default SealedAuction;
