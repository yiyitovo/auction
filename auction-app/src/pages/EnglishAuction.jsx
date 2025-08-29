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
  const [countdownSec, setCountdownSec] = useState(60); // 无人加价自动结束秒数
  const [remaining, setRemaining] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);
  const [bid, setBid] = useState('');
  const [orders, setOrders] = useState([]); // [{user, amount, ts}]

  // 教师端输入
  const [priceInput, setPriceInput] = useState('');

  useEffect(() => {
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);
    setIsTeacher((localStorage.getItem('role') || '') === 'teacher');

    // listeners
    const onBidUpdate = ({ currentPrice, highestBidder }) => {
      if (typeof currentPrice !== 'undefined') setCurrentPrice(currentPrice);
      if (typeof highestBidder !== 'undefined') setHighestBidder(highestBidder ?? null);
    };
    const onBudget = ({ cap }) => setMyCap(cap);
    const onRejected = ({ reason, cap, curr }) => {
      if (reason === 'OVER_BUDGET') alert(`Amount exceeds your cap: ${cap}`);
      else if (reason === 'INVALID_AMOUNT') alert(`Amount must be greater than current price: ${curr}`);
      else if (reason === 'NOT_STARTED') alert('The auction has not started yet. Please wait for Start.');
      else alert('Bid rejected');
    };
    const onRoomInfo = ({ isHost }) => setIsHost(!!isHost);
    const onPresence = ({ online }) => setOnline(online);
    const onEnded = ({ winner }) => {
      alert(winner ? `Congratulations! ${winner.username} wins at ${winner.amount}.` : 'No winner');
      setStatus('ended');
    };
    const onState = ({ status }) => setStatus(status || 'waiting');
    const onCfg = (c) => setCountdownSec(Number(c?.countdownSec || 60));
    const onTick = ({ remaining }) => setRemaining(remaining);
    const onOrders = ({ orders }) => setOrders(Array.isArray(orders) ? orders : []);

    // subscribe
    socket.on('bid-update', onBidUpdate);
    socket.on('your-budget', onBudget);
    socket.on('bid-rejected', onRejected);
    socket.on('room-info', onRoomInfo);
    socket.on('presence:update', onPresence);

    socket.on('auction-ended', onEnded);
    socket.on('english:state', onState);
    socket.on('english:config', onCfg);
    socket.on('english:tick', onTick);
    socket.on('english:orders', onOrders);

    // join
    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-english', { roomId });

    return () => {
      socket.off('bid-update', onBidUpdate);
      socket.off('your-budget', onBudget);
      socket.off('bid-rejected', onRejected);
      socket.off('room-info', onRoomInfo);
      socket.off('presence:update', onPresence);
      socket.off('auction-ended', onEnded);
      socket.off('english:state', onState);
      socket.off('english:config', onCfg);
      socket.off('english:tick', onTick);
      socket.off('english:orders', onOrders);
    };
  }, [roomId]);

  // Students: only allowed when status === 'running'
  const handlePlaceBid = () => {
    if (status !== 'running') {
      alert('The auction has not started yet.');
      return;
    }
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

  const applyConfig = () => {
    const p = Number(priceInput);
    const sec = Number(countdownSec);
    if (!Number.isFinite(sec) || sec <= 0) { alert('Invalid countdown seconds'); return; }
    if (status !== 'running') {
      if (!Number.isFinite(p) || p <= 0) { alert('Invalid starting price'); return; }
      socket.emit('english:apply', { roomId, price: p, countdownSec: sec });
    } else {
      // 已在进行中：仅更新无人加价秒数
      socket.emit('english:apply', { roomId, countdownSec: sec });
    }
  };

  const startAuction = () => socket.emit('english:start', { roomId });
  const stopAuction  = () => socket.emit('english:stop',  { roomId });

  const StatusPill = ({ value }) => (
    <Alert severity={value==='running' ? 'success' : value==='waiting' ? 'info' : 'warning'} sx={{ py: 0.5, m:0 }}>
      {value}
    </Alert>
  );

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" gutterBottom>English Auction</Typography>

      {/* 学生说明（统一风格） */}
      <Alert severity="info" sx={{ mb: 2 }}>
        <b>How to participate:</b> Enter a bid strictly higher than <b>Current Price</b> and click <i>Place Bid</i>.
        Bidding is allowed only after the teacher clicks <b>Start</b>.
        <ul style={{ margin: '6px 0 0 18px' }}>
          <li><b>Current Price</b> is the <b>starting price</b> set by the teacher before the round starts.</li>
          <li><b>Countdown (sec)</b> is a <b>no-bid window</b>: if nobody bids within this many seconds, the current highest bidder is declared the winner automatically.</li>
          <li><b>My Cap</b> is your personal limit; bids above it will be rejected.</li>
        </ul>
      </Alert>

      <Stack direction="row" spacing={3} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap">
        <Typography><b>User:</b> {username}</Typography>
        <Typography><b>Online:</b> {online}</Typography>
        <Typography><b>My Cap:</b> {myCap ?? '—'}</Typography>
        <Typography><b>Current Price:</b> {currentPrice ?? 'Not set'}</Typography>
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
          placeholder={status === 'running' ? 'Enter your bid' : 'Disabled until Start'}
          disabled={status !== 'running'}
          style={{ flex:1, padding: 8 }}
        />
        <Button variant="contained" onClick={handlePlaceBid} disabled={status !== 'running'} sx={{ px: 3 }}>
          Bid
        </Button>
      </Stack>

      {/* 订单簿（师生共视） */}
      <Box sx={{ border: '1px solid #ddd', borderRadius: 1, p: 2, mb: 2 }}>
        <Typography variant="subtitle1" gutterBottom>Order</Typography>
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
            <b>Teacher guide:</b> Set <b>Current Price</b> (this is the <b>starting price</b>) and <b>Countdown (sec)</b> (the <b>no-bid window</b>).
            Click <b>Apply</b> to save, then <b>Start</b> to begin. Each valid bid resets the countdown.
            Click <b>Stop</b> to end the auction early.
          </Alert>

          <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Current Price (starting price)</Typography>
              <input
                type="number"
                value={priceInput}
                onChange={(e)=>setPriceInput(e.target.value)}
                placeholder="e.g. 100"
                disabled={status === 'running'} // 开拍后不再允许修改起拍价
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
            <Button variant="outlined" onClick={applyConfig}>Apply</Button>
            <Button variant="contained" onClick={startAuction} disabled={status === 'running'}>Start</Button>
            <Button variant="outlined" color="warning" onClick={stopAuction} disabled={status !== 'running'}>Stop</Button>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

export default EnglishAuction;
