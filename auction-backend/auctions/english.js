// auctions/english.js
module.exports = (io, socket, rooms) => {
  socket.on("join-english", ({ roomId }) => {
    socket.join(roomId);
    socket.on("place-bid", ({ roomId, amount }) => {
      const room = rooms[roomId];
      if (!room || room.type !== "english") return;
      if (!room.currentPrice || amount > room.currentPrice) {
        room.currentPrice = amount;
        io.to(roomId).emit("bid-update", { currentPrice: amount });
      }
    });
  });
};