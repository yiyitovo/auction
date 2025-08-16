// src/pages/Login.jsx
import { useState } from 'react';
import { Box, TextField, Button, Typography, Alert, CircularProgress } from '@mui/material';

const BACKEND_URL = "https://auction-backend-k44x.onrender.com";

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setErr('');
    setLoading(true);
    try {
      console.log('[login] sending', { username }); // 调试
      const r = await fetch(`${BACKEND_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const text = await r.text();           // 先拿原始文本，避免 JSON 解析报错被吞
      console.log('[login] status', r.status, 'body:', text);
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text || 'Invalid JSON' }; }

      if (!r.ok) {
        setErr(data?.message || `HTTP ${r.status}`);
        setLoading(false);
        return;
      }

      // 期望后端返回: { token, user:{ username, role } }
      if (!data?.user?.username) {
        setErr('Login succeeded but payload is unexpected.');
        setLoading(false);
        return;
      }

      localStorage.setItem('authToken', data.token || '');
      localStorage.setItem('role', data.user.role || 'teacher');      // 容错：没有就当 teacher（开发期）
      localStorage.setItem('teacherUsername', data.user.username);
      localStorage.setItem('username', data.user.username);           // 确保进房识别为房主

      alert('Login success');
      window.location.href = '/';
    } catch (e) {
      console.error('[login] network error', e);
      setErr('Network error');
    } finally {
      setLoading(false);
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

      <Button
        variant="contained"
        fullWidth
        sx={{ mt: 2 }}
        onClick={handleLogin}
        disabled={loading}
      >
        {loading ? <CircularProgress size={22} sx={{ color: 'white' }} /> : 'Login'}
      </Button>

      <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
        Students do not need to log in. Teachers can log in here to create rooms and view real-name bids.
      </Typography>
    </Box>
  );
}

export default Login;
