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
    "https://auction-sooty.vercel.app",   // 你的前端 Vercel
    "https://auction-zby2.onrender.com"   // 如仍需要
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
 *   activity: []
 * }
 */
const rooms = {};

// ======= 身份标签（真名 / 半匿名 / 完全匿名） =======
function hash(s){ let h=0; for(const c of s) h=((h<<5)-h)+c.charCodeAt(0)|0; return h; }
function labelFor(room, username, audience) {
  // audience: 'host' | 'participant'
  if (audience === 'host') return username; // 房主始终真名
  return 'X-' + (Math.abs(hash(username)) % 1000); // 半匿名稳定代号
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

// ======= 隐私策略：不同机制、不同事件、不同观众 返回展示模式 =======
function policy(room, evtType, audience) {
  const t = (room.type || '').toLowerCase();
  const st = room.status || 'waiting';
  if (t === 'english') {
    if (evtType === 'bid') return audience === 'host' ? 'public' : 'masked';
    if (evtType === 'join' || evtType === 'leave') return audience === 'host' ? 'public' : 'anonymous';
    return audience === 'host' ? 'public' : 'masked';
  }
  if (t === 'dutch') {
    if (evtType === 'clock') return 'anonymous'; // 时钟无身份
    if (evtType === 'accept') return audience === 'host' ? 'public' : 'masked';
    return audience === 'host' ? 'public' : 'masked';
  }
  if (t === 'double') {
    if (evtType === 'order' || evtType === 'trade') return audience === 'host' ? 'public' : 'masked';
    return audience === 'host' ? 'public' : 'anonymous';
  }
  if (t === 'sealed') {
    if (st === 'collecting') {
      if (evtType === 'sealed-bid') return audience === 'host' ? 'public' : 'anonymous';
      return audience === 'host' ? 'public' : 'anonymous';
    }
    if (evtType === 'reveal' || st === 'reveal' || st === 'ended') {
      if (evtType === 'reveal' || evtType === 'win') return audience === 'host' ? 'public' : 'masked';
    }
    return audience === 'host' ? 'public' : 'anonymous';
  }
  return audience === 'host' ? 'public' : 'masked';
}

// ======= 生成面向某观众的事件视图 =======
function viewFor(room, evt, audience) {
  const mode = policy(room, evt.type, audience);
  let actor;
  if (mode === 'public') actor = evt.actor;
  else if (mode === 'masked') actor = labelFor(room, evt.actor, audience);
  else actor = 'XXXX';
  const out = { ...evt, actor };

  if (room.type === 'sealed' && (room.status || '') === 'collecting' && audience === 'participant') {
    if (evt.type === 'sealed-bid') {
      delete out.amount;
      out.note = 'A sealed bid was received.';
    }
  }
  if (room.type === 'dutch' && evt.type === 'clock') delete out.actor;

  return out;
}

// ======= 统一记录 + 广播 =======
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

// ======= English 专用最高出价者标签 =======
function emitBidUpdate(io, rooms, roomId, username, amount) {
  const room = rooms[roomId]; if (!room) return;
  io.to(roomId).emit('bid-update', {
    currentPrice: amount,
    highestBidder: labelFor(room, username, 'participant')
  });
  io.to(`host:${roomId}`).emit('bid-update', {
    currentPrice: amount,
    highestBidder: labelFor(room, username, 'host')
  });
}

// ======= 挂到 io 上 =======
function attachPrivacyHelpers(io) {
  io.__privacy = { logAndBroadcast, emitBidUpdate, labelFor, viewFor, policy };
}
attachPrivacyHelpers(io);

// =============== 登录 / 注册（可选用） ===============
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

// 创建房间（只支持 equal | random | asc）
app.post("/auctions", requireTeacher, (req, res) => {
  const {
    type,
    name,
    // 预算配置（无 desc）
    budgetStrategy = "equal",   // equal | random | asc
    baseAmount = 100,
    minAmount = 50,
    maxAmount = 150,
    step = 10,
    // English 专用配置（如需）
    englishBase = 0,
    englishNoBidSec = 0
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

  if ((type || '').toLowerCase() === 'english') {
    rooms[id].english = {
      baseAmount: Number(englishBase) || 0,
      noBidAutoEndSec: Number(englishNoBidSec) || 0,
      _timer: null
    };
    rooms[id].currentPrice = Number(englishBase) || 0;
    rooms[id].highestBidder = null;
  }

  res.json(rooms[id]);
  io.emit("auction-created", rooms[id]);
});




// =============== 房主查看接口：出价记录 / 初始余额 / 活动流 ===============
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

    // 告诉前端谁是房主（可用于显示 Host 标签）
    socket.emit('room-info', { roomId, owner: room.owner, isHost });

    // 记录加入动态
    io.__privacy?.logAndBroadcast?.(io, rooms, roomId, { type: 'join', actor: socket.username });
  });

  // ✅ 更安全的退出：一次注册，用 socket.roomId，不信任客户端传入
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
