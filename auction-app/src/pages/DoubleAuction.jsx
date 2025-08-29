// src/pages/DoubleAuction.jsx — MUI 风格统一版 + Online + OrderBook (CDA: all / Call: teacher-only) + Teacher submit
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';
import { Box, Typography, Alert, Button, Divider, TextField, Chip, Stack, ToggleButtonGroup, ToggleButton } from '@mui/material';

const BACKEND_URL = 'https://auction-backend-k44x.onrender.com';
const socket = io(BACKEND_URL);

export default function DoubleAuction() {
  const { id: roomId } = useParams();

  const [username, setUsername] = useState('');
  const [myCap, setMyCap] = useState(null);
  const [role, setRole] = useState(null);      // 'buy' | 'sell' | null（学生自动分配；老师默认 null）
  const [mode, setMode] = useState('cda');     // 'cda' | 'call'
  const [status, setStatus] = useState('waiting'); // 'waiting' | 'running' | 'paused' ...
  const [isHost, setIsHost] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  const [online, setOnline] = useState(0);     // ★ 新增：在线人数

  const [price, setPrice] = useState('');

  // 成交列表（trades）
  const [trades, setTrades] = useState([]);

  // 订单簿（buys/sells）
  const [book, setBook] = useState({ buys: [], sells: [] }); // { price, name, time }

  // 老师可手动选择提交方向（老师也可以 submit）
  const [teacherSide, setTeacherSide] = useState('buy');

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
    const onTrades     = (list) => {
      const arr = Array.isArray(list) ? list : [];
      setTrades(t => [...t, ...arr]);
    };
    const onRejected   = ({ reason, cap }) => {
      const map = {
        OVER_BUDGET: `Price exceeds your cap: ${cap}`,
        NO_SIDE: 'Role not assigned.',
        SIDE_MISMATCH: 'Your role does not match this action.',
        NOT_RUNNING: 'The round has not started yet.',
      };
      alert(map[reason] || 'Rejected.');
    };

    // 新增：在线人数、订单簿
    const onPresence   = ({ online }) => setOnline(online);
    const onBook       = ({ buys, sells }) => {
      setBook({
        buys: Array.isArray(buys) ? buys : [],
        sells: Array.isArray(sells) ? sells : [],
      });
    };

    // 注册事件
    socket.on('room-info', onRoomInfo);
    socket.on('your-budget', onBudgetMine);
    socket.on('double-side', onSide);
    socket.on('double-state', onState);
    socket.on('double-match', onTrades);
    socket.on('bid-rejected', onRejected);

    socket.on('presence:update', onPresence);   // ★ 新增
    socket.on('double-book', onBook);           // ★ 新增

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
      socket.off('presence:update', onPresence);
      socket.off('double-book', onBook);
    };
  }, [roomId]);

  const isTeacherHost = isTeacher && isHost;

  const submit = () => {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return;

    // 老师可提交（不依赖自动分配的 role），学生用自己的 role
    const sideToUse = isTeacherHost && !role ? teacherSide : role;

    if (sideToUse === 'buy')  socket.emit('submit-buy',  { roomId, price: p });
    if (sideToUse === 'sell') socket.emit('submit-sell', { roomId, price: p });
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

  // 是否展示订单簿：CDA 全员；Call 仅教师
  const canSeeBook = mode === 'cda' || isTeacherHost;

  return (
    <Box sx={{ maxWidth: 980, mx: 'auto', mt: 4, p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="h5">Double Auction</Typography>
        <Chip size="small" label={mode === 'cda' ? 'CDA' : 'Call'} />
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
          <li>
            Your role is <b>{role ? role.toUpperCase() : (isTeacherHost ? 'Teacher' : 'assigning…')}</b>.
            {isTeacherHost && !role && ' (Teacher can choose BUY/SELL below)'}
          </li>
        </ul>
      </Alert>

      {/* 顶部信息行 */}
      <Typography sx={{ mb: 1 }}>
        <b>User:</b> {username} &nbsp; | &nbsp;
        <b>Online:</b> {online} &nbsp; | &nbsp;
        <b>Role:</b> {role ? role.toUpperCase() : (isTeacherHost ? 'Teacher' : '—')} &nbsp; | &nbsp;
        <b>My Cap:</b> {myCap ?? '—'} &nbsp; | &nbsp;
        <b>Mode:</b> {mode === 'cda' ? 'CDA' : 'Call'}
      </Typography>

      {/* 状态提示 */}
      <Alert severity={statusSeverity} sx={{ mb: 2 }}>
        {statusText}
      </Alert>

      {/* 输入区：老师也可提交。
          - 学生：照常根据自动 role 提交
          - 老师：如未被分配角色，可选择 BUY/SELL 再提交 */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        {isTeacherHost && !role && (
          <ToggleButtonGroup
            color="primary"
            exclusive
            value={teacherSide}
            onChange={(_, v) => v && setTeacherSide(v)}
            sx={{ mr: 1 }}
          >
            <ToggleButton value="buy">BUY</ToggleButton>
            <ToggleButton value="sell">SELL</ToggleButton>
          </ToggleButtonGroup>
        )}

        <TextField
          type="number"
          inputProps={{ min: 0, step: 'any' }}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={(isTeacherHost && !role)
            ? (teacherSide === 'sell' ? 'Enter SELL price' : 'Enter BUY price')
            : (role === 'sell' ? 'Enter SELL price' : 'Enter BUY price')}
          fullWidth
          disabled={status !== 'running' || (!role && !isTeacherHost)}
          sx={{ flex: 1, minWidth: 220 }}
        />
        <Button
          variant="contained"
          onClick={submit}
          disabled={status !== 'running' || (!role && !isTeacherHost)}
        >
          Submit
        </Button>
      </Box>

      {/* 订单簿（CDA：全员；Call：仅教师可见） */}
      {canSeeBook && (
        <Box sx={{ border: '1px solid #eee', borderRadius: 1, p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>Order</Typography>
          {book.buys.length + book.sells.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No orders yet.</Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: '0.7fr 0.7fr 1fr 1fr', rowGap: 0.5 }}>
              <Typography sx={{ fontWeight: 600 }}>Side</Typography>
              <Typography sx={{ fontWeight: 600 }}>Price</Typography>
              <Typography sx={{ fontWeight: 600 }}>Name</Typography>
              <Typography sx={{ fontWeight: 600 }}>Time</Typography>
              <Divider sx={{ gridColumn: '1 / -1', my: 1 }} />

              {/* Buys: 高价优先 */}
              {book.buys.map((o, i) => (
                <React.Fragment key={`b-${i}`}>
                  <Typography color="success.main">BUY</Typography>
                  <Typography>{o.price}</Typography>
                  <Typography>{o.name}</Typography>
                  <Typography sx={{ color: 'text.secondary' }}>{new Date(o.time).toLocaleTimeString()}</Typography>
                </React.Fragment>
              ))}
              {/* Sells: 低价优先 */}
              {book.sells.map((o, i) => (
                <React.Fragment key={`s-${i}`}>
                  <Typography color="error.main">SELL</Typography>
                  <Typography>{o.price}</Typography>
                  <Typography>{o.name}</Typography>
                  <Typography sx={{ color: 'text.secondary' }}>{new Date(o.time).toLocaleTimeString()}</Typography>
                </React.Fragment>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* 成交列表 */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Trades</Typography>
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

      {/* 教师控制区 */}
      {isTeacherHost && (
        <Box sx={{ border: '1px solid #eee', borderRadius: 1, p: 2, mt: 2 }}>
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
    </Box>
  );
}
