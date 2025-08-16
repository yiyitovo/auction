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
  const [role, setRole] = useState(''); // '', 'buy', 'sell'
  const [price, setPrice] = useState('');
  const [matches, setMatches] = useState([]);
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
      if (reason === 'OVER_BUDGET') alert(`Buy price exceeds your cap: ${cap}`);
      else alert('Order rejected');
    };
    const onForbidden = ({ action, reason }) => {
      if (reason === 'HOST_ONLY' && action === 'match-double') {
        alert('Only the teacher (host) can match.');
      } else if (reason === 'ROLE_MISMATCH') {
        alert('Please choose your role (Buyer/Seller) first.');
      }
    };
    const onYouAreHost = ({ roomId: rid, isHost }) => {
      if (rid === roomId) setIsHost(!!isHost);
    };
    const onRoleUpdated = ({ roomId: rid, role }) => {
      if (rid === roomId) setRole(role);
    };

    socket.on('double-match', onMatch);
    socket.on('your-budget', onBudget);
    socket.on('bid-rejected', onRejected);
    socket.on('forbidden', onForbidden);
    socket.on('you-are-host', onYouAreHost);
    socket.on('role-updated', onRoleUpdated);

    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-double', { roomId });
    socket.emit('am-i-host', { roomId });

    // 老师端：在链接带 ?host=1 时，自动申请 host 权限
    const params = new URLSearchParams(window.location.search);
    if (params.get('host') === '1') {
      socket.emit('join-host', { roomId });
      setTimeout(() => socket.emit('am-i-host', { roomId }), 50);
    }

    return () => {
      socket.off('double-match', onMatch);
      socket.off('your-budget', onBudget);
      socket.off('bid-rejected', onRejected);
      socket.off('forbidden', onForbidden);
      socket.off('you-are-host', onYouAreHost);
      socket.off('role-updated', onRoleUpdated);
    };
  }, [roomId]);

  const chooseRole = (r) => {
    setRole(r);
    setPrice('');
    socket.emit('set-role', { roomId, role: r });
  };

  const handleSubmit = () => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;
    if (role === 'buy') socket.emit('submit-buy', { roomId, price: p });
    else if (role === 'sell') socket.emit('submit-sell', { roomId, price: p });
    setPrice('');
  };

  const handleMatch = () => {
    socket.emit('match-double', { roomId });
  };

  return (
    <div style={{ maxWidth: 560, margin: '16px auto' }}>
      <h2>Double Auction</h2>
      <p><b>User:</b> {username}</p>
      <p><b>My Cap (buyers):</b> {myCap ?? '—'}</p>

      {/* 角色选择（普通用户必须先选） */}
      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button
          onClick={() => chooseRole('buy')}
          style={{ flex: 1, padding: 10, background: role==='buy' ? '#e5f0ff' : '' }}
        >
          I am a Buyer
        </button>
        <button
          onClick={() => chooseRole('sell')}
          style={{ flex: 1, padding: 10, background: role==='sell' ? '#e5f0ff' : '' }}
        >
          I am a Seller
        </button>
      </div>

      {/* 仅显示与角色对应的一栏 */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={
            role === 'sell' ? "Ask Price" :
            role === 'buy'  ? "Bid Price" :
            "Choose a role first"
          }
          disabled={!role}
          style={{ width: '100%', padding: 8, marginBottom: 8 }}
        />
        <button onClick={handleSubmit} disabled={!role} style={{ width: '100%', padding: 10 }}>
          Submit {role === 'sell' ? 'Ask' : role === 'buy' ? 'Bid' : 'Order'}
        </button>
      </div>

      {/* Match 仅教师端可见（普通用户不会显示） */}
      {isHost && (
        <button onClick={handleMatch} style={{ width: '100%', padding: 10, marginBottom: 12 }}>
          Match (Host Only)
        </button>
      )}

      <div>
        <h4>Matches</h4>
        {(matches || []).length === 0 && <p>No matches yet.</p>}
        {(matches || []).map((m, i) => (
          <p key={i}>Buyer: {m.buyer}, Seller: {m.seller}, Price: {m.price}</p>
        ))}
      </div>
    </div>
  );
}

export default DoubleAuction;
