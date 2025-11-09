/**
 * Main Application
 * Orchestrates all components and manages application state
 */

// Application state
const app = {
  canvas: null,
  ws: null,
  remoteCursors: new Map(),
  users: [],
  operationHistory: [],
  currentIndex: -1,
  fpsCounter: 0,
  lastFpsUpdate: Date.now()
};

/**
 * Initialize the application
 */
function initializeApp() {
  console.log('Initializing Collaborative Canvas...');
  
  // Initialize canvas
  const canvasElement = document.getElementById('canvas');
  app.canvas = new CanvasManager(canvasElement);
  
  // Initialize WebSocket
  app.ws = new WebSocketManager();
  
  // Setup WebSocket event handlers
  setupWebSocketHandlers();
  
  // Setup UI event handlers
  setupUIHandlers();
  
  // Setup keyboard shortcuts
  setupKeyboardShortcuts();
  
  // Connect to server
  app.ws.connect();
  
  // Start performance monitoring
  startPerformanceMonitoring();
  
  console.log('Application initialized');
}

/**
 * Setup WebSocket event handlers
 */
function setupWebSocketHandlers() {
  // Connection handlers
  app.ws.onConnected = () => {
    updateConnectionStatus(true);
    showNotification('Connected to server', 'success');
  };
  
  app.ws.onDisconnected = (reason) => {
    updateConnectionStatus(false);
    showNotification(`Disconnected: ${reason}`, 'error');
  };
  
  // Canvas state sync
  app.ws.onCanvasState = (state) => {
    app.operationHistory = state.operations;
    app.currentIndex = state.currentIndex;
    app.canvas.redrawFromHistory(state.operations);
  };
  
  // Remote drawing
  app.ws.onDrawPath = (data) => {
    if (data.points) {
      data.points.forEach(p => {
        app.canvas.drawPathSegment(p.point, data.color, data.lineWidth, data.tool);
      });
    }
  };
  
  app.ws.onStrokeComplete = (operation) => {
    app.operationHistory.push(operation);
    app.currentIndex++;
    app.canvas.drawPath(operation.data);
  };
  
  // Undo/Redo handlers
  app.ws.onUndo = (data) => {
    if (app.currentIndex >= 0) {
      app.currentIndex--;
      const activeOps = app.operationHistory.slice(0, app.currentIndex + 1);
      app.canvas.redrawFromHistory(activeOps);
    }
  };
  
  app.ws.onRedo = (data) => {
    if (app.currentIndex < app.operationHistory.length - 1) {
      app.currentIndex++;
      const activeOps = app.operationHistory.slice(0, app.currentIndex + 1);
      app.canvas.redrawFromHistory(activeOps);
    }
  };
  
  // Clear canvas
  app.ws.onClearCanvas = () => {
    app.operationHistory = [];
    app.currentIndex = -1;
    app.canvas.clearCanvas();
  };
  
  // User management
  app.ws.onUsersUpdate = (users) => {
    app.users = users;
    updateUsersList(users);
  };
  
  app.ws.onUserJoined = (user) => {
    showNotification(`${user.name} joined`, 'info');
  };
  
  app.ws.onUserLeft = (userId) => {
    removeRemoteCursor(userId);
  };
  
  // Cursor tracking
  app.ws.onCursorMove = (data) => {
    updateRemoteCursor(data);
  };
}

/**
 * Setup UI event handlers
 */
function setupUIHandlers() {
  // Tool selection
  document.getElementById('brushTool').addEventListener('click', () => {
    setTool('brush');
  });
  
  document.getElementById('eraserTool').addEventListener('click', () => {
    setTool('eraser');
  });
  
  // Color picker
  document.getElementById('colorPicker').addEventListener('input', (e) => {
    app.canvas.setColor(e.target.value);
  });
  
  // Preset colors
  document.querySelectorAll('.color-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color;
      app.canvas.setColor(color);
      document.getElementById('colorPicker').value = color;
    });
  });
  
  // Brush size
  const brushSize = document.getElementById('brushSize');
  const sizePreview = document.getElementById('sizePreview');
  const sizeValue = document.getElementById('sizeValue');
  
  brushSize.addEventListener('input', (e) => {
    const size = parseInt(e.target.value);
    app.canvas.setLineWidth(size);
    sizePreview.style.width = `${size}px`;
    sizePreview.style.height = `${size}px`;
    sizeValue.textContent = `${size}px`;
  });
  
  // Initialize size preview
  const initialSize = parseInt(brushSize.value);
  sizePreview.style.width = `${initialSize}px`;
  sizePreview.style.height = `${initialSize}px`;
  
  // Action buttons
  document.getElementById('undoBtn').addEventListener('click', () => {
    app.ws.sendUndo();
  });
  
  document.getElementById('redoBtn').addEventListener('click', () => {
    app.ws.sendRedo();
  });
  
  document.getElementById('clearBtn').addEventListener('click', () => {
    showConfirmModal();
  });
  
  // Modal event handlers
  document.getElementById('modalCancel').addEventListener('click', () => {
    hideConfirmModal();
  });
  
  document.getElementById('modalConfirm').addEventListener('click', () => {
    app.ws.sendClearCanvas();
    hideConfirmModal();
  });
  
  // Close modal on outside click
  document.getElementById('confirmModal').addEventListener('click', (e) => {
    if (e.target.id === 'confirmModal') {
      hideConfirmModal();
    }
  });
  
  // Room management
  document.getElementById('joinRoomBtn').addEventListener('click', () => {
    const roomId = document.getElementById('roomIdInput').value.trim();
    if (roomId) {
      app.ws.joinRoom(roomId);
      showNotification(`Joining room: ${roomId}`, 'info');
    }
  });
  
  // Canvas drawing events
  const canvas = document.getElementById('canvas');
  let lastSentPoint = null;
  
  canvas.addEventListener('mousedown', (e) => {
    lastSentPoint = null;
    app.canvas.startDrawing(e);
  });
  
  canvas.addEventListener('mousemove', (e) => {
    // Send cursor position
    if (app.ws.isConnected()) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      app.ws.sendCursorMove(x, y);
    }
    
    // Send drawing path
    if (app.canvas.isDrawing) {
      const point = app.canvas.draw(e);
      if (point && (!lastSentPoint || 
          Math.abs(point.x - lastSentPoint.x) > 2 || 
          Math.abs(point.y - lastSentPoint.y) > 2)) {
        const settings = app.canvas.getToolSettings();
        app.ws.sendDrawPath(point, settings.tool, settings.color, settings.lineWidth);
        lastSentPoint = point;
      }
    }
  });
  
  canvas.addEventListener('mouseup', () => {
    const operation = app.canvas.stopDrawing();
    if (operation && operation.points.length > 0) {
      app.ws.sendStrokeComplete(operation);
      app.operationHistory.push(operation);
      app.currentIndex++;
    }
  });
  
  canvas.addEventListener('mouseleave', () => {
    const operation = app.canvas.stopDrawing();
    if (operation && operation.points.length > 0) {
      app.ws.sendStrokeComplete(operation);
      app.operationHistory.push(operation);
      app.currentIndex++;
    }
  });
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Z = Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      app.ws.sendUndo();
    }
    
    // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z = Redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      app.ws.sendRedo();
    }
    
    // B = Brush
    if (e.key === 'b' || e.key === 'B') {
      setTool('brush');
    }
    
    // E = Eraser
    if (e.key === 'e' || e.key === 'E') {
      setTool('eraser');
    }
  });
}

/**
 * Set active tool
 */
function setTool(tool) {
  app.canvas.setTool(tool);
  
  // Update UI
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  if (tool === 'brush') {
    document.getElementById('brushTool').classList.add('active');
  } else if (tool === 'eraser') {
    document.getElementById('eraserTool').classList.add('active');
  }
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(connected) {
  const indicator = document.getElementById('statusIndicator');
  const text = document.getElementById('statusText');
  
  if (connected) {
    indicator.classList.remove('disconnected');
    indicator.classList.add('connected');
    text.textContent = 'Connected';
  } else {
    indicator.classList.remove('connected');
    indicator.classList.add('disconnected');
    text.textContent = 'Disconnected';
  }
}

/**
 * Update users list
 */
function updateUsersList(users) {
  const usersList = document.getElementById('usersList');
  const userCount = document.getElementById('userCount');
  
  userCount.textContent = users.length;
  
  usersList.innerHTML = users.map(user => `
    <div class="user-item">
      <div class="user-color" style="background: ${user.color}"></div>
      <div class="user-name">${user.name}${user.id === app.ws.userId ? ' (You)' : ''}</div>
    </div>
  `).join('');
}

/**
 * Update or create remote cursor
 */
function updateRemoteCursor(data) {
  const cursorsContainer = document.getElementById('cursors');
  let cursor = app.remoteCursors.get(data.userId);
  
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.className = 'remote-cursor';
    cursor.innerHTML = `
      <div class="cursor-dot" style="background: ${data.userColor}"></div>
      <div class="cursor-label">${data.userName}</div>
    `;
    cursorsContainer.appendChild(cursor);
    app.remoteCursors.set(data.userId, cursor);
  }
  
  cursor.style.left = `${data.x}px`;
  cursor.style.top = `${data.y}px`;
}

/**
 * Remove remote cursor
 */
function removeRemoteCursor(userId) {
  const cursor = app.remoteCursors.get(userId);
  if (cursor) {
    cursor.remove();
    app.remoteCursors.delete(userId);
  }
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  console.log(`[${type.toUpperCase()}]`, message);
  // Could implement toast notifications here
}

/**
 * Show confirmation modal
 */
function showConfirmModal() {
  const modal = document.getElementById('confirmModal');
  modal.classList.add('show');
  
  // Add escape key listener
  document.addEventListener('keydown', handleModalEscape);
}

/**
 * Hide confirmation modal
 */
function hideConfirmModal() {
  const modal = document.getElementById('confirmModal');
  modal.classList.remove('show');
  
  // Remove escape key listener
  document.removeEventListener('keydown', handleModalEscape);
}

/**
 * Handle escape key to close modal
 */
function handleModalEscape(e) {
  if (e.key === 'Escape') {
    hideConfirmModal();
  }
}

// Initialize app when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
