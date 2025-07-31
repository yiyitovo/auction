// auctions/double.js
module.exports = (io, socket, rooms) => {
  socket.on("join-double", ({ roomId }) => {
    socket.join(roomId);
    socket.on("submit-buy", ({ roomId, price }) => {
      const room = rooms[roomId];
      if (!room || room.type !== "double") return;
      room.buys = room.buys || [];
      room.buys.push({ id: socket.id, price });
    });
    socket.on("submit-sell", ({ roomId, price }) => {
      const room = rooms[roomId];
      if (!room || room.type !== "double") return;
      room.sells = room.sells || [];
      room.sells.push({ id: socket.id, price });
    });
    socket.on("match-double", ({ roomId }) => {
      const room = rooms[roomId];
      if (!room || room.type !== "double") return;
      const match = findMatch(room.buys, room.sells);
      io.to(roomId).emit("double-match", match);
    });
  });
};

function findMatch(buys, sells) {
  buys.sort((a, b) => b.price - a.price);
  sells.sort((a, b) => a.price - b.price);
  const matches = [];
  while (buys.length && sells.length && buys[0].price >= sells[0].price) {
    const buy = buys.shift();
    const sell = sells.shift();
    matches.push({ buyer: buy.id, seller: sell.id, price: (buy.price + sell.price) / 2 });
  }
  return matches;
}