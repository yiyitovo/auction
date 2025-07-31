import { useEffect } from 'react';
import axios from 'axios';
import { useState } from 'react';
import { Box, Button, Typography, List, ListItem, ListItemText, TextField, Select, MenuItem, FormControl, InputLabel, Divider } from '@mui/material';
import { useNavigate } from 'react-router-dom';

function AuctionHall() {
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState('English');

  const navigate = useNavigate();

  useEffect(() => {
    axios.get('http://localhost:3001/auctions')
      .then(res => setRooms(res.data))
      .catch(err => console.error('Failed to load rooms:', err));
  }, []);


  const handleCreateRoom = async () => {
    if (newRoomName.trim() === '') return;
    try {
      const response = await axios.post('http://localhost:3001/auctions', {
        name: newRoomName,
        type: newRoomType
      });
      setRooms([...rooms, response.data]);
      setNewRoomName('');
      setNewRoomType('English');
    } catch (error) {
      console.error('Failed to create room:', error);
    }
  };


  const handleEnterRoom = (id) => {
    navigate(`/auction/${id}`);
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" gutterBottom>
        Auction Hall
      </Typography>

      <List sx={{ mb: 2, border: '1px solid #ccc', borderRadius: 1 }}>
        {rooms.map((room) => (
          <div key={room.id}>
            <ListItem
              secondaryAction={
                <Button variant="outlined" size="small" onClick={() => handleEnterRoom(room.id)}>
                  Enter
                </Button>
              }
            >
              <ListItemText primary={room.name} secondary={`Type: ${room.type}`} />
            </ListItem>
            <Divider />
          </div>
        ))}
        {rooms.length === 0 && (
          <ListItem>
            <ListItemText primary="No auction rooms yet." />
          </ListItem>
        )}
      </List>

      <Typography variant="h6" gutterBottom>
        Create New Auction
      </Typography>
      <TextField
        label="Auction Room Name"
        fullWidth
        margin="normal"
        value={newRoomName}
        onChange={(e) => setNewRoomName(e.target.value)}
      />
      <FormControl fullWidth margin="normal">
        <InputLabel>Type</InputLabel>
        <Select
          value={newRoomType}
          label="Type"
          onChange={(e) => setNewRoomType(e.target.value)}
        >
          <MenuItem value="English">English</MenuItem>
          <MenuItem value="Dutch">Dutch</MenuItem>
          <MenuItem value="Sealed">Sealed</MenuItem>
          <MenuItem value="Double">Double</MenuItem>
        </Select>
      </FormControl>
      <Button variant="contained" fullWidth sx={{ mt: 2 }} onClick={handleCreateRoom}>
        Create New Auction
      </Button>
    </Box>
  );
}

export default AuctionHall;




