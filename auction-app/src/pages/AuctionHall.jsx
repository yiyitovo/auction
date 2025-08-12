import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Box, Button, Typography, List, ListItem, ListItemText,
  TextField, Select, MenuItem, FormControl, InputLabel, Divider, Stack
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'https://auction-backend-k44x.onrender.com';

function AuctionHall() {
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState('English');

  // 新增：预算策略与参数
  const [budgetStrategy, setBudgetStrategy] = useState('equal'); // equal | random | asc | desc
  const [baseAmount, setBaseAmount] = useState(100);             // 用于 equal / asc / desc
  const [minAmount, setMinAmount] = useState(50);                // 用于 random
  const [maxAmount, setMaxAmount] = useState(150);               // 用于 random

  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API_BASE}/auctions`)
      .then(res => setRooms(res.data))
      .catch(err => console.error('Failed to load rooms:', err));
  }, []);

  const handleCreateRoom = async () => {
    if (newRoomName.trim() === '') return;

    // 简单校验
    if (budgetStrategy === 'random' && Number(minAmount) > Number(maxAmount)) {
      alert('Min Amount should not be greater than Max Amount.');
      return;
    }

    try {
      const body = {
        name: newRoomName,
        type: newRoomType,
        budgetStrategy,
        baseAmount: Number(baseAmount),
        minAmount: Number(minAmount),
        maxAmount: Number(maxAmount),
      };

      const response = await axios.post(`${API_BASE}/auctions`, body);
      setRooms([...rooms, response.data]);

      // 重置表单
      setNewRoomName('');
      setNewRoomType('English');
      setBudgetStrategy('equal');
      setBaseAmount(100);
      setMinAmount(50);
      setMaxAmount(150);
    } catch (error) {
      console.error('Failed to create room:', error);
      alert('Create room failed. Please check backend logs.');
    }
  };

  const handleEnterRoom = (id) => {
    navigate(`/auction/${id}`);
  };

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', mt: 4, p: 2 }}>
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
              <ListItemText
                primary={room.name}
                secondary={`Type: ${room.type}${room.budgetConfig ? ` | Budget: ${room.budgetConfig.budgetStrategy}` : ''}`}
              />
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

      {/* 预算策略选择 */}
      <FormControl fullWidth margin="normal">
        <InputLabel>Budget Strategy</InputLabel>
        <Select
          value={budgetStrategy}
          label="Budget Strategy"
          onChange={(e) => setBudgetStrategy(e.target.value)}
        >
          <MenuItem value="equal">Equal (everyone same)</MenuItem>
          <MenuItem value="random">Random (min~max)</MenuItem>
          <MenuItem value="asc">Ascending (by join order)</MenuItem>
          <MenuItem value="desc">Descending (by join order)</MenuItem>
        </Select>
      </FormControl>

      {/* 参数输入：random 用 min/max；其他用 baseAmount */}
      {budgetStrategy === 'random' ? (
        <Stack direction="row" spacing={2}>
          <TextField
            label="Min Amount"
            type="number"
            fullWidth
            margin="normal"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
          />
          <TextField
            label="Max Amount"
            type="number"
            fullWidth
            margin="normal"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
          />
        </Stack>
      ) : (
        <TextField
          label="Base Amount"
          type="number"
          fullWidth
          margin="normal"
          value={baseAmount}
          onChange={(e) => setBaseAmount(e.target.value)}
        />
      )}

      <Button variant="contained" fullWidth sx={{ mt: 2 }} onClick={handleCreateRoom}>
        Create New Auction
      </Button>
    </Box>
  );
}

export default AuctionHall;
