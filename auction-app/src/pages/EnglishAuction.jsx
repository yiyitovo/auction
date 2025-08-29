// src/pages/EnglishAuction.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';
import { Box, Typography, Button, Stack, Alert, Divider } from '@mui/material';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function EnglishAuction() {
  const { id: roomId } = useParams();

  const [username, setUsername] = useState('');
  const [myCap, setMyCap] = useState(null);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [highestBidder, setHighestBidder] = useState(null);
  const [online, setOnline] = useState(0);
  const [status, setStatus] = useState('waiting'); // waiting | running | ended
  const [countdownSec, setCountdownSec] = useState(60);
  const [remaining, setRemaining] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);
  const [bid, setBid] = useState('');
  const [orders, setOrders] = useState([]); // [{user, amount, ts}]

  useEffect(() => {
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);
    setIsTeacher((localStorage.getItem('role') || '') === 'teacher');

    // --- listeners ---
    const onBidUpdate = ({ currentPrice, highestBidder }) => {
      if (typeof currentPrice !== 'undefined') setCurrentPrice(currentPrice);
      if (typeof highestBidder !== 'undefined') setHighestBidder(highestBidder ?? null);
    };
    const onBudgetMine = ({ cap }) => setMyCap(cap);
    const onRejected = ({ reason, cap, curr }) => {
      if (reason === 'OVER_BUDGET') alert(`Amount exceeds your cap: ${cap}`);
      else if (reason === 'INVALID_AMOUNT') alert(`Amount must be greater than current price: ${curr}`);
      else alert('Bid rejected');
    };
    const onRoomInfo = ({ isHost }) => setIsHost(!!isHost);
    const onPresence = ({ online }) => setOnline(online);

    // 旧协议（兼容）
    const onEndedOld = ({ winner }) => {
      if (winner) alert(`Congratulations! Winner ${winner.username} won at price ${winner.amount}`);
      else alert('No winner');
      setStatus('ended');
    };

    // 新协议
    const onState = ({ status }) => setStatus(status || 'waiting');
    const onCfg = (c) => setCountdownSec(Number(c?.countdownSec || 60));
    const onTick = ({ remaining }) => setRemaining(remaining);
    const onWinnerNew = ({ winner, price }) => {
      alert(winner ? `Congratulations! ${winner} wins at ${price}.` : 'No winner');
      setStatus('ended');
    };
    const onOrders = ({ orders }) => setOrders(Array.isArray(orders) ? orders : []);

    // --- subscribe ---
    socket.on('bid-update', onBidUpdate);
    socket.on('your-budget', onBudgetMine);
    socket.on('bid-rejected', onRejected);
    socket.on('room-info', onRoomInfo);
    socket.on('presence:update', onPresence);

    socket.on('auction-ended', onEndedOld);   // 旧
    socket.on('english:state', onState);      // 新
    socket.on('english:config', onCfg);
    socket.on('english:tick', onTick);
    socket.on('english:winner', onWinnerNew);
    socket.on('english:orders', onOrders);

    // --- join ---
    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-english', { roomId });

    return () => {
      socket.off('bid-update', onBidUpdate);
      socket.off('your-budget', onBudgetMine);
      socket.off('bid-rejected', onRejected);
      socket.off('room-info', onRoomInfo);
      socket.off('presence:update', onPresence);

      socket.off('auction-ended', onEndedOld);
      socket.off('english:state', onState);
      socket.off('english:config', onCfg);
      socket.off('english:tick', onTick);
      socket.off('english:winner', onWinnerNew);
      socket.off('english:orders', onOrders);
    };
  }, [roomId]);

  // Students: place a higher bid than current price (server validates)
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

  // Teacher controls
  const canControl = isTeacher && isHost;

  const applyCountdown = () => {
    const sec = Number(countdownSec);
    if (!Number.isFinite(sec) || sec <= 0) { alert('Invalid countdown seconds'); return; }
    socket.emit('english:set-config', { roomId, countdownSec: sec });
  };

  const applyCurrentPrice = (priceText) => {
    const p = Number(priceText);
    if (!Number.isFinite(p) || p <= 0) { alert('Invalid current price'); return; }
    socket.emit('english:set-current', { roomId, price: p });
  };

  const startAuction = () => socket.emit('english:start', { roomId });
  const stopAuction = () => {
    if (confirm('Confirm stop the auction and hammer?')) {
      socket.emit('english:stop', { roomId });
    }
  };

  // Legacy hammer fallback（可后续删除）
  const handleHammerOld = () => {
    if (!confirm('End the auction now?')) return;
    socket.emit('english-hammer', { roomId });
  };

  const StatusPill = ({ value }) => (
    <Alert severity={value==='running' ? 'success' : value==='waiting' ? 'info' : 'warning'} sx={{ py: 0.5, m:0 }}>
      {value}
    </Alert>
  );

  // 教师端用于输入 current price 的本地状态
  const [priceInput, setPriceInput] = useState('');

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" gutterBottom>English Auction</Typography>

      {/* 学生说明（与 Dutch 风格统一） */}
      <Alert severity="info" sx={{ mb: 2 }}>
        <b>How to participate:</b> Enter a bid strictly higher than <b>Current Price</b> and click <i>Place Bid</i>.
        Your personal limit is <b>My Cap</b>; the system will block bids above it.
        The highest valid bid at the end wins. Teacher may set <b>Current Price</b>, configure <b>Countdown</b>, and start/stop the round.
      </Alert>

      <Stack direction="row" spacing={3} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap">
        <Typography><b>User:</b> {username}</Typography>
        <Typography><b>Online:</b> {online}</Typography>
        <Typography><b>My Cap:</b> {myCap ?? '—'}</Typography>
        <Typography><b>Current Price:</b> {currentPrice ?? 'No bid yet'}</Typography>
        <Typography><b>Highest Bidder:</b> {highestBidder ?? '—'}</Typography>
        <StatusPill value={status} />
        {typeof remaining === 'number' && <Typography><b>Time Left:</b> {remaining}s</Typography>}
      </Stack>

      {/* 出价框（学生） */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <input
          type="number"
          value={bid}
          onChange={(e) => setBid(e.target.value)}
          placeholder="Enter your bid"
          style={{ flex:1, padding: 8 }}
        />
        <Button variant="contained" onClick={handlePlaceBid} sx={{ px: 3 }}>
          Place Bid
        </Button>
      </Stack>

      {/* 订单簿（师生共视） */}
      <Box sx={{ border: '1px solid #ddd', borderRadius: 1, p: 2, mb: 2 }}>
        <Typography variant="subtitle1" gutterBottom>Order Records (Highest first)</Typography>
        {orders.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No orders yet.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', rowGap: 0.5, columnGap: 1 }}>
            <Typography sx={{ fontWeight: 600 }}>Name</Typography>
            <Typography sx={{ fontWeight: 600 }}>Bid</Typography>
            <Typography sx={{ fontWeight: 600 }}>Time</Typography>
            <Divider sx={{ gridColumn: '1 / -1', my: 1 }} />
            {orders.map((o, i) => (
              <React.Fragment key={i}>
                <Typography>{o.user}</Typography>
                <Typography>{o.amount}</Typography>
                <Typography>{new Date(o.ts).toLocaleTimeString()}</Typography>
              </React.Fragment>
            ))}
          </Box>
        )}
      </Box>

      {/* 教师控制区 */}
      {isTeacher && isHost && (
        <Box sx={{ border: '1px solid #ddd', borderRadius: 1, p: 2, mt: 2 }}>
          <Alert severity="success" sx={{ mb: 2 }}>
            <b>Teacher guide:</b> Set <b>Current Price</b>, configure <b>Countdown</b>, then <b>Start</b>. Use <b>Stop</b> to end early.
          </Alert>

          <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Current Price (set by teacher)</Typography>
              <input
                type="number"
                value={priceInput}
                onChange={(e)=>setPriceInput(e.target.value)}
                placeholder="e.g. 100"
                style={{ width: '100%', padding: 8 }}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Countdown (sec)</Typography>
              <input
                type="number"
                value={countdownSec}
                onChange={(e)=>setCountdownSec(e.target.value)}
                placeholder="e.g. 60"
                style={{ width: '100%', padding: 8 }}
              />
            </Box>
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button variant="outlined" onClick={() => applyCurrentPrice(priceInput)}>Set Current Price</Button>
            <Button variant="outlined" onClick={applyCountdown}>Set Countdown</Button>
            <Button variant="contained" onClick={startAuction}>Start</Button>
            <Button variant="outlined" color="warning" onClick={stopAuction}>Stop</Button>
          </Stack>

          {/* 旧 hammer 兜底（可删） */}
          <Button
            variant="contained"
            onClick={handleHammerOld}
            sx={{ width: '100%', mt: 2, background:'#1976d2' }}
          >
            Hammer (End Auction) — Legacy
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default EnglishAuction;
