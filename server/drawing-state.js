/**
 * Drawing State Manager
 * Manages the global canvas state including operation history for undo/redo
 */

class DrawingState {
  constructor() {
    // Operation history stack - stores all drawing operations
    this.operations = [];
    // Maximum history size to prevent memory issues
    this.maxHistorySize = 1000;
    // Current position in history (for undo/redo)
    this.currentIndex = -1;
  }

  /**
   * Add a new operation to the history
   * @param {Object} operation - Drawing operation with type, data, userId, timestamp
   */
  addOperation(operation) {
    // Remove any operations after current index (they were undone)
    if (this.currentIndex < this.operations.length - 1) {
      this.operations = this.operations.slice(0, this.currentIndex + 1);
    }

    // Add the new operation
    this.operations.push({
      ...operation,
      id: this.generateOperationId(),
      timestamp: Date.now()
    });

    this.currentIndex++;

    // Limit history size
    if (this.operations.length > this.maxHistorySize) {
      this.operations.shift();
      this.currentIndex--;
    }

    return this.operations[this.currentIndex];
  }

  /**
   * Undo the last operation
   * @returns {Object|null} The operation to undo
   */
  undo() {
    if (this.currentIndex >= 0) {
      const operation = this.operations[this.currentIndex];
      this.currentIndex--;
      return operation;
    }
    return null;
  }

  /**
   * Redo the last undone operation
   * @returns {Object|null} The operation to redo
   */
  redo() {
    if (this.currentIndex < this.operations.length - 1) {
      this.currentIndex++;
      return this.operations[this.currentIndex];
    }
    return null;
  }

  /**
   * Get all operations up to current index (for new users joining)
   * @returns {Array} All active operations
   */
  getActiveOperations() {
    return this.operations.slice(0, this.currentIndex + 1);
  }

  /**
   * Get the full state for synchronization
   * @returns {Object} Current state object
   */
  getState() {
    return {
      operations: this.getActiveOperations(),
      currentIndex: this.currentIndex
    };
  }

  /**
   * Generate a unique operation ID
   * @returns {string} Unique ID
   */
  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear all operations
   */
  clear() {
    this.operations = [];
    this.currentIndex = -1;
  }
}

module.exports = DrawingState;
