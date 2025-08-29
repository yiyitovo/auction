// src/pages/DoubleAuction.jsx — MUI 风格统一版
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';
import { Box, Typography, Alert, Button, Divider, TextField, Chip, Stack } from '@mui/material';

const BACKEND_URL = 'https://auction-backend-k44x.onrender.com';
const socket = io(BACKEND_URL);

export default function DoubleAuction() {
  const { id: roomId } = useParams();

  const [username, setUsername] = useState('');
  const [myCap, setMyCap] = useState(null);
  const [role, setRole] = useState(null);      // 'buy' | 'sell' | null
  const [mode, setMode] = useState('cda');     // 'cda' | 'call'
  const [status, setStatus] = useState('waiting'); // 'waiting' | 'running' | others
  const [isHost, setIsHost] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  const [price, setPrice] = useState('');
  const [trades, setTrades] = useState([]);

  useEffect(() => {
    // 准备用户名与角色
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);
    setIsTeacher((localStorage.getItem('role') || '') === 'teacher');

    // 监听器
    const onRoomInfo   = ({ isHost }) => setIsHost(!!isHost);
    const onBudgetMine = ({ cap }) => setMyCap(cap);
    const onSide       = ({ side }) => setRole(side || null);
    const onState      = (s) => {
      if (s?.mode) setMode(s.mode);
      if (s?.status) setStatus(s.status);
    };
    const onTrades     = (list) => setTrades(t => [...t, ...(Array.isArray(list) ? list : [])]);

    const onRejected   = ({ reason, cap }) => {
      const map = {
        OVER_BUDGET: `Price exceeds your cap: ${cap}`,
        NO_SIDE: 'Role not assigned.',
        SIDE_MISMATCH: 'Your role does not match this action.',
        NOT_RUNNING: 'The round has not started yet.',
      };
      alert(map[reason] || 'Rejected.');
    };

    // 注册事件
    socket.on('room-info', onRoomInfo);
    socket.on('your-budget', onBudgetMine);
    socket.on('double-side', onSide);
    socket.on('double-state', onState);
    socket.on('double-match', onTrades);
    socket.on('bid-rejected', onRejected);

    // 加入房间与双边拍卖命名空间
    socket.emit('join-room',   { roomId, username: name });
    socket.emit('join-double', { roomId });

    return () => {
      socket.off('room-info', onRoomInfo);
      socket.off('your-budget', onBudgetMine);
      socket.off('double-side', onSide);
      socket.off('double-state', onState);
      socket.off('double-match', onTrades);
      socket.off('bid-rejected', onRejected);
    };
  }, [roomId]);

  const isTeacherHost = isTeacher && isHost;

  const submit = () => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;
    if (role === 'buy')  socket.emit('submit-buy',  { roomId, price: p });
    if (role === 'sell') socket.emit('submit-sell', { roomId, price: p });
    setPrice('');
  };

  const start = () => socket.emit('double-start', { roomId });
  const stop  = () => socket.emit('double-stop',  { roomId });

  // 与 SealedAuction 一致的“阶段提示”与 Alert 风格
  const statusText =
    status === 'waiting' ? 'Waiting for teacher to start…'
    : status === 'running' ? 'Round is running. You may submit quotes.'
    : `Status: ${status}`;

  const statusSeverity =
    status === 'running' ? 'success'
    : status === 'waiting' ? 'warning'
    : 'info';

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', mt: 4, p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="h5">Double Auction</Typography>
        <Chip
          size="small"
          label={mode === 'cda' ? 'CDA' : 'Call'}
        />
      </Stack>

      {/* 学生说明区（统一使用 Alert） */}
      <Alert severity="info" sx={{ mb: 2 }}>
        <b>How it works:</b>{' '}
        {mode === 'cda' ? (
          <>
            This is a <b>Continuous Double Auction (CDA)</b>. You are automatically assigned as a
            <b> Buyer</b> or <b>Seller</b>. Submit your quote any time; the market matches by
            <i> price–time priority</i>, and trades execute at the <i>resting</i> order&apos;s price.
          </>
        ) : (
          <>
            This is a <b>Call Double Auction</b>. Quotes are collected while the
            round is running. When the teacher clicks <i>Stop</i>, all feasible trades clear at a
            single <i>uniform price</i>.
          </>
        )}
        <ul style={{ margin: '6px 0 0 18px' }}>
          <li><b>My Cap</b> is your personal budget ceiling — your quote must not exceed it.</li>
          <li>Your role is <b>{role ? role.toUpperCase() : 'assigning…'}</b>. Enter a {role === 'sell' ? 'seller' : 'buyer'} price and submit.</li>
        </ul>
      </Alert>

      {/* 顶部信息行，与 SealedAuction 风格一致 */}
      <Typography sx={{ mb: 1 }}>
        <b>User:</b> {username} &nbsp; | &nbsp;
        <b>Role:</b> {role ? role.toUpperCase() : '—'} &nbsp; | &nbsp;
        <b>My Cap:</b> {myCap ?? '—'} &nbsp; | &nbsp;
        <b>Mode:</b> {mode === 'cda' ? 'CDA' : 'Call'}
      </Typography>

      {/* 状态提示 */}
      <Alert severity={statusSeverity} sx={{ mb: 2 }}>
        {statusText}
      </Alert>

      {/* 学生输入区：TextField + Button，与 SealedAuction 一致的交互节奏 */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
        <TextField
          type="number"
          inputProps={{ min: 0, step: 'any' }}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={role === 'sell' ? 'Enter your ask' : 'Enter your bid'}
          fullWidth
          disabled={status !== 'running' || !role}
        />
        <Button
          variant="contained"
          onClick={submit}
          disabled={status !== 'running' || !role}
        >
          {role === 'sell' ? 'Submit' : 'Submit'}
        </Button>
      </Box>

      {/* 教师控制区：统一用 Alert + Button + 说明 */}
      {isTeacherHost && (
        <Box sx={{ border: '1px solid #eee', borderRadius: 1, p: 2, mb: 2 }}>
          <Alert severity="success" sx={{ mb: 1 }}>
            <b>Teacher guide:</b> Press <b>Start</b> to open the round. Press <b>Stop</b> to pause
            the market. In <i>Call</i> mode, stopping will clear the market to a uniform price.
          </Alert>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={start} disabled={status === 'running'}>Start</Button>
            <Button variant="outlined"  onClick={stop}  disabled={status !== 'running'}>Stop</Button>
          </Stack>
        </Box>
      )}

      {/* 成交列表：与 Sealed 的 Orders 网格风格统一 */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Orders</Typography>
        {trades.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No trades yet.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', rowGap: 0.5 }}>
            <Typography sx={{ fontWeight: 600 }}>Price</Typography>
            <Typography sx={{ fontWeight: 600 }}>Buyer</Typography>
            <Typography sx={{ fontWeight: 600 }}>Seller</Typography>
            <Typography sx={{ fontWeight: 600 }}>Time</Typography>
            <Divider sx={{ gridColumn: '1 / -1', my: 1 }} />
            {trades.map((t, i) => (
              <React.Fragment key={i}>
                <Typography>{t.price}</Typography>
                <Typography>{t.buyer}</Typography>
                <Typography>{t.seller}</Typography>
                <Typography sx={{ color: 'text.secondary' }}>
                  {new Date(t.time).toLocaleTimeString()}
                </Typography>
              </React.Fragment>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
