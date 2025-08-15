// src/App.jsx
import { Routes, Route, Link } from 'react-router-dom';
import { AppBar, Toolbar, Button, Container } from '@mui/material';

import Login from './pages/Login';
import Register from './pages/Register';
import AuctionHall from './pages/AuctionHall';
import CreateAuction from './pages/CreateAuction';

// 四个拍卖页
import EnglishAuction from './pages/EnglishAuction';
import DutchAuction from './pages/DutchAuction';
import SealedAuction from './pages/SealedAuction';
import DoubleAuction from './pages/DoubleAuction';

function App() {
  const isTeacher =
    typeof window !== 'undefined' && localStorage.getItem('role') === 'teacher';

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Button color="inherit" component={Link} to="/">Auction Hall</Button>
          {isTeacher && (
            <Button color="inherit" component={Link} to="/create">Create</Button>
          )}
          <Button color="inherit" component={Link} to="/login">Login</Button>
          <Button color="inherit" component={Link} to="/register">Register</Button>
        </Toolbar>
      </AppBar>

      <Container sx={{ mt: 2 }}>
        <Routes>
          <Route path="/" element={<AuctionHall />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/create" element={<CreateAuction />} />

          {/* 按类型的房间路由 */}
          <Route path="/english/:id" element={<EnglishAuction />} />
          <Route path="/dutch/:id" element={<DutchAuction />} />
          <Route path="/sealed/:id" element={<SealedAuction />} />
          <Route path="/double/:id" element={<DoubleAuction />} />

          {/* 兜底 */}
          <Route path="*" element={<div style={{ padding: 16 }}>Page not found</div>} />
        </Routes>
      </Container>
    </>
  );
}

export default App;
