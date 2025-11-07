/**
 * Collaborative Canvas Server
 * WebSocket server for real-time drawing synchronization
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const RoomManager = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  // Increase max payload for large drawing operations
  maxHttpBufferSize: 1e6
});

const roomManager = new RoomManager();
const PORT = process.env.PORT || 3000;

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    stats: roomManager.getStats() 
  });
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`[Connection] User connected: ${socket.id}`);

  /**
   * Handle user joining a room
   */
  socket.on('join-room', (data) => {
    const roomId = data.roomId || 'default';
    const user = roomManager.addUserToRoom(roomId, socket.id, data.user);
    const room = roomManager.getRoomBySocketId(socket.id);

    // Join the socket room
    socket.join(roomId);

    // Send user their assigned data
    socket.emit('user-joined', {
      user,
      roomId
    });

    // Send current canvas state to the new user
    socket.emit('canvas-state', room.state.getState());

    // Notify other users in the room
    socket.to(roomId).emit('user-connected', {
      user,
      users: roomManager.getRoomUsers(roomId)
    });

    // Send all users to the new user
    socket.emit('users-list', {
      users: roomManager.getRoomUsers(roomId)
    });

    console.log(`[Join] User ${socket.id} joined room ${roomId}`);
  });

  /**
   * Handle drawing operations
   */
  socket.on('draw', (data) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    const user = roomManager.getUser(socket.id);
    
    // Add operation to room state
    const operation = room.state.addOperation({
      type: 'draw',
      data: data,
      userId: socket.id,
      userName: user.name,
      userColor: user.color
    });

    // Broadcast to all other users in the room
    socket.to(room.id).emit('draw', operation);
  });

  /**
   * Handle drawing path updates (for smooth real-time drawing)
   */
  socket.on('draw-path', (data) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    const user = roomManager.getUser(socket.id);

    // Broadcast immediately without storing (for performance)
    socket.to(room.id).emit('draw-path', {
      ...data,
      userId: socket.id,
      userColor: user.color
    });
  });

  /**
   * Handle stroke completion (store in history)
   */
  socket.on('stroke-complete', (data) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    const user = roomManager.getUser(socket.id);
    
    // Add complete stroke to history
    const operation = room.state.addOperation({
      type: 'stroke',
      data: data,
      userId: socket.id,
      userName: user.name,
      userColor: user.color
    });

    // Broadcast to all other users
    socket.to(room.id).emit('stroke-complete', operation);
  });

  /**
   * Handle global undo
   */
  socket.on('undo', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    const operation = room.state.undo();
    if (operation) {
      // Broadcast undo to all users including sender
      io.to(room.id).emit('undo', {
        operation,
        requestedBy: socket.id
      });
    }
  });

  /**
   * Handle global redo
   */
  socket.on('redo', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    const operation = room.state.redo();
    if (operation) {
      // Broadcast redo to all users including sender
      io.to(room.id).emit('redo', {
        operation,
        requestedBy: socket.id
      });
    }
  });

  /**
   * Handle cursor position updates
   */
  socket.on('cursor-move', (data) => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    const user = roomManager.getUser(socket.id);

    // Broadcast cursor position to other users
    socket.to(room.id).emit('cursor-move', {
      userId: socket.id,
      userName: user.name,
      userColor: user.color,
      x: data.x,
      y: data.y
    });
  });

  /**
   * Handle clear canvas
   */
  socket.on('clear-canvas', () => {
    const room = roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    // Clear room state
    room.state.clear();

    // Broadcast to all users
    io.to(room.id).emit('clear-canvas', {
      clearedBy: socket.id
    });
  });

  /**
   * Handle disconnection
   */
  socket.on('disconnect', () => {
    const room = roomManager.removeUser(socket.id);
    
    if (room) {
      // Notify other users
      socket.to(room.id).emit('user-disconnected', {
        userId: socket.id,
        users: roomManager.getRoomUsers(room.id)
      });
      
      console.log(`[Disconnect] User ${socket.id} left room ${room.id}`);
    }
  });

  /**
   * Handle errors
   */
  socket.on('error', (error) => {
    console.error(`[Error] Socket ${socket.id}:`, error);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║  Collaborative Canvas Server Running      ║
║  Port: ${PORT}                            ║
║  http://localhost:${PORT}                 ║
╚═══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
