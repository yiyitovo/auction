const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const englishAuction = require("./auctions/english");
const dutchAuction = require("./auctions/dutch");
const sealedAuction = require("./auctions/sealed");
const doubleAuction = require("./auctions/double");

const app = express();

app.use(cors({ origin: true, credentials: true }));

app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // 或写成：origin: ['http://localhost:5173', 'https://your-frontend.vercel.app']
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
  console.log("✅ Server running on http://localhost:3001");
});
