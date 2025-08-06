// models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  balance: {
    type: Number,
    default: 1000 // 默认每个用户有1000资金，可以让老师修改
  },
  role: {
    type: String,
    enum: ['teacher', 'student'],
    default: 'student'
  }
});

module.exports = mongoose.model("User", UserSchema);
