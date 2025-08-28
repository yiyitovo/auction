// server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const englishAuction = require("./auctions/english");
const dutchAuction   = require("./auctions/dutch");
const sealedAuction  = require("./auctions/sealed");
const doubleAuction  = require("./auctions/double");

const User = require("./models/User");
const jwt = require("jsonwebtoken");

// =============== MongoDB ===============
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ Connected to MongoDB"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// =============== App / CORS / IO ===============
const app = express();
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5175",
    "https://auction-sooty.vercel.app",
    "https://auction-zby2.onrender.com"
  ],
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5175",
      "https://auction-sooty.vercel.app",
      "https://auction-zby2.onrender.com"
    ],
    methods: ["GET", "POST"]
  }
});

// =============== 内存房间状态 ===============
/**
 * rooms[id] = {
 *   id, type, name, owner, status,
 *   participants: [{ socketId, username }],
 *   balances: { [username]: cap },
 *   budgetConfig: { budgetStrategy, baseAmount, minAmount, maxAmount, step },
 *   bidHistory: [],
 *   activity: [],
 *   // english / double / sealed 的运行态见创建处
 * }
 */
const rooms = {};

// ======= 身份 / 权限（统一显示 username） =======
function labelFor(room, username, audience) {
  return username || 'Unknown';
}
function requireTeacher(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Auth required" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    if (payload.role !== "teacher") {
      return res.status(403).json({ message: "Teacher only" });
    }
    req.user = payload; // { id, username, role }
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

// ======= 隐私策略（全部公开姓名；se aled 收集阶段仅隐藏金额） =======
function policy(room, evtType, audience) {
  return 'public';
}
function viewFor(room, evt, audience) {
  const out = { ...evt, actor: labelFor(room, evt.actor, audience) };

  // sealed 在 collecting 阶段：参与端不看见金额，但姓名照常显示
  if ((room.type || '') === 'sealed' &&
      (room.status || '') === 'collecting' &&
      audience === 'participant' &&
      evt.type === 'sealed-bid') {
    delete out.amount;
    out.note = 'A sealed bid was received.';
  }

  // dutch 的时钟事件无身份
  if ((room.type || '') === 'dutch' && evt.type === 'clock') {
    delete out.actor;
  }
  return out;
}

// 统一记录 + 广播
function logAndBroadcast(io, rooms, roomId, evt) {
  const room = rooms[roomId];
  if (!room) return;
  const e = { ts: Date.now(), ...evt };

  room.activity = room.activity || [];
  room.activity.push(e);
  if (room.activity.length > 5000) room.activity.shift();

  io.to(roomId).emit('audit', viewFor(room, e, 'participant'));
  io.to(`host:${roomId}`).emit('audit', viewFor(room, e, 'host'));
}

// English 专用价格广播（最高出价者用真实 username）
function emitBidUpdate(io, rooms, roomId, username, amount) {
  const payload = { currentPrice: amount, highestBidder: username || null };
  io.to(roomId).emit('bid-update', payload);
  io.to(`host:${roomId}`).emit('bid-update', payload);
}

// 挂到 io 上，供拍卖模块调用
function attachPrivacyHelpers(io) {
  io.__privacy = { logAndBroadcast, emitBidUpdate, labelFor, viewFor, policy };
}
attachPrivacyHelpers(io);

// =============== 登录 / 注册 ===============
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign(
      { id: user._id.toString(), username: user.username, role: user.role || "teacher" },
      process.env.JWT_SECRET || "dev_secret",
      { expiresIn: "7d" }
    );
    res.json({
      success: true,
      token,
      user: { id: user._id, username: user.username, role: user.role || "teacher" }
    });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/register", async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: "Username already exists" });

    const newUser = new User({ username, password, role });
    await newUser.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// =============== 房间列表 / 创建房间 ===============
app.get("/auctions", (req, res) => {
  res.json(Object.values(rooms));
});

// ⭐ 创建房间（equal | random | asc）+ Double/Sealed 配置
app.post("/auctions", requireTeacher, (req, res) => {
  const {
    type,
    name,
    // 预算（无 desc）
    budgetStrategy = "equal",   // equal | random | asc
    baseAmount = 100,
    minAmount = 50,
    maxAmount = 150,
    step = 10,
    // English（可选）
    englishBase = 0,
    englishNoBidSec = 0,
    // Double / Sealed
    doubleMode = "call",  // Call | CDA
    sealedPricing = "first"     // first | second
  } = req.body;

  const id = Date.now().toString();
  rooms[id] = {
    id,
    type,
    name,
    owner: req.user.username,
    status: "waiting",
    participants: [],
    balances: {},
    budgetConfig: { budgetStrategy, baseAmount, minAmount, maxAmount, step },
    bidHistory: [],
    activity: []
  };

  const t = (type || '').toLowerCase();

  // English 初始化
  if (t === 'english') {
    rooms[id].english = {
      baseAmount: Number(englishBase) || 0,
      noBidAutoEndSec: Number(englishNoBidSec) || 0,
      _timer: null
    };
    rooms[id].currentPrice = Number(englishBase) || 0;
    rooms[id].highestBidder = null;
  }

  // Double 初始化
  if (t === 'double') {
    const mode = String(doubleMode || 'call').toLowerCase() === 'cda' ? 'cda' : 'call';
    rooms[id].double = { mode };
    rooms[id].buys   = [];
    rooms[id].sells  = [];
    rooms[id].trades = [];
    rooms[id].roles  = {}; // { [username]: 'buy' | 'sell' }
  }

  // Sealed 初始化
  if (t === 'sealed') {
    const pricing = String(sealedPricing || 'first').toLowerCase() === 'second' ? 'second' : 'first';
    rooms[id].sealedCfg = { pricing };
    rooms[id].bids = [];
  }

  res.json(rooms[id]);
  io.emit("auction-created", rooms[id]);
});

// =============== 房主查看接口 ===============
app.get("/auctions/:roomId/bids", (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room) return res.status(404).json({ message: "Room not found" });
  res.json(room.bidHistory || []);
});
app.get("/auctions/:roomId/balances", (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room) return res.status(404).json({ message: "Room not found" });
  res.json(room.balances || {});
});
app.get("/auctions/:roomId/activity", (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room) return res.status(404).json({ message: "Room not found" });
  res.json(room.activity || []);
});
app.get("/admin/auctions/:roomId/bids", requireTeacher, (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room) return res.status(404).json({ message: "Room not found" });
  res.json(room.bidHistory || []);
});
app.get("/admin/auctions/:roomId/balances", requireTeacher, (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room) return res.status(404).json({ message: "Room not found" });
  res.json(room.balances || {});
});

// =============== Socket.IO：join-room + 四类拍卖 ===============
io.on("connection", (socket) => {
  // ✅ 加入房间
  socket.on("join-room", ({ roomId, username }) => {
    const room = rooms[roomId];
    if (!room) return;

    socket.join(roomId);
    socket.username = username || `User-${socket.id.slice(0, 4)}`;
    socket.roomId = roomId;

    const isHost = !!room.owner && socket.username === room.owner;
    if (isHost) socket.join(`host:${roomId}`);

    // 记录参与者（去重）
    room.participants = room.participants || [];
    if (!room.participants.find(p => p.socketId === socket.id)) {
      room.participants.push({ socketId: socket.id, username: socket.username });
    }

    // ⭐ 分配预算（仅 equal / random / asc）
    room.balances = room.balances || {};
    const cfg = room.budgetConfig || {
      budgetStrategy: "equal", baseAmount: 100, minAmount: 50, maxAmount: 150, step: 10
    };
    const bs = String(cfg.budgetStrategy || "equal").toLowerCase();

    if (room.balances[socket.username] == null) {
      const count = Object.keys(room.balances).length; // 用于 asc
      let cap = Number(cfg.baseAmount);                // 默认 equal
      if (bs === "random") {
        const lo = Number(cfg.minAmount), hi = Number(cfg.maxAmount);
        cap = Math.floor(Math.random() * (hi - lo + 1)) + lo;
      } else if (bs === "asc") {
        cap = Number(cfg.baseAmount) + count * Number(cfg.step || 1);
      }
      room.balances[socket.username] = cap;
    }

    // 只私发给本人：显示 My Cap
    socket.emit("your-budget", { cap: room.balances[socket.username] });

    // 告诉前端谁是房主
    socket.emit('room-info', { roomId, owner: room.owner, isHost });

    // 记录加入动态
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'join', actor: socket.username });
  });

  // ✅ 安全退出
  socket.on('leave-room', () => {
    const { roomId, username } = socket;
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;

    socket.leave(roomId);
    room.participants = (room.participants || []).filter(p => p.socketId !== socket.id);
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'leave', actor: username || 'Unknown' });
  });

  // 四类拍卖
  englishAuction(io, socket, rooms);
  dutchAuction(io, socket, rooms);
  sealedAuction(io, socket, rooms);
  doubleAuction(io, socket, rooms);

  socket.on('disconnect', () => {
    const { roomId, username } = socket;
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].participants = rooms[roomId].participants.filter(p => p.socketId !== socket.id);
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'leave', actor: username || 'Unknown' });
  });
});

// =============== 启动 ===============
server.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});
