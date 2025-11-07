/**
 * WebSocket Manager
 * Handles real-time communication with the server
 */

class WebSocketManager {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.roomId = 'default';
    this.userId = null;
    this.userColor = null;
    
    // Event handlers
    this.onConnected = null;
    this.onDisconnected = null;
    this.onUserJoined = null;
    this.onUserLeft = null;
    this.onDraw = null;
    this.onDrawPath = null;
    this.onStrokeComplete = null;
    this.onUndo = null;
    this.onRedo = null;
    this.onClearCanvas = null;
    this.onCursorMove = null;
    this.onUsersUpdate = null;
    this.onCanvasState = null;
    
    // Performance tracking
    this.latency = 0;
    this.lastPingTime = 0;
    
    // Event batching for performance
    this.pathBatch = [];
    this.batchTimeout = null;
    this.batchInterval = 50; // Send batched events every 50ms
  }

  /**
   * Connect to WebSocket server
   */
  connect(serverUrl = '') {
    try {
      this.socket = io(serverUrl, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        transports: ['websocket', 'polling']
      });

      this.setupSocketListeners();
      return true;
    } catch (error) {
      console.error('Failed to connect to server:', error);
      return false;
    }
  }

  /**
   * Setup socket event listeners
   */
  setupSocketListeners() {
    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connected = true;
      this.joinRoom(this.roomId);
      this.startLatencyTracking();
      
      if (this.onConnected) {
        this.onConnected();
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      this.connected = false;
      
      if (this.onDisconnected) {
        this.onDisconnected(reason);
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
    });

    // Room events
    this.socket.on('user-joined', (data) => {
      this.userId = data.user.id;
      this.userColor = data.user.color;
      console.log('Joined room:', data.roomId, 'as', data.user.name);
    });

    this.socket.on('canvas-state', (state) => {
      console.log('Received canvas state with', state.operations.length, 'operations');
      if (this.onCanvasState) {
        this.onCanvasState(state);
      }
    });

    this.socket.on('user-connected', (data) => {
      console.log('User connected:', data.user.name);
      if (this.onUserJoined) {
        this.onUserJoined(data.user);
      }
      if (this.onUsersUpdate) {
        this.onUsersUpdate(data.users);
      }
    });

    this.socket.on('user-disconnected', (data) => {
      console.log('User disconnected:', data.userId);
      if (this.onUserLeft) {
        this.onUserLeft(data.userId);
      }
      if (this.onUsersUpdate) {
        this.onUsersUpdate(data.users);
      }
    });

    this.socket.on('users-list', (data) => {
      if (this.onUsersUpdate) {
        this.onUsersUpdate(data.users);
      }
    });

    // Drawing events
    this.socket.on('draw', (operation) => {
      if (this.onDraw) {
        this.onDraw(operation);
      }
    });

    this.socket.on('draw-path', (data) => {
      if (this.onDrawPath) {
        this.onDrawPath(data);
      }
    });

    this.socket.on('stroke-complete', (operation) => {
      if (this.onStrokeComplete) {
        this.onStrokeComplete(operation);
      }
    });

    // Undo/Redo events
    this.socket.on('undo', (data) => {
      if (this.onUndo) {
        this.onUndo(data);
      }
    });

    this.socket.on('redo', (data) => {
      if (this.onRedo) {
        this.onRedo(data);
      }
    });

    // Canvas events
    this.socket.on('clear-canvas', (data) => {
      if (this.onClearCanvas) {
        this.onClearCanvas(data);
      }
    });

    // Cursor events
    this.socket.on('cursor-move', (data) => {
      if (this.onCursorMove) {
        this.onCursorMove(data);
      }
    });

    // Latency tracking
    this.socket.on('pong', () => {
      this.latency = Date.now() - this.lastPingTime;
    });
  }

  /**
   * Join a room
   */
  joinRoom(roomId, userName = null) {
    this.roomId = roomId;
    this.socket.emit('join-room', {
      roomId: roomId,
      user: {
        name: userName || `User ${Math.floor(Math.random() * 1000)}`
      }
    });
  }

  /**
   * Send drawing path update (real-time, not stored)
   */
  sendDrawPath(point, tool, color, lineWidth) {
    if (!this.connected) return;
    
    // Add to batch
    this.pathBatch.push({ point, tool, color, lineWidth });
    
    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    
    // Send batch after interval
    this.batchTimeout = setTimeout(() => {
      if (this.pathBatch.length > 0) {
        this.socket.emit('draw-path', {
          points: this.pathBatch,
          tool,
          color,
          lineWidth
        });
        this.pathBatch = [];
      }
    }, this.batchInterval);
  }

  /**
   * Send complete stroke (stored in history)
   */
  sendStrokeComplete(strokeData) {
    if (!this.connected) return;
    
    // Clear any pending path batch
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    this.pathBatch = [];
    
    this.socket.emit('stroke-complete', strokeData);
  }

  /**
   * Request undo
   */
  sendUndo() {
    if (!this.connected) return;
    this.socket.emit('undo');
  }

  /**
   * Request redo
   */
  sendRedo() {
    if (!this.connected) return;
    this.socket.emit('redo');
  }

  /**
   * Send cursor position
   */
  sendCursorMove(x, y) {
    if (!this.connected) return;
    
    // Throttle cursor updates
    if (!this.lastCursorUpdate || Date.now() - this.lastCursorUpdate > 100) {
      this.socket.emit('cursor-move', { x, y });
      this.lastCursorUpdate = Date.now();
    }
  }

  /**
   * Clear canvas
   */
  sendClearCanvas() {
    if (!this.connected) return;
    this.socket.emit('clear-canvas');
  }

  /**
   * Start tracking latency
   */
  startLatencyTracking() {
    setInterval(() => {
      if (this.connected) {
        this.lastPingTime = Date.now();
        this.socket.emit('ping');
      }
    }, 2000);
  }

  /**
   * Get current latency
   */
  getLatency() {
    return this.latency;
  }

  /**
   * Get connection status
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get user info
   */
  getUserInfo() {
    return {
      id: this.userId,
      color: this.userColor
    };
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebSocketManager;
}
