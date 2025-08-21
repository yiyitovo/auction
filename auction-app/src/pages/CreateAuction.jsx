// src/pages/CreateAuction.jsx
import { useState } from 'react';
import {
  Box, Button, Typography, TextField, Select, MenuItem,
  FormControl, InputLabel, Stack, Alert
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'https://auction-backend-k44x.onrender.com';

function CreateAuction() {
  const navigate = useNavigate();

  const role  = localStorage.getItem('role') || '';
  const token = localStorage.getItem('authToken') || '';
  const isTeacher = role === 'teacher';

  const [name, setName] = useState('');
  const [type, setType] = useState('english'); // 小写
  const [budgetStrategy, setBudgetStrategy] = useState('equal'); // equal | random | asc
  const [baseAmount, setBaseAmount] = useState(100);
  const [minAmount, setMinAmount] = useState(50);
  const [maxAmount, setMaxAmount] = useState(150);
  const [msg, setMsg] = useState('');

  const pathFor = (room) => {
    const t = (room.type || '').toLowerCase();
    if (t === 'english') return `/english/${room.id}`;
    if (t === 'dutch')   return `/dutch/${room.id}`;
    if (t === 'sealed')  return `/sealed/${room.id}`;
    if (t === 'double')  return `/double/${room.id}`;
    return `/english/${room.id}`;
  };

  const handleCreate = async () => {
    setMsg('');
    if (!isTeacher) { setMsg('Only teachers can create rooms.'); return; }
    if (!name.trim()) { setMsg('Please enter room name.'); return; }
    if (budgetStrategy === 'random' && Number(minAmount) > Number(maxAmount)) {
      setMsg('Min Amount should not be greater than Max Amount.');
      return;
    }

    try {
      const body = {
        type,
        name,
        budgetStrategy,                 // 直接使用（已无 desc 选项）
        baseAmount: Number(baseAmount),
        minAmount: Number(minAmount),
        maxAmount: Number(maxAmount)
      };

      const res = await fetch(`${API_BASE}/auctions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data?.message || 'Create failed'); return; }
      navigate(pathFor(data));
    } catch {
      setMsg('Network error');
    }
  };

  if (!isTeacher) {
    return (
      <Box sx={{ maxWidth: 560, mx: 'auto', mt: 4, p: 2 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Students do not need to log in. Only teachers can create auction rooms.
        </Alert>
        <Button variant="outlined" onClick={() => navigate('/login')}>Go to Login</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" gutterBottom>Create Auction Room</Typography>
      {msg && <Alert severity="error" sx={{ mb: 2 }}>{msg}</Alert>}

      <TextField
        label="Room Name"
        fullWidth
        margin="normal"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <FormControl fullWidth margin="normal">
        <InputLabel>Type</InputLabel>
        <Select
          value={type}
          label="Type"
          onChange={(e) => setType(e.target.value)}
        >
          <MenuItem value="english">English</MenuItem>
          <MenuItem value="dutch">Dutch</MenuItem>
          <MenuItem value="sealed">Sealed</MenuItem>
          <MenuItem value="double">Double</MenuItem>
        </Select>
      </FormControl>

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
          {/* Descending 已移除 */}
        </Select>
      </FormControl>

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

      <Button variant="contained" fullWidth sx={{ mt: 2 }} onClick={handleCreate}>
        Create
      </Button>
    </Box>
  );
}

export default CreateAuction;
