// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const englishAuction = require("./auctions/english");
const dutchAuction = require("./auctions/dutch");
const sealedAuction = require("./auctions/sealed");
const doubleAuction = require("./auctions/double");
const mongoose = require("mongoose");
const User = require("./models/User"); // 引入 User 模型

mongoose.connect("mongodb+srv://auction_user:w48VhluHpJZS8P9D@cluster0.ljwhyot.mongodb.net/auction-app?retryWrites=true&w=majority&appName=Cluster0", {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("✅ Connected to MongoDB");
}).catch(err => {
  console.error("❌ MongoDB connection error:", err);
});

const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5175', 'https://auction-zby2.onrender.com'],
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5175', 'https://auction-zby2.onrender.com'],
    methods: ['GET', 'POST']
  }
});


const rooms = {};

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });

    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        balance: user.balance
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


app.post("/register", async (req, res) => {
  const { username, password, role } = req.body;

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const newUser = new User({ username, password, role });
    await newUser.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
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

