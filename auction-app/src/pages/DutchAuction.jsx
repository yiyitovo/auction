import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const socket = io("https://auction-backend-k44x.onrender.com");

function DutchAuction() {
  const { id: roomId } = useParams();
  const [price, setPrice] = useState('');

  useEffect(() => {
    socket.emit('join-dutch', { roomId });
  }, [roomId]);

  const handleAccept = () => {
    socket.emit('accept-price', { roomId, price: parseFloat(price) });
  };

  return (
    <div>
      <h2>Dutch Auction</h2>
      <input
        type="number"
        placeholder="Accept price"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <button onClick={handleAccept}>Accept Price</button>
    </div>
  );
}

export default DutchAuction;
