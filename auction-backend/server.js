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
    "https://auction-zby2.onrender.com",     // 老地址（如仍需要）
    "https://auction-sooty.vercel.app",      // 你的前端 Vercel 地址
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
    ],
    methods: ["GET", "POST"]
  }
});

// =============== 内存房间状态 ===============
/**
 * rooms[id] = {
 *   id, type, name, status,
 *   participants: [{ socketId, username }],
 *   balances: { [username]: amount },
 *   budgetConfig: { budgetStrategy, baseAmount, minAmount, maxAmount, step },
 *   bidHistory: []
 * }
 */
const rooms = {};
// ======= 身份标签（真名 / 半匿名 / 完全匿名） =======
function hash(s){ let h=0; for(const c of s) h=((h<<5)-h)+c.charCodeAt(0)|0; return h; }
function labelFor(room, username, audience) {
  // audience: 'host' | 'participant'
  if (audience === 'host') return username; // 房主始终真名
  // 半匿名稳定代号
  return 'X-' + (Math.abs(hash(username)) % 1000);
}

// ======= 隐私策略：不同机制、不同事件、不同观众 返回展示模式 =======
// mode: 'public'(真名) | 'masked'(半匿名) | 'anonymous'(XXXX)
// sealed 的收集/揭标通过 room.status 区分：'collecting' / 'reveal' / 'ended'
function policy(room, evtType, audience) {
  const t = room.type;
  const st = room.status || 'waiting';
  if (t === 'english') {
    if (evtType === 'bid') return audience === 'host' ? 'public' : 'masked';
    if (evtType === 'join' || evtType === 'leave') return audience === 'host' ? 'public' : 'anonymous';
    return audience === 'host' ? 'public' : 'masked';
  }
  if (t === 'dutch') {
    if (evtType === 'clock') return 'anonymous'; // 时钟更新无身份
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
    // 揭标或结束阶段
    if (evtType === 'reveal' || st === 'reveal' || st === 'ended') {
      if (evtType === 'reveal' || evtType === 'win') return audience === 'host' ? 'public' : 'masked';
    }
    return audience === 'host' ? 'public' : 'anonymous';
  }
  // 兜底
  return audience === 'host' ? 'public' : 'masked';
}

// ======= 生成“面向某观众”的事件视图（按策略屏蔽身份/金额） =======
function viewFor(room, evt, audience) {
  const mode = policy(room, evt.type, audience);
  let actor;
  if (mode === 'public') actor = evt.actor;
  else if (mode === 'masked') actor = labelFor(room, evt.actor, audience);
  else actor = 'XXXX';

  const out = { ...evt, actor };

  // sealed 收集阶段：参与者不看金额/细节
  if (room.type === 'sealed' && (room.status || '') === 'collecting' && audience === 'participant') {
    if (evt.type === 'sealed-bid') {
      delete out.amount;
      out.note = 'A sealed bid was received.';
    }
  }
  // dutch 时钟：无身份
  if (room.type === 'dutch' && evt.type === 'clock') delete out.actor;

  return out;
}

// ======= 统一记录 + 广播（房主真名视图 / 参与者掩码视图） =======
function logAndBroadcast(io, rooms, roomId, evt) {
  const room = rooms[roomId];
  if (!room) return;
  const e = { ts: Date.now(), ...evt };     // evt: {type, actor, amount?...}
  room.activity = room.activity || [];
  room.activity.push(e);
  if (room.activity.length > 5000) room.activity.shift();

  io.to(roomId).emit('audit', viewFor(room, e, 'participant'));
  io.to(`host:${roomId}`).emit('audit', viewFor(room, e, 'host'));
}

// ======= 辅助：同时更新“最高出价者标签” =======
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


// =============== 登录 / 注册（保留你原来的） ===============
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

app.post("/auctions", (req, res) => {
  const {
    type,
    name,

    // 新增：预算配置（前端传入）
    budgetStrategy = "equal", // equal | random | asc | desc
    baseAmount = 100,
    minAmount = 50,
    maxAmount = 150,
    step = 10,                // asc/desc 的步长，可让前端传
  } = req.body;

  const id = Date.now().toString();
  rooms[id] = {
    id,
    type,
    name,
    status: "waiting",
    participants: [],
    balances: {},
    budgetConfig: { budgetStrategy, baseAmount, minAmount, maxAmount, step },
    bidHistory: []
  };

  res.json(rooms[id]);
  io.emit("auction-created", rooms[id]);
});

// =============== 房主查看接口：出价记录 / 初始余额 ===============
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

// =============== Socket.IO：通用 join-room + 四类拍卖 ===============
io.on("connection", (socket) => {
  // 通用：加入房间（记录 username、按策略分配余额）
  socket.on("join-room", ({ roomId, username }) => {
    const room = rooms[roomId];
    if (!room) return;

    socket.join(roomId);
    socket.username = username || `User-${socket.id.slice(0, 4)}`;

    // 记录参与者（去重）
    if (!room.participants.find(p => p.socketId === socket.id)) {
      room.participants.push({ socketId: socket.id, username: socket.username });
    }

    // 如果还没有分配余额，按策略一次性分配
    if (Object.keys(room.balances).length === 0 && room.participants.length > 0) {
      const cfg = room.budgetConfig || {};
      const usernames = room.participants.map(p => p.username);
      room.balances = allocateBalances(usernames, cfg);
      io.to(roomId).emit("balances-set", room.balances);
    }
  });

  // 四类拍卖（你已有的模块）
  englishAuction(io, socket, rooms);
  dutchAuction(io, socket, rooms);
  sealedAuction(io, socket, rooms);
  doubleAuction(io, socket, rooms);
});

// =============== 余额分配策略实现 ===============
function allocateBalances(
  usernames,
  { budgetStrategy = "equal", baseAmount = 100, minAmount = 50, maxAmount = 150, step = 10 } = {}
) {
  const out = {};
  if (budgetStrategy === "equal") {
    usernames.forEach(u => out[u] = Number(baseAmount));
  } else if (budgetStrategy === "random") {
    usernames.forEach(u => {
      const lo = Number(minAmount), hi = Number(maxAmount);
      out[u] = Math.floor(Math.random() * (hi - lo + 1)) + lo;
    });
  } else if (budgetStrategy === "asc") {
    usernames.forEach((u, i) => out[u] = Number(baseAmount) + i * Number(step));
  } else if (budgetStrategy === "desc") {
    usernames.forEach((u, i) => {
      const val = Number(baseAmount) - i * Number(step);
      out[u] = Math.max(0, val);
    });
  } else {
    // 兜底：等额
    usernames.forEach(u => out[u] = Number(baseAmount));
  }
  return out;
}

// =============== 启动 ===============
attachPrivacyHelpers(io);

server.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});
