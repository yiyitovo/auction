// src/pages/DutchAuction.jsx — v2025-08-17
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

    // 监听
    const onDutchPrice = ({ price }) => setCurrentPrice(price);
    const onEnd = ({ winner }) => {
      alert(winner ? `Winner: ${winner.username} @ ${winner.price}` : 'No winner');
    };
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

    // 入房
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

  // ===== 学生/所有人：接受当前价（无需输入金额） =====
  const handleAccept = () => {
    socket.emit('accept-price', { roomId });
  };

  // ===== 房主（老师）配置时钟 =====
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

      <Stack direction="row" spacing={3} sx={{ mb: 2 }} alignItems="center">
        <Typography><b>User:</b> {username}</Typography>
        <Typography><b>My Cap:</b> {myCap ?? '—'}</Typography>
        <Typography><b>Current Price:</b> {currentPrice ?? 'Not set'}</Typography>
        {msg && <Alert severity={status==='in-progress' ? 'success' : 'info'}>{msg}</Alert>}
      </Stack>

      {/* 预算列表（所有人可见） */}
      <Box sx={{ border: '1px solid #eee', borderRadius: 1, p: 2, mb: 2 }}>
        <Typography variant="subtitle1" gutterBottom>Budgets</Typography>
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

      {/* 老师（房主）控制区 */}
      {canControl && (
        <Box sx={{ border: '1px solid #ddd', borderRadius: 1, p: 2, mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>Clock Configuration (Teacher Only)</Typography>
          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <input
              type="number" placeholder="Start Price"
              value={startPrice} onChange={(e)=>setStartPrice(e.target.value)}
              style={{ flex: 1, padding: 8 }}
            />
            <input
              type="number" placeholder="Drop Step"
              value={step} onChange={(e)=>setStep(e.target.value)}
              style={{ flex: 1, padding: 8 }}
            />
            <input
              type="number" placeholder="Interval (sec)"
              value={intervalSec} onChange={(e)=>setIntervalSec(e.target.value)}
              style={{ flex: 1, padding: 8 }}
            />
            <input
              type="number" placeholder="Min Price (floor)"
              value={minPrice} onChange={(e)=>setMinPrice(e.target.value)}
              style={{ flex: 1, padding: 8 }}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <Button variant="outlined" onClick={applyConfig}>Apply</Button>
            <Button variant="contained" onClick={startClock}>Start</Button>
            <Button variant="outlined" color="warning" onClick={stopClock}>Stop</Button>
          </Stack>
          <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary' }}>
            Current cfg: drop {cfg.step} every {Math.round((cfg.intervalMs||1000)/1000)}s, floor {cfg.minPrice}
          </Typography>
        </Box>
      )}

      {/* 学生端/所有人：直接接受“当前价” */}
      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          onClick={handleAccept}
          disabled={status !== 'in-progress' || !Number.isFinite(Number(currentPrice))}
        >
          Accept Current Price
        </Button>
      </Stack>
    </Box>
  );
}

export default DutchAuction;
