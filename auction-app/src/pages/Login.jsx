// src/pages/Login.jsx
import { useState } from 'react';
import { Box, TextField, Button, Typography, Alert } from '@mui/material';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  const handleLogin = async () => {
    setErr('');
    try {
      const r = await fetch(`${BACKEND_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data?.message || 'Login failed');
        return;
      }
      // 保存 token/role/用户名
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('role', data.user?.role || '');
      localStorage.setItem('teacherUsername', data.user?.username || '');
      // 同步拍卖昵称为教师用户名（确保进入房间时识别为房主）
      localStorage.setItem('username', data.user?.username || '');

      alert('Login success');
      // 跳转到教师面板或主页
      window.location.href = '/';
    } catch (e) {
      setErr('Network error');
    }
  };

  return (
    <Box sx={{ maxWidth: 400, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" gutterBottom>Login (Teacher)</Typography>
      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
      <TextField
        label="Username"
        fullWidth
        margin="normal"
        value={username}
        onChange={(e)=>setUsername(e.target.value)}
      />
      <TextField
        label="Password"
        type="password"
        fullWidth
        margin="normal"
        value={password}
        onChange={(e)=>setPassword(e.target.value)}
      />
      <Button variant="contained" fullWidth sx={{ mt: 2 }} onClick={handleLogin}>
        Login
      </Button>
      <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
        Students do not need to log in. Teachers can log in here to create rooms and view real-name bids.
      </Typography>
    </Box>
  );
}

export default Login;
