/**
 * Canvas Manager
 * Handles all canvas drawing operations with efficient rendering
 */

class CanvasManager {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { 
      willReadFrequently: false,
      alpha: false 
    });
    
    // Drawing state
    this.isDrawing = false;
    this.currentPath = [];
    this.tool = 'brush'; // 'brush' or 'eraser'
    this.color = '#000000';
    this.lineWidth = 3;
    
    // Operation history for local rendering
    this.operations = [];
    this.currentOperationIndex = -1;
    
    // Performance optimization
    this.lastDrawTime = 0;
    this.drawThrottle = 16; // ~60fps
    this.pathBuffer = [];
    
    // Initialize canvas
    this.initializeCanvas();
    // Event listeners are managed by main.js for WebSocket integration
  }

  /**
   * Initialize canvas with proper dimensions
   */
  initializeCanvas() {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Set default canvas properties
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.clearCanvas();
  }

  /**
   * Resize canvas to fill container while maintaining drawing
   */
  resizeCanvas() {
    const container = this.canvas.parentElement;
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    // Save current canvas content
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    tempCtx.drawImage(this.canvas, 0, 0);
    
    // Resize
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    
    // Restore content
    this.ctx.drawImage(tempCanvas, 0, 0);
  }

  /**
   * Setup mouse and touch event listeners
   */
  setupEventListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
    this.canvas.addEventListener('mousemove', (e) => this.draw(e));
    this.canvas.addEventListener('mouseup', () => this.stopDrawing());
    this.canvas.addEventListener('mouseleave', () => this.stopDrawing());
    
    // Touch events for mobile support
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.startDrawing(this.getTouchPoint(touch));
    }, { passive: false });
    
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.draw(this.getTouchPoint(touch));
    }, { passive: false });
    
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.stopDrawing();
    });
  }

  /**
   * Get touch point coordinates
   */
  getTouchPoint(touch) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      clientX: touch.clientX,
      clientY: touch.clientY
    };
  }

  /**
   * Get mouse/touch coordinates relative to canvas
   */
  getCoordinates(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  /**
   * Start drawing
   */
  startDrawing(e) {
    this.isDrawing = true;
    const point = this.getCoordinates(e);
    this.currentPath = [point];
    
    // Begin path
    this.ctx.beginPath();
    this.ctx.moveTo(point.x, point.y);
  }

  /**
   * Draw on canvas
   */
  draw(e) {
    if (!this.isDrawing) return;
    
    const now = Date.now();
    if (now - this.lastDrawTime < this.drawThrottle) {
      // Buffer the point for later
      this.pathBuffer.push(this.getCoordinates(e));
      return;
    }
    
    this.lastDrawTime = now;
    const point = this.getCoordinates(e);
    
    // Add buffered points
    if (this.pathBuffer.length > 0) {
      this.pathBuffer.forEach(p => {
        this.currentPath.push(p);
        this.drawLine(this.currentPath[this.currentPath.length - 2], p);
      });
      this.pathBuffer = [];
    }
    
    // Draw current point
    this.currentPath.push(point);
    if (this.currentPath.length > 1) {
      const prevPoint = this.currentPath[this.currentPath.length - 2];
      this.drawLine(prevPoint, point);
    }
    
    // Return point for network transmission
    return point;
  }

  /**
   * Stop drawing
   */
  stopDrawing() {
    if (!this.isDrawing) return;
    
    this.isDrawing = false;
    
    // Flush any remaining buffered points
    if (this.pathBuffer.length > 0) {
      this.pathBuffer.forEach(p => {
        this.currentPath.push(p);
        if (this.currentPath.length > 1) {
          const prevPoint = this.currentPath[this.currentPath.length - 2];
          this.drawLine(prevPoint, p);
        }
      });
      this.pathBuffer = [];
    }
    
    // Create operation object
    const operation = {
      type: 'stroke',
      tool: this.tool,
      color: this.color,
      lineWidth: this.lineWidth,
      points: [...this.currentPath]
    };
    
    this.currentPath = [];
    return operation;
  }

  /**
   * Draw a line between two points
   */
  drawLine(from, to) {
    this.ctx.strokeStyle = this.tool === 'eraser' ? '#FFFFFF' : this.color;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.globalCompositeOperation = this.tool === 'eraser' ? 'destination-out' : 'source-over';
    
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();
  }

  /**
   * Draw a complete path (for remote users or history replay)
   */
  drawPath(path) {
    if (!path.points || path.points.length === 0) return;
    
    this.ctx.save();
    this.ctx.strokeStyle = path.tool === 'eraser' ? '#FFFFFF' : path.color;
    this.ctx.lineWidth = path.lineWidth;
    this.ctx.globalCompositeOperation = path.tool === 'eraser' ? 'destination-out' : 'source-over';
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    
    this.ctx.beginPath();
    this.ctx.moveTo(path.points[0].x, path.points[0].y);
    
    for (let i = 1; i < path.points.length; i++) {
      this.ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    
    this.ctx.stroke();
    this.ctx.restore();
  }

  /**
   * Draw a smooth path segment (for real-time updates)
   */
  drawPathSegment(point, color, lineWidth, tool = 'brush') {
    this.ctx.save();
    this.ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    
    this.ctx.beginPath();
    this.ctx.arc(point.x, point.y, lineWidth / 2, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.restore();
  }

  /**
   * Redraw canvas from operation history
   */
  redrawFromHistory(operations) {
    this.clearCanvas();
    operations.forEach(op => {
      if (op.data && op.data.points) {
        this.drawPath(op.data);
      }
    });
  }

  /**
   * Clear the canvas
   */
  clearCanvas() {
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Set drawing tool
   */
  setTool(tool) {
    this.tool = tool;
    this.canvas.classList.toggle('eraser', tool === 'eraser');
  }

  /**
   * Set drawing color
   */
  setColor(color) {
    this.color = color;
  }

  /**
   * Set line width
   */
  setLineWidth(width) {
    this.lineWidth = width;
  }

  /**
   * Get current tool settings
   */
  getToolSettings() {
    return {
      tool: this.tool,
      color: this.color,
      lineWidth: this.lineWidth
    };
  }

  /**
   * Export canvas as image
   */
  exportImage() {
    return this.canvas.toDataURL('image/png');
  }

  /**
   * Load image to canvas
   */
  loadImage(dataUrl) {
    const img = new Image();
    img.onload = () => {
      this.ctx.drawImage(img, 0, 0);
    };
    img.src = dataUrl;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CanvasManager;
}
