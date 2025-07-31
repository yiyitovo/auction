// auctions/dutch.js
module.exports = (io, socket, rooms) => {
  socket.on("join-dutch", ({ roomId }) => {
    socket.join(roomId);
    socket.on("accept-price", ({ roomId, price }) => {
      const room = rooms[roomId];
      if (!room || room.type !== "dutch") return;
      room.accepted = { id: socket.id, price };
      io.to(roomId).emit("auction-ended", { winner: room.accepted });
    });
  });
};