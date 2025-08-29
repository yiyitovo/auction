// src/pages/DutchAuction.jsx — accept button only (server validates cap), with EN instructions
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';
import { Box, Typography, Button, Stack, Alert, Divider } from '@mui/material';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function DutchAuction() {
  const { id: roomId } = useParams();

  const [username, setUsername] = useState('');
  const [myCap, setMyCap] = useState(null);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [cfg, setCfg] = useState({ step: 1, intervalMs: 1000, minPrice: 0, intervalSec: 1 });
  const [status, setStatus] = useState('waiting');
  const [isHost, setIsHost] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);
  const [budgets, setBudgets] = useState([]); // [{name,cap}]
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);
    setIsTeacher((localStorage.getItem('role') || '') === 'teacher');

    const onDutchPrice = ({ price }) => setCurrentPrice(price);
    const onEnd = ({ winner }) => { alert(winner ? `Congratulations！Winner ${winner.username} won at price ${winner.price}` : 'No winner'); };
    const onState = ({ status, cfg }) => {
      if (cfg) setCfg({
        step: Number(cfg.step || 1),
        intervalMs: Number(cfg.intervalMs || 1000),
        minPrice: Number(cfg.minPrice ?? 0),
        intervalSec: Math.max(1, Math.round((Number(cfg.intervalMs || 1000)) / 1000))
      });
      setStatus(status || 'waiting');
      setMsg(status === 'in-progress' ? 'Clock running...' : status === 'paused' ? 'Paused' : status || '');
    };
    const onRoomInfo = ({ isHost }) => setIsHost(!!isHost);
    const onRejected = ({ reason, cap }) => {
      if (reason === 'OVER_BUDGET') alert(`Your budget (${cap}) is less than current price.`);
      else if (reason === 'NOT_STARTED') alert('The auction has not started yet.');
      else alert('Rejected.');
    };
    const onBudgetMine = ({ cap }) => setMyCap(cap);
    const onBudgetList = ({ budgets }) => setBudgets(Array.isArray(budgets) ? budgets : []);

    socket.on('dutch-price', onDutchPrice);
    socket.on('auction-ended', onEnd);
    socket.on('dutch-state', onState);
    socket.on('room-info', onRoomInfo);
    socket.on('bid-rejected', onRejected);
    socket.on('your-budget', onBudgetMine);
    socket.on('budget-list', onBudgetList);

    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-dutch', { roomId });

    return () => {
      socket.off('dutch-price', onDutchPrice);
      socket.off('auction-ended', onEnd);
      socket.off('dutch-state', onState);
      socket.off('room-info', onRoomInfo);
      socket.off('bid-rejected', onRejected);
      socket.off('your-budget', onBudgetMine);
      socket.off('budget-list', onBudgetList);
    };
  }, [roomId]);

  // Students: accept the *current* price (server validates cap/timing)
  const handleAccept = () => {
    socket.emit('accept-price', { roomId }); // server uses the current price & checks cap
  };

  // Teacher controls
  const [startPrice, setStartPrice] = React.useState('');
  const [step, setStep] = React.useState(1);
  const [intervalSec, setIntervalSec] = React.useState(1);
  const [minPrice, setMinPrice] = React.useState(0);
  const canControl = isTeacher && isHost;

  const applyConfig = () => {
    const sPrice = Number(startPrice);
    const sStep = Number(step);
    const sSec = Number(intervalSec);
    const sMin = Number(minPrice);
    if (!Number.isFinite(sPrice) || sPrice <= 0) { alert('Invalid start price'); return; }
    if (!Number.isFinite(sStep) || sStep <= 0) { alert('Invalid step'); return; }
    if (!Number.isFinite(sSec)  || sSec  <= 0) { alert('Invalid interval seconds'); return; }
    socket.emit('dutch-config', {
      roomId,
      startPrice: sPrice,
      step: sStep,
      intervalSec: sSec,
      minPrice: Number.isFinite(sMin) && sMin >=0 ? sMin : 0
    });
  };
  const startClock = () => socket.emit('dutch-start', { roomId });
  const stopClock  = () => socket.emit('dutch-stop', { roomId });

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" gutterBottom>Dutch Auction</Typography>

      {/* Student instructions (EN) */}
      <Alert severity="info" sx={{ mb: 2 }}>
        <b>How to participate:</b> The price counts down automatically.
        <b> My Cap</b> is your personal maximum ,you must never pay above it.
        You may wait for a lower price and click <i>Accept Current Price</i> at any moment
        while the clock is running. Your bid is the <b>Current Price</b> at the instant you click.
        If multiple students accept simultaneously, the earliest timestamp wins.
        The system will block any acceptance above your My Cap.
      </Alert>

      <Stack direction="row" spacing={3} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap">
        <Typography><b>User:</b> {username}</Typography>
        <Typography><b>My Cap:</b> {myCap ?? '—'}</Typography>
        <Typography><b>Current Price:</b> {currentPrice ?? 'Not set'}</Typography>
        {msg && <Alert severity={status==='in-progress' ? 'success' : 'warning'} sx={{ py: 0.5, m:0 }}>{msg}</Alert>}
      </Stack>

      {/* Accept button — only disabled if not running or no current price; NOT tied to My Cap on UI */}
      <Button
        variant="contained"
        onClick={handleAccept}
        disabled={status !== 'in-progress' || !Number.isFinite(Number(currentPrice))}
        sx={{ width: '100%', py: 1.5, fontWeight: 700, mb: 2 }}
      >
        Accept Current Price
      </Button>

      {/* Teacher-only instructions + controls */}
      {canControl && (
        <Box sx={{ border: '1px solid #ddd', borderRadius: 1, p: 2, mt: 2 }}>
          <Alert severity="success" sx={{ mb: 2 }}>
            <b>Teacher guide:</b> Configure the price clock, then press <b>Start</b>.
            <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
              <li><b>Start Price</b>: the initial price the clock starts from.</li>
              <li><b>Drop Step</b>: how much the price decreases each tick.</li>
              <li><b>Interval (sec)</b>: seconds between ticks.</li>
              <li><b>Min Price (floor)</b>: the lowest allowed price; clock pauses at this value.</li>
              <li>Use <b>Apply</b> to set values, <b>Start</b> to run, and <b>Stop</b> to pause.</li>
              <li>Winner is the first student who accepts a price (server resolves ties by timestamp).</li>
            </ul>
          </Alert>

          <Stack direction="row" spacing={2} sx={{ mb: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Start Price</Typography>
              <input
                type="number"
                placeholder="e.g. 100"
                value={startPrice}
                onChange={(e)=>setStartPrice(e.target.value)}
                style={{ width: '100%', padding: 8 }}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Drop Step</Typography>
              <input
                type="number"
                placeholder="e.g. 5"
                value={step}
                onChange={(e)=>setStep(e.target.value)}
                style={{ width: '100%', padding: 8 }}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Interval (sec)</Typography>
              <input
                type="number"
                placeholder="e.g. 1"
                value={intervalSec}
                onChange={(e)=>setIntervalSec(e.target.value)}
                style={{ width: '100%', padding: 8 }}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Min Price (floor)</Typography>
              <input
                type="number"
                placeholder="e.g. 20"
                value={minPrice}
                onChange={(e)=>setMinPrice(e.target.value)}
                style={{ width: '100%', padding: 8 }}
              />
            </Box>
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button variant="outlined" onClick={applyConfig}>Apply</Button>
            <Button variant="contained" onClick={startClock}>Start</Button>
            <Button variant="outlined" color="warning" onClick={stopClock}>Stop</Button>
          </Stack>

          <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary' }}>
            Current cfg: drop {cfg.step} every {Math.round((cfg.intervalMs||1000)/1000)}s, floor {cfg.minPrice}
          </Typography>

          {/* Teacher-only budget table (students can't see others' caps) */}
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>Participants' Budgets (Teacher Only)</Typography>
          {budgets.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No participants yet.</Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', rowGap: 0.5 }}>
              <Typography sx={{ fontWeight: 600 }}>Name</Typography>
              <Typography sx={{ fontWeight: 600 }}>Cap</Typography>
              <Divider sx={{ gridColumn: '1 / -1', my: 1 }} />
              {budgets.map((b, i) => (
                <React.Fragment key={i}>
                  <Typography>{b.name}</Typography>
                  <Typography>{b.cap}</Typography>
                </React.Fragment>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

export default DutchAuction;
