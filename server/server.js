
require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const authRoutes = require("./routes/authRoutes");
const messageRoutes = require("./routes/messageRoutes");

const app = express();
const server = http.createServer(app);

const allowedOrigin = process.env.CLIENT_URL;

const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    methods: ["GET", "POST"]
  }
});

app.set("io", io);

app.use(cors({
  origin: allowedOrigin
}));

app.use(express.json({ limit: "20kb" }));

app.get("/", (req, res) => {
  res.send("WebChat API is running.");
});

// Authenticate Socket.IO connections
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication required."));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    socket.user = decoded;
    next();
  } catch (error) {
    next(new Error("Invalid or expired session."));
  }
});

// Connect authenticated users to the private chat room.
io.on("connection", (socket) => {
  console.log(`${socket.user.username} connected.`);

  socket.join("private-chat");

  socket.on("disconnect", () => {
    console.log(`${socket.user.username} disconnected.`);
  });
});

// API routes
app.use("/api", authRoutes);
app.use("/api/messages", messageRoutes);

// Start server after connecting to MongoDB.
async function startServer() {
  try {
    if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
      throw new Error("MONGO_URI or JWT_SECRET is missing.");
    }

    if (!allowedOrigin) {
      throw new Error("CLIENT_URL is missing.");
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("Connected to MongoDB.");

    const PORT = process.env.PORT || 5000;

    server.listen(PORT, () => {
      console.log(`WebChat server running on port ${PORT}.`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
