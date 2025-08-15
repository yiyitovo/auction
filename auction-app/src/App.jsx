import { Routes, Route, Link } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import AuctionHall from './pages/AuctionHall';
import BiddingInterface from './pages/BiddingInterface';
import AuctionPage from './pages/AuctionPage';
import CreateAuction from './pages/CreateAuction';
import { AppBar, Toolbar, Button, Container } from '@mui/material';

function App() {
  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Button color="inherit" component={Link} to="/">Auction Hall</Button>
          <Button color="inherit" component={Link} to="/login">Login</Button>
          <Button color="inherit" component={Link} to="/register">Register</Button>
        </Toolbar>
      </AppBar>
      <Container>
        <Routes>
          <Route path="/" element={<AuctionHall />} />
          <Route path="/login" element={<Login />} />
          <Route path="/create" element={<CreateAuction />} />  
          <Route path="/register" element={<Register />} />
          <Route path="/auction/:id" element={<AuctionPage />} />
        </Routes>
      </Container>
    </>
  );
}

export default App;

