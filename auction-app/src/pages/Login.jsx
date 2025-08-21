// src/pages/Login.jsx
import { useState } from 'react';
import { Box, TextField, Button, Typography, Alert } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = 'https://auction-backend-k44x.onrender.com';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data?.message || 'Login failed');
        setLoading(false);
        return;
      }
      // 保存登录信息（你项目其它页面在用这些 key）
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('role', data.user?.role || 'teacher'); // 教师端登录
      localStorage.setItem('username', data.user?.username || username);

      navigate('/'); // 回到大厅
    } catch (err) {
      setMsg('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 420, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" gutterBottom>Login</Typography>
      {msg && <Alert severity="error" sx={{ mb: 2 }}>{msg}</Alert>}

      <form onSubmit={onSubmit}>
        <TextField
          label="Username"
          fullWidth
          margin="normal"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          fullWidth
          margin="normal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          sx={{ mt: 2 }}
          disabled={loading}
        >
          {loading ? 'Signing in…' : 'Login'}
        </Button>
      </form>
    </Box>
  );
}
