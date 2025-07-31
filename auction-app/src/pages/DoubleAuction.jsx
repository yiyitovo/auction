import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const socket = io("http://localhost:3001");

function DoubleAuction() {
  const { id: roomId } = useParams();
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    socket.emit('join-double', { roomId });

    socket.on('double-match', (matchList) => {
      setMatches(matchList);
    });

    return () => {
      socket.off('double-match');
    };
  }, [roomId]);

  const handleSubmitBuy = () => {
    socket.emit('submit-buy', { roomId, price: parseFloat(buyPrice) });
    setBuyPrice('');
  };

  const handleSubmitSell = () => {
    socket.emit('submit-sell', { roomId, price: parseFloat(sellPrice) });
    setSellPrice('');
  };

  const handleMatch = () => {
    socket.emit('match-double', { roomId });
  };

  return (
    <div>
      <h2>Double Auction</h2>
      <input
        type="number"
        value={buyPrice}
        onChange={(e) => setBuyPrice(e.target.value)}
        placeholder="Buy Price"
      />
      <button onClick={handleSubmitBuy}>Submit Buy</button>

      <input
        type="number"
        value={sellPrice}
        onChange={(e) => setSellPrice(e.target.value)}
        placeholder="Sell Price"
      />
      <button onClick={handleSubmitSell}>Submit Sell</button>

      <button onClick={handleMatch}>Match</button>

      <div>
        {matches.map((m, index) => (
          <p key={index}>Buyer: {m.buyer}, Seller: {m.seller}, Price: {m.price}</p>
        ))}
      </div>
    </div>
  );
}

export default DoubleAuction;
