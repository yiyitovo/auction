// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const englishAuction = require("./auctions/english");
const dutchAuction = require("./auctions/dutch");
const sealedAuction = require("./auctions/sealed");
const doubleAuction = require("./auctions/double");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const rooms = {};

app.post("/login", (req, res) => {
  res.json({ success: true });
});

app.post("/register", (req, res) => {
  res.json({ success: true });
});

app.get("/auctions", (req, res) => {
  res.json(Object.values(rooms));
});

app.post("/auctions", (req, res) => {
  const { type, name } = req.body;
  const id = Date.now().toString();
  rooms[id] = { id, type, name, status: "waiting" };
  res.json(rooms[id]);
  io.emit("auction-created", rooms[id]);
});

io.on("connection", (socket) => {
  englishAuction(io, socket, rooms);
  dutchAuction(io, socket, rooms);
  sealedAuction(io, socket, rooms);
  doubleAuction(io, socket, rooms);
});

server.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});

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
