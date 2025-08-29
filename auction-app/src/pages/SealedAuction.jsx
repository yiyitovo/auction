// src/pages/SealedAuction.jsx — one-bid, EN instructions, show pricing & phases
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';
import { Box, Typography, Alert, Button, Divider } from '@mui/material';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";
const socket = io(BACKEND_URL);

function SealedAuction() {
  const { id: roomId } = useParams();
  const [username, setUsername] = useState('');
  const [myCap, setMyCap] = useState(null);
  const [pricing, setPricing] = useState('first'); // 'first' | 'second'
  const [status, setStatus] = useState('collecting'); // collecting | reveal | ended

  const [bid, setBid] = useState('');
  const [mySubmitted, setMySubmitted] = useState(false);
  const [mySubmittedAmount, setMySubmittedAmount] = useState(null);

  const [isHost, setIsHost] = useState(false);
  const [orders, setOrders] = useState([]); // host-only [{price,name,time}]
  const [winner, setWinner] = useState(null);

  useEffect(() => {
    let name = localStorage.getItem('username');
    if (!name) {
      name = prompt('Enter a username') || `User-${Math.random().toString(36).slice(2,6)}`;
      localStorage.setItem('username', name);
    }
    setUsername(name);

    // listeners
    const onBudget = ({ cap }) => setMyCap(cap);
    const onState = ({ status, pricing }) => {
      if (status) setStatus(status);
      if (pricing) setPricing(pricing);
    };
    const onYouAreHost = ({ roomId: rid, isHost }) => {
      if (rid === roomId) setIsHost(!!isHost);
    };
    const onOrders = (list) => { if (Array.isArray(list)) setOrders(list); };

    const onSubmitted = ({ ok }) => {
      if (ok) {
        setMySubmitted(true);
        setMySubmittedAmount(Number(bid));
        alert('Your sealed bid has been received. You cannot submit again.');
        setBid('');
      }
    };

    const onRejected = ({ reason, cap }) => {
      if (reason === 'OVER_BUDGET') alert(`Your bid exceeds your budget (My Cap = ${cap}).`);
      else if (reason === 'ALREADY_BID') alert('You already submitted a bid. Only one bid is allowed.');
      else if (reason === 'NOT_STARTED') alert('Bidding has not started yet.');
      else alert('Bid rejected.');
    };

    const onEnd = ({ winner }) => {
      setWinner(winner || null);
    };

    socket.on('your-budget', onBudget);
    socket.on('sealed-state', onState);
    socket.on('you-are-host', onYouAreHost);
    socket.on('order', onOrders);               // host-only
    socket.on('sealed-submitted', onSubmitted); // ack
    socket.on('bid-rejected', onRejected);
    socket.on('auction-ended', onEnd);

    // join room
    socket.emit('join-room', { roomId, username: name });
    socket.emit('join-sealed', { roomId });
    socket.emit('am-i-host', { roomId });

    return () => {
      socket.off('your-budget', onBudget);
      socket.off('sealed-state', onState);
      socket.off('you-are-host', onYouAreHost);
      socket.off('order', onOrders);
      socket.off('sealed-submitted', onSubmitted);
      socket.off('bid-rejected', onRejected);
      socket.off('auction-ended', onEnd);
    };
  }, [roomId, bid]);

  // === student submit ===
  const handleSubmitBid = () => {
    const a = parseFloat(bid);
    if (!Number.isFinite(a) || a <= 0) return;
    socket.emit('submit-bid', { roomId, amount: a });
  };

  // === teacher reveal ===
  const handleReveal = () => {
    socket.emit('reveal-bids', { roomId });
  };

  // Phase hint
  const phaseHint =
    status === 'collecting' ? 'Collecting sealed bids…'
    : status === 'reveal'   ? 'Revealing winner…'
    : status === 'ended'    ? 'Auction ended.'
    : status || '';

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" gutterBottom>Sealed Bid Auction</Typography>

      {/* Student-facing instructions */}
      <Alert severity="info" sx={{ mb: 2 }}>
        <b>How it works:</b> You submit exactly one sealed bid.
        The pricing rule is <b>{pricing === 'second' ? 'Second-Price' : 'First-Price'}</b>.
        <ul style={{ margin: '6px 0 0 18px' }}>
          <li><b>My Cap</b> is your personal budget ceiling — your bid must not exceed it.</li>
          <li>You can submit <b>only once</b>. After submission, you cannot edit your bid.</li>
          <li>If multiple highest bids are tied, the winner is selected <b>at random</b> with equal probability among the tied bidders.</li>
          <li>If it is Second-Price, the winner pays the highest losing bid (if none exists, pays their own bid).</li>
        </ul>
      </Alert>

      <Typography sx={{ mb: 1 }}>
        <b>User:</b> {username} &nbsp; | &nbsp; <b>My Cap:</b> {myCap ?? '—'} &nbsp; | &nbsp; <b>Pricing:</b> {pricing === 'second' ? 'Second-Price' : 'First-Price'}
      </Typography>
      <Alert severity={status === 'collecting' ? 'success' : status === 'ended' ? 'info' : 'warning'} sx={{ mb: 2 }}>
        {phaseHint}
      </Alert>

      {/* Submit area (students). Locked after first submission. */}
      <Box sx={{ display: 'flex', gap: 8, mb: 2 }}>
        <input
          type="number"
          value={bid}
          onChange={(e) => setBid(e.target.value)}
          placeholder={mySubmitted ? 'Bid already submitted' : 'Enter your sealed bid'}
          disabled={mySubmitted || status !== 'collecting'}
          style={{ flex: 1, padding: 10 }}
        />
        <Button
          variant="contained"
          onClick={handleSubmitBid}
          disabled={mySubmitted || status !== 'collecting'}
        >
          Submit Bid
        </Button>
      </Box>

      {mySubmitted && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Your bid has been recorded{typeof mySubmittedAmount === 'number' ? `: ${mySubmittedAmount}` : ''}. You cannot submit again.
        </Alert>
      )}

      {/* Teacher-only controls + live orders */}
      {isHost && (
        <Box sx={{ border: '1px solid #eee', borderRadius: 1, p: 2, mb: 2 }}>
          <Alert severity="success" sx={{ mb: 1 }}>
            <b>Teacher guide:</b> Pricing rule was chosen when creating the room. During the collecting phase,
            bids are hidden from students. Click <b>Reveal Winner</b> to finalize.
          </Alert>
          <Button variant="contained" onClick={handleReveal} disabled={status !== 'collecting'}>
            Reveal Winner (Host)
          </Button>

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>Orders (Host only)</Typography>
          {orders.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No orders yet.</Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', rowGap: 0.5 }}>
              <Typography sx={{ fontWeight: 600 }}>Price</Typography>
              <Typography sx={{ fontWeight: 600 }}>Name</Typography>
              <Typography sx={{ fontWeight: 600 }}>Time</Typography>
              <Divider sx={{ gridColumn: '1 / -1', my: 1 }} />
              {orders.map((o, i) => (
                <React.Fragment key={i}>
                  <Typography>{o.price}</Typography>
                  <Typography>{o.name}</Typography>
                  <Typography sx={{ color: 'text.secondary' }}>
                    {new Date(o.time).toLocaleTimeString()}
                  </Typography>
                </React.Fragment>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Winner display */}
      <Box sx={{ mt: 2 }}>
        {winner
          ? <Typography>Winner: <b>{winner.username}</b>, Amount: <b>{winner.amount}</b> <i>({winner.pricing})</i></Typography>
          : <Typography>No winner yet.</Typography>
        }
      </Box>
    </Box>
  );
}

export default SealedAuction;
