// src/pages/DoubleAuction.jsx — unified style (CDA/Call fixed at creation)
// Students see My Cap and ONE input (buy OR sell). Teacher has only Start/Stop.
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';
import { Box, Typography, Button, Stack, Alert, Divider } from '@mui/material';

const BACKEND_URL = 'https://auction-backend-k44x.onrender.com';
const socket = io(BACKEND_URL);

export default function DoubleAuction() {
  const { id: roomId } = useParams();

  const [username, setUsername] = useState('');
  const [myCap, setMyCap] = useState(null);
  const [mode, setMode] = useState('cda');           // 'cda' | 'call' (fixed at creation)
  const [status, setStatus] = useState('waiting');    // 'waiting' | 'collecting' | 'trading' | 'ended'
  const [side, setSide] = useState(null);             // 'buy' | 'sell'
  const [isHost, setIsHost] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  const [price, setPrice] = useState('');            // input for buy/sell
  const [matches, setMatches] = useState([]);        // [{buyer, seller, price}]

  // --- socket wiring
  useEffect(() => {
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);
    setIsTeacher((localStorage.getItem('role') || '') === 'teacher');

    const onConfig  = ({ mode }) => setMode((mode || 'cda'));
    const onState   = ({ status }) => setStatus(status || 'waiting');
    const onSide    = ({ side }) => setSide(side || null);
    const onRoom    = ({ isHost }) => setIsHost(!!isHost);
    const onBudget  = ({ cap }) => setMyCap(cap);
    const onMatch   = (list) => setMatches(Array.isArray(list) ? list : []);
    const onReject  = ({ reason, cap }) => {
      if (reason === 'OVER_BUDGET') alert(`Your price exceeds your cap: ${cap}.`);
      else if (reason === 'NO_SIDE') alert('Your role is not assigned yet. Please rejoin.');
      else alert('Order rejected.');
    };

    socket.on('double-config', onConfig);
    socket.on('double-state', onState);
    socket.on('double-side', onSide);
    socket.on('room-info', onRoom);
    socket.on('your-budget', onBudget);
    socket.on('double-match', onMatch);
    socket.on('bid-rejected', onReject);

    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-double', { roomId });

    return () => {
      socket.off('double-config', onConfig);
      socket.off('double-state', onState);
      socket.off('double-side', onSide);
      socket.off('room-info', onRoom);
      socket.off('your-budget', onBudget);
      socket.off('double-match', onMatch);
      socket.off('bid-rejected', onReject);
    };
  }, [roomId]);

  // --- actions
  const submitOrder = () => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;
    if (side === 'buy') socket.emit('submit-buy', { roomId, price: p });
    if (side === 'sell') socket.emit('submit-sell', { roomId, price: p });
    setPrice('');
  };

  const start = () => socket.emit('double-start', { roomId }); // teacher only
  const stop  = () => socket.emit('double-stop',  { roomId }); // teacher only (Call: clear & broadcast)

  const canControl = isTeacher && isHost;

  // --- UI helpers
  const StudentHowItWorks = () => (
    <Alert severity="info" sx={{ background: '#e8f0fe' }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
        How it works
      </Typography>
      <ul style={{ margin: '4px 0 0 18px' }}>
        {mode === 'cda' ? (
          <>
            <li>You are auto-assigned as a <b>Buyer</b> or <b>Seller</b>.</li>
            <li>Submit one price at a time: Buyers submit a <b>bid</b>, Sellers submit an <b>ask</b>.</li>
            <li>The market clears continuously during the round; trades may occur at any moment.</li>
          </>
        ) : (
          <>
            <li>You are auto-assigned as a <b>Buyer</b> or <b>Seller</b>.</li>
            <li>During the collecting phase, submit your <b>bid/ask</b>. No trades happen until the teacher stops the round.</li>
            <li>At stop, the system computes a <b>uniform clearing price</b> and executes all feasible matches.</li>
          </>
        )}
        <li><b>My Cap</b> is your personal budget ceiling — your submitted price must not exceed it.</li>
        <li>If multiple trades are feasible, matching follows the market’s rule; ties may be broken at random.</li>
      </ul>
    </Alert>
  );

  const TeacherGuide = () => (
    <Alert severity="success" sx={{ mt: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        Teacher guide
      </Typography>
      {mode === 'cda'
        ? <>This room is <b>Continuous Double Auction</b>. Click <b>Start</b> to open trading and <b>Stop</b> to end the round.</>
        : <>This room is <b>Call (Uniform-Price)</b>. Click <b>Start</b> to begin collecting orders, and <b>Stop</b> to clear the market and show matches.</>}
    </Alert>
  );

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" gutterBottom>Double Auction</Typography>

      <StudentHowItWorks />

      <Stack direction="row" spacing={3} sx={{ mb: 2, mt: 1 }} alignItems="center" flexWrap="wrap">
        <Typography><b>User:</b> {username}</Typography>
        <Typography><b>My Cap:</b> {myCap ?? '—'}</Typography>
        <Typography><b>Mode:</b> {mode === 'cda' ? 'CDA' : 'Call'}</Typography>
      </Stack>

      {/* Status banner */}
      {status === 'collecting' && <Alert severity="info" sx={{ mb: 1 }}>Collecting orders…</Alert>}
      {status === 'trading'    && <Alert severity="success" sx={{ mb: 1 }}>Live trading…</Alert>}
      {status === 'ended'      && <Alert severity="warning" sx={{ mb: 1 }}>Round ended.</Alert>}

      {/* ONE input according to role */}
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <input
          type="number"
          value={price}
          onChange={(e)=>setPrice(e.target.value)}
          placeholder={side === 'sell' ? 'Enter your ask price' : 'Enter your bid price'}
          style={{ flex: 1, padding: 10, border: '1px solid #ddd', borderRadius: 4 }}
        />
        <Button
          variant="contained"
          onClick={submitOrder}
          disabled={!side || status === 'ended' || status === 'waiting'}
        >
          {side === 'sell' ? 'Submit Ask' : 'Submit Bid'}
        </Button>
      </Stack>

      {/* Teacher controls */}
      {canControl && (
        <Box sx={{ border: '1px solid #ddd', borderRadius: 1, p: 2, mt: 1 }}>
          <Typography variant="subtitle1" gutterBottom>Round Controls</Typography>
          <Stack direction="row" spacing={2}>
            <Button variant="contained" onClick={start}>Start</Button>
            <Button variant="outlined" color="warning" onClick={stop}>Stop</Button>
          </Stack>
          <TeacherGuide />
        </Box>
      )}

      {/* Matches list */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Matches</Typography>
        {(!matches || matches.length === 0) ? (
          <Typography color="text.secondary">No trades yet.</Typography>
        ) : (
          <>
            <Stack direction="row" spacing={2} sx={{ fontWeight: 600, mb: 0.5 }}>
              <Typography sx={{ width: 1/3 }}>Buyer</Typography>
              <Typography sx={{ width: 1/3 }}>Seller</Typography>
              <Typography sx={{ width: 1/3 }}>Price</Typography>
            </Stack>
            <Divider sx={{ mb: 1 }} />
            {matches.map((m, i) => (
              <Stack key={i} direction="row" spacing={2} sx={{ mb: 0.5 }}>
                <Typography sx={{ width: 1/3 }}>{m.buyer}</Typography>
                <Typography sx={{ width: 1/3 }}>{m.seller}</Typography>
                <Typography sx={{ width: 1/3 }}>{m.price}</Typography>
              </Stack>
            ))}
          </>
        )}
      </Box>
    </Box>
  );
}
