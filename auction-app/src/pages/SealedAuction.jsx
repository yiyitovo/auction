import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const socket = io("https://auction-zby2.onrender.com");

function SealedAuction() {
  const { id: roomId } = useParams();
  const [bid, setBid] = useState('');
  const [winner, setWinner] = useState(null);

  useEffect(() => {
    socket.emit('join-sealed', { roomId });

    socket.on('auction-ended', ({ winner }) => {
      setWinner(winner);
    });

    return () => {
      socket.off('auction-ended');
    };
  }, [roomId]);

  const handleSubmitBid = () => {
    socket.emit('submit-bid', { roomId, amount: parseFloat(bid) });
    setBid('');
  };

  const handleReveal = () => {
    socket.emit('reveal-bids', { roomId });
  };

  return (
    <div>
      <h2>Sealed Bid Auction</h2>
      <input
        type="number"
        value={bid}
        onChange={(e) => setBid(e.target.value)}
        placeholder="Enter sealed bid"
      />
      <button onClick={handleSubmitBid}>Submit Bid</button>
      <button onClick={handleReveal}>Reveal Winner</button>
      {winner && <p>Winner: {winner.id}, Amount: {winner.amount}</p>}
    </div>
  );
}

export default SealedAuction;
