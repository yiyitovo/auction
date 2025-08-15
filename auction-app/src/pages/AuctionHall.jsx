// src/pages/AuctionHall.jsx
import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Box, Button, Typography, List, ListItem, ListItemText, Divider, Stack
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'https://auction-backend-k44x.onrender.com';

function AuctionHall() {
  const [rooms, setRooms] = useState([]);
  const navigate = useNavigate();

  const role = localStorage.getItem('role') || '';
  const isTeacher = role === 'teacher';

  useEffect(() => {
    axios.get(`${API_BASE}/auctions`)
      .then(res => setRooms(res.data || []))
      .catch(err => console.error('Failed to load rooms:', err));
  }, []);

  const pathFor = (room) => {
    const t = (room.type || '').toLowerCase();
    if (t === 'english') return `/english/${room.id}`;
    if (t === 'dutch')   return `/dutch/${room.id}`;
    if (t === 'sealed')  return `/sealed/${room.id}`;
    if (t === 'double')  return `/double/${room.id}`;
    return `/english/${room.id}`; // fallback
  };

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', mt: 4, p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">Auction Hall</Typography>
        {isTeacher && (
          <Button variant="contained" onClick={() => navigate('/create')}>
            Create Room
          </Button>
        )}
      </Stack>

      <List sx={{ mb: 2, border: '1px solid #ccc', borderRadius: 1 }}>
        {(rooms || []).length === 0 && (
          <ListItem><ListItemText primary="No auction rooms yet." /></ListItem>
        )}
        {(rooms || []).map((room) => (
          <div key={room.id}>
            <ListItem
              secondaryAction={
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => navigate(pathFor(room))}
                >
                  Enter
                </Button>
              }
            >
              <ListItemText
                primary={room.name}
                secondary={`Type: ${(room.type || '').toLowerCase()}${room.budgetConfig ? ` | Budget: ${room.budgetConfig.budgetStrategy}` : ''}`}
              />
            </ListItem>
            <Divider />
          </div>
        ))}
      </List>
    </Box>
  );
}

export default AuctionHall;
