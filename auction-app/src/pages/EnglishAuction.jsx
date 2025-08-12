// src/pages/EnglishAuction.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function EnglishAuction() {
  const { id: roomId } = useParams();
  const [currentPrice, setCurrentPrice] = useState(null);
  const [bid, setBid] = useState('');
  const [myName, setMyName] = useState('');

  useEffect(() => {
    // 1) 准备用户名（从 localStorage 或 prompt）
    let username = localStorage.getItem('username');
    if (!username) {
      username = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', username);
    }
    setMyName(username);

    // 2) 先做通用入房间（用于后端识别 username、分配预算等）
    socket.emit('join-room', { roomId, username });

    // 3) 再加入 English 房间的命名空间/事件
    socket.emit('join-english', { roomId });

    // 4) 订阅价格更新
    const onBidUpdate = ({ currentPrice }) => setCurrentPrice(currentPrice);
    socket.on('bid-update', onBidUpdate);

    return () => {
      socket.off('bid-update', onBidUpdate);
    };
  }, [roomId]);

  const handlePlaceBid = () => {
    const n = Number(bid);
    if (!Number.isFinite(n) || n <= 0) return;
    // 可选：避免无意义重复
    if (currentPrice != null && n <= Number(currentPrice)) {
      alert('Your bid must be higher than current price.');
      return;
    }
    socket.emit('place-bid', { roomId, amount: n });
    setBid('');
  };

  return (
    <div style={{ maxWidth: 480, margin: '16px auto' }}>
      <h2>English Auction</h2>
      <p><b>User:</b> {myName}</p>
      <p><b>Current Price:</b> {currentPrice ?? "No bid yet"}</p>

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
