import { useParams } from 'react-router-dom';
import { Box, Typography, TextField, Button } from '@mui/material';

function BiddingInterface() {
  const { id } = useParams();

  return (
    <Box sx={{ maxWidth: 400, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" gutterBottom>
        Bidding Interface
      </Typography>
      <Typography variant="body1" gutterBottom>
        Room ID: {id}
      </Typography>
      <TextField
        label="Your Bid Amount"
        type="number"
        fullWidth
        margin="normal"
      />
      <Button variant="contained" fullWidth sx={{ mt: 2 }}>
        Place Bid
      </Button>
      <Button variant="outlined" fullWidth sx={{ mt: 1 }}>
        Leave Auction
      </Button>
    </Box>
  );
}

export default BiddingInterface;

