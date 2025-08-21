// src/pages/DoubleAuction.jsx — force choose Buyer/Seller; hide Match for non-host
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
  const [side, setSide] = useState(null);     // 'buy' | 'sell' | null
  const [isHost, setIsHost] = useState(false);

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
      else if (reason === 'NO_SIDE') alert('Please choose Buyer or Seller first.');
      else if (reason === 'SIDE_MISMATCH') alert('You selected the opposite side. Change your role or submit on the chosen side.');
      else alert('Rejected');
    };
    const onRoomInfo = ({ isHost }) => setIsHost(!!isHost);
    const onSideAck = ({ side }) => setSide(side || null);

    socket.on('double-match', onMatch);
    socket.on('your-budget', onBudget);
    socket.on('bid-rejected', onRejected);
    socket.on('room-info', onRoomInfo);
    socket.on('double-side-set', onSideAck);     // ack for role choosing
    socket.on('double-side', onSideAck);         // state sync on join

    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-double', { roomId });

    return () => {
      socket.off('double-match', onMatch);
      socket.off('your-budget', onBudget);
      socket.off('bid-rejected', onRejected);
      socket.off('room-info', onRoomInfo);
      socket.off('double-side-set', onSideAck);
      socket.off('double-side', onSideAck);
    };
  }, [roomId]);

  const chooseSide = (s) => {
    setSide(s);
    socket.emit('double-set-side', { roomId, side: s }); // 告知后端锁定角色
  };

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

  const handleMatch = () => socket.emit('match-double', { roomId });

  return (
    <div style={{ maxWidth: 560, margin: '16px auto' }}>
      <h2>Double Auction</h2>
      <p><b>User:</b> {username}</p>
      <p><b>My Cap:</b> {myCap ?? '—'}</p>

      {/* 角色二选一 */}
      <div style={{ display: 'flex', gap: 16, margin: '12px 0' }}>
        <label>
          <input
            type="radio"
            name="side"
            checked={side === 'buy'}
            onChange={() => chooseSide('buy')}
          /> Buyer
        </label>
        <label>
          <input
            type="radio"
            name="side"
            checked={side === 'sell'}
            onChange={() => chooseSide('sell')}
          /> Seller
        </label>
      </div>

      {/* 只显示所选一侧的输入与按钮 */}
      {side === 'buy' && (
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
      )}

      {side === 'sell' && (
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
      )}

      {/* 只有教师/房主能看到 Match */}
      {isHost && (
        <button onClick={handleMatch} style={{ width: '100%', padding: 10, marginTop: 12 }}>
          Match (Teacher Only)
        </button>
      )}

      <div style={{ marginTop: 16 }}>
        <h4>Matches</h4>
        {(matches || []).length === 0 && <p>No trades yet.</p>}
        {(matches || []).map((m, index) => (
          <p key={index}>Buyer: {m.buyer}, Seller: {m.seller}, Price: {m.price}</p>
        ))}
      </div>
    </div>
  );
}

export default DoubleAuction;
