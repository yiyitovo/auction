// src/pages/EnglishAuction.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function EnglishAuction() {
  const { id: roomId } = useParams();

  const [myName, setMyName] = useState('');
  const [myCap, setMyCap] = useState(null);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [highestBidder, setHighestBidder] = useState(null);
  const [bid, setBid] = useState('');

  useEffect(() => {
    let username = localStorage.getItem('username');
    if (!username) {
      username = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', username);
    }
    setMyName(username);

    const onBidUpdate = ({ currentPrice, highestBidder }) => {
      if (typeof currentPrice !== 'undefined') setCurrentPrice(currentPrice);
      if (typeof highestBidder !== 'undefined') setHighestBidder(highestBidder ?? null);
    };
    const onBudget = ({ cap }) => setMyCap(cap);
    const onRejected = ({ reason, cap, curr }) => {
      if (reason === 'OVER_BUDGET') alert(`出价超过你的上限：${cap}`);
      else if (reason === 'INVALID_AMOUNT') alert(`无效出价，请高于当前价：${curr}`);
      else alert('Bid rejected');
    };

    socket.on('bid-update', onBidUpdate);
    socket.on('your-budget', onBudget);
    socket.on('bid-rejected', onRejected);

    socket.emit('join-room', { roomId, username });
    socket.emit('join-english', { roomId });

    return () => {
      socket.off('bid-update', onBidUpdate);
      socket.off('your-budget', onBudget);
      socket.off('bid-rejected', onRejected);
    };
  }, [roomId]);

  const handlePlaceBid = () => {
    const n = Number(bid);
    if (!Number.isFinite(n) || n <= 0) return;
    if (currentPrice != null && n <= Number(currentPrice)) {
      alert('Your bid must be higher than current price.');
      return;
    }
    socket.emit('place-bid', { roomId, amount: n });
    setBid('');
  };

  return (
    <div style={{ maxWidth: 520, margin: '16px auto' }}>
      <h2>English Auction</h2>
      <p><b>User:</b> {myName}</p>
      <p><b>My Cap:</b> {myCap ?? '—'}</p>
      <p><b>Current Price:</b> {currentPrice ?? 'No bid yet'}</p>
      <p><b>Highest Bidder:</b> {highestBidder ?? '—'}</p>

      <input
        type="number"
        value={bid}
        onChange={(e) => setBid(e.target.value)}
        placeholder="Enter your bid"
        style={{ width: '100%', padding: 8, marginBottom: 8 }}
      />
      <button onClick={handlePlaceBid} style={{ width: '100%', padding: 10 }}>
        Place Bid
      </button>
    </div>
  );
}

export default EnglishAuction;
