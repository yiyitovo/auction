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
  } catch (err) {
    console.error("LOGIN ERROR:", err); // 便于定位
    res.status(500).json({ message: "Server error" });
  }
});
