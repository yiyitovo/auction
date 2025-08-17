// src/pages/EnglishAuction.jsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function EnglishAuction() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();

  const [myName, setMyName] = useState('');
  const [myCap, setMyCap] = useState(null);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [highestBidder, setHighestBidder] = useState(null); // 实名
  const [bid, setBid] = useState('');
  const [orders, setOrders] = useState([]);                 // ← price / name / time
  const [ended, setEnded] = useState(false);
  const [winner, setWinner] = useState(null);
  const [isHost, setIsHost] = useState(false);

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
      if (reason === 'OVER_BUDGET') alert(`Amount exceeds your cap: ${cap}`);
      else if (reason === 'INVALID_AMOUNT') alert(`Amount must be greater than current price: ${curr}`);
      else alert('Bid rejected');
    };
    const onOrders = (list) => setOrders(Array.isArray(list) ? list : []);
    const onEnded = ({ winner }) => {
      setEnded(true);
      setWinner(winner || null);
    };
    const onRoomInfo = ({ isHost }) => setIsHost(!!isHost);

    socket.on('bid-update', onBidUpdate);
    socket.on('your-budget', onBudget);
    socket.on('bid-rejected', onRejected);
    socket.on('order', onOrders);            // ← 监听新事件名
    socket.on('english-ended', onEnded);
    socket.on('room-info', onRoomInfo);

    socket.emit('join-room', { roomId, username });
    socket.emit('join-english', { roomId });

    return () => {
      socket.off('bid-update', onBidUpdate);
      socket.off('your-budget', onBudget);
      socket.off('bid-rejected', onRejected);
      socket.off('order', onOrders);
      socket.off('english-ended', onEnded);
      socket.off('room-info', onRoomInfo);
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

  const handleExit = () => {
    socket.emit('leave-room', { roomId });
    navigate('/'); // 返回 Auction Hall
  };

  return (
    <div style={{ maxWidth: 720, margin: '16px auto', padding: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>English Auction</h2>
        <button onClick={handleExit} style={{ padding: '8px 12px' }}>Exit</button>
      </div>

      <p><b>User:</b> {myName} {isHost && <span style={{ marginLeft: 8, color: '#888' }}>(Host)</span>}</p>
      <p><b>My Cap:</b> {myCap ?? '—'}</p>
      <p><b>Current Price:</b> {currentPrice ?? 'No bid yet'}</p>
      <p><b>Highest Bidder:</b> {highestBidder ?? '—'}</p>

      {!ended ? (
        <>
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
        </>
      ) : (
        <div style={{ padding: 10, background: '#f5f5f5', marginTop: 8 }}>
          {winner
            ? <p><b>Winner:</b> {winner.username} &nbsp; <b>Amount:</b> {winner.amount}</p>
            : <p>No winner.</p>
          }
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h4 style={{ marginBottom: 8 }}>Orders</h4>
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
  );
}

export default EnglishAuction;
