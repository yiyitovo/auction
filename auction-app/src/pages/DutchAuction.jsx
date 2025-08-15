// src/pages/DutchAuction.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';
import { Box, Typography, TextField, Button, Stack, Alert } from '@mui/material';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function DutchAuction() {
  const { id: roomId } = useParams();
  const [username, setUsername] = useState('');
  const [currentPrice, setCurrentPrice] = useState(null);
  const [price, setPrice] = useState(''); // 学生接受价输入（可直接用当前价）
  const [cfg, setCfg] = useState({ step: 1, intervalMs: 1000, minPrice: 0, intervalSec: 1 });
  const [isHost, setIsHost] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);
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
      setMsg(status === 'in-progress' ? 'Clock running...' : status === 'paused' ? 'Paused' : status);
    };
    const onRoomInfo = ({ isHost }) => setIsHost(!!isHost);
    const onRejected = ({ reason, cap }) => {
      if (reason === 'OVER_BUDGET') alert(`Amount exceeds your cap: ${cap}`);
      else alert('Bid rejected');
    };

    socket.on('dutch-price', onDutchPrice);
    socket.on('auction-ended', onEnd);
    socket.on('dutch-state', onState);
    socket.on('room-info', onRoomInfo);
    socket.on('bid-rejected', onRejected);

    // 入房
    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-dutch', { roomId });

    return () => {
      socket.off('dutch-price', onDutchPrice);
      socket.off('auction-ended', onEnd);
      socket.off('dutch-state', onState);
      socket.off('room-info', onRoomInfo);
      socket.off('bid-rejected', onRejected);
    };
  }, [roomId]);

  // ===== 学生/所有人：接受价格 =====
  const handleAccept = () => {
    const p = Number(price || currentPrice);
    if (!Number.isFinite(p) || p <= 0) return;
    socket.emit('accept-price', { roomId, price: p });
    setPrice('');
  };

  // ===== 房主（老师）配置时钟 =====
  const [startPrice, setStartPrice] = useState('');
  const [step, setStep] = useState(1);
  const [intervalSec, setIntervalSec] = useState(1);
  const [minPrice, setMinPrice] = useState(0);

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
    <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" gutterBottom>Dutch Auction</Typography>
      <Typography variant="body1"><b>User:</b> {username}</Typography>
      <Typography variant="body1" sx={{ mb: 1 }}>
        <b>Current Price:</b> {currentPrice ?? 'Not set'}
      </Typography>
      {msg && <Alert severity="info" sx={{ mb: 2 }}>{msg}</Alert>}

      {/* 老师（房主）控制区 */}
      {canControl && (
        <Box sx={{ border: '1px solid #ddd', borderRadius: 1, p: 2, mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>Clock Configuration (Teacher Only)</Typography>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Start Price"
              type="number"
              value={startPrice}
              onChange={(e)=>setStartPrice(e.target.value)}
              fullWidth
            />
            <TextField
              label="Drop Step"
              type="number"
              value={step}
              onChange={(e)=>setStep(e.target.value)}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <TextField
              label="Interval (sec)"
              type="number"
              value={intervalSec}
              onChange={(e)=>setIntervalSec(e.target.value)}
              fullWidth
            />
            <TextField
              label="Min Price (floor)"
              type="number"
              value={minPrice}
              onChange={(e)=>setMinPrice(e.target.value)}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button variant="outlined" onClick={applyConfig}>Apply</Button>
            <Button variant="contained" onClick={startClock}>Start</Button>
            <Button variant="outlined" color="warning" onClick={stopClock}>Stop</Button>
          </Stack>
          <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary' }}>
            Current cfg: drop {cfg.step} every {Math.round((cfg.intervalMs||1000)/1000)}s, floor {cfg.minPrice}
          </Typography>
        </Box>
      )}

      {/* 学生端：接受当前价（也可输入更高的接受价） */}
      <Stack direction="row" spacing={2}>
        <TextField
          label="Accept Price"
          type="number"
          value={price}
          placeholder={currentPrice != null ? String(currentPrice) : '—'}
          onChange={(e)=>setPrice(e.target.value)}
          fullWidth
        />
        <Button variant="contained" onClick={handleAccept}>Accept</Button>
      </Stack>
    </Box>
  );
}

export default DutchAuction;
