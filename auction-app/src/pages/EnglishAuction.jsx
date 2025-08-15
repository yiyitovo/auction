// src/pages/EnglishAuction.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function EnglishAuction() {
  const { id: roomId } = useParams();

  const [myName, setMyName] = useState('');
  const [currentPrice, setCurrentPrice] = useState(null);
  const [highestBidder, setHighestBidder] = useState(null);
  const [bid, setBid] = useState('');

  // Live Feed
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    // 1) 获取用户名
    let username = localStorage.getItem('username');
    if (!username) {
      username = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', username);
    }
    setMyName(username);

    // 2) 入房（用于房主识别/隐私分流）
    socket.emit('join-room', { roomId, username });

    // 3) 加入 English 命名空间
    socket.emit('join-english', { roomId });

    // 4) 订阅竞价更新（带最高出价者标签）
    const onBidUpdate = ({ currentPrice, highestBidder }) => {
      if (typeof currentPrice !== 'undefined') setCurrentPrice(currentPrice);
      if (typeof highestBidder !== 'undefined') setHighestBidder(highestBidder ?? null);
    };
    socket.on('bid-update', onBidUpdate);

    // 5) 订阅审计流（后端已按身份分流）
    const onAudit = (evt) => setActivity(list => [...list, evt].slice(-200));
    socket.on('audit', onAudit);

    // 6) 可选：首屏拉历史（没有该接口也不影响）
    fetch(`${BACKEND_URL}/auctions/${roomId}/activity`)
      .then(r => r.json())
      .then(arr => Array.isArray(arr) && setActivity(arr))
      .catch(() => {});

    return () => {
      socket.off('bid-update', onBidUpdate);
      socket.off('audit', onAudit);
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
    <div style={{ maxWidth: 980, margin: '16px auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div>
        <h2>English Auction</h2>
        <p><b>User:</b> {myName}</p>
        <p><b>Current Price:</b> {currentPrice ?? "No bid yet"}</p>
        <p><b>Highest Bidder:</b> {highestBidder ?? "—"}</p>

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

      {/* 右侧 Live Feed */}
      <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, height: 360, overflow: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Live Feed</h3>
        <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0 }}>
          {activity.map((e, i) => {
            const time = new Date(e.ts || Date.now()).toLocaleTimeString();
            let line = '';
            if (e.type === 'join') line = `${e.actor} joined`;
            else if (e.type === 'leave') line = `${e.actor} left`;
            else if (e.type === 'bid') line = `${e.actor} bid ${e.amount}`;
            else if (e.type === 'balances-set') line = `${e.actor} set budgets`;
            else line = `${e.actor} ${e.type}`;
            return <li key={i}>[{time}] {line}</li>;
          })}
        </ul>
      </div>
    </div>
  );
}

export default EnglishAuction;
