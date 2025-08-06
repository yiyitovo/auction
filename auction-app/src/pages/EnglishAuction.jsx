import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const socket = io("https://auction-zby2.onrender.com");

function EnglishAuction() {
  const { id: roomId } = useParams();
  const [currentPrice, setCurrentPrice] = useState(null);
  const [bid, setBid] = useState('');

  useEffect(() => {
    socket.emit('join-english', { roomId });

    socket.on('bid-update', ({ currentPrice }) => {
      setCurrentPrice(currentPrice);
    });

    return () => {
      socket.off('bid-update');
    };
  }, [roomId]);

  const handlePlaceBid = () => {
    socket.emit('place-bid', { roomId, amount: parseFloat(bid) });
    setBid('');
  };

  return (
    <div>
      <h2>English Auction</h2>
      <p>Current Price: {currentPrice ?? "No bid yet"}</p>
      <input
        type="number"
        value={bid}
        onChange={(e) => setBid(e.target.value)}
        placeholder="Enter your bid"
      />
      <button onClick={handlePlaceBid}>Place Bid</button>
    </div>
  );
}

export default EnglishAuction;
