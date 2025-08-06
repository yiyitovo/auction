import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import EnglishAuction from './EnglishAuction';
import DutchAuction from './DutchAuction';
import SealedAuction from './SealedAuction';
import DoubleAuction from './DoubleAuction';
import axios from 'axios';

function AuctionPage() {
  const { id: roomId } = useParams();
  const [type, setType] = useState(null);

  useEffect(() => {
    axios.get('https://auction-zby2.onrender.com/auctions')
      .then(res => {
        const room = res.data.find(r => r.id.toString() === roomId);
        if (room) setType(room.type);
      });
  }, [roomId]);

  if (!type) return <div>Loading...</div>;

  if (type === 'English') return <EnglishAuction />;
  if (type === 'Dutch') return <DutchAuction />;
  if (type === 'Sealed') return <SealedAuction />;
  if (type === 'Double') return <DoubleAuction />;
  return <div>Unknown auction type.</div>;
}

export default AuctionPage;
