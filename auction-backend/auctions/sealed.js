// auctions/sealed.js
module.exports = (io, socket, rooms) => {
  socket.on("join-sealed", ({ roomId }) => {
    socket.join(roomId);
    socket.on("submit-bid", ({ roomId, amount }) => {
      const room = rooms[roomId];
      if (!room || room.type !== "sealed") return;
      room.bids = room.bids || [];
      room.bids.push({ id: socket.id, amount });
    });
    socket.on("reveal-bids", ({ roomId }) => {
      const room = rooms[roomId];
      if (!room || room.type !== "sealed") return;
      const winner = room.bids.reduce((max, b) => (b.amount > max.amount ? b : max), { amount: 0 });
      io.to(roomId).emit("auction-ended", { winner });
    });
  });
};