/**
 * Room Manager
 * Manages multiple drawing rooms and their states
 */

const DrawingState = require('./drawing-state');

class RoomManager {
  constructor() {
    // Map of roomId -> room data
    this.rooms = new Map();
    // Map of socketId -> roomId for quick lookup
    this.userRooms = new Map();
    // User colors for visual identification
    this.userColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', 
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
      '#F8B739', '#52B788', '#FF85A1', '#5DADE2'
    ];
  }

  /**
   * Create or get a room
   * @param {string} roomId - Room identifier
   * @returns {Object} Room data
   */
  getOrCreateRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        state: new DrawingState(),
        users: new Map(), // socketId -> user data
        createdAt: Date.now()
      });
    }
    return this.rooms.get(roomId);
  }

  /**
   * Add user to a room
   * @param {string} roomId - Room identifier
   * @param {string} socketId - Socket ID
   * @param {Object} userData - User information
   * @returns {Object} User data with assigned color
   */
  addUserToRoom(roomId, socketId, userData = {}) {
    const room = this.getOrCreateRoom(roomId);
    
    // Assign a color to the user
    const colorIndex = room.users.size % this.userColors.length;
    const user = {
      id: socketId,
      name: userData.name || `User ${room.users.size + 1}`,
      color: this.userColors[colorIndex],
      joinedAt: Date.now()
    };

    room.users.set(socketId, user);
    this.userRooms.set(socketId, roomId);

    return user;
  }

  /**
   * Remove user from their room
   * @param {string} socketId - Socket ID
   * @returns {Object|null} Room data if user was in a room
   */
  removeUser(socketId) {
    const roomId = this.userRooms.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.users.delete(socketId);
    this.userRooms.delete(socketId);

    // Clean up empty rooms after 5 minutes
    if (room.users.size === 0) {
      setTimeout(() => {
        const currentRoom = this.rooms.get(roomId);
        if (currentRoom && currentRoom.users.size === 0) {
          this.rooms.delete(roomId);
        }
      }, 5 * 60 * 1000);
    }

    return room;
  }

  /**
   * Get room by socket ID
   * @param {string} socketId - Socket ID
   * @returns {Object|null} Room data
   */
  getRoomBySocketId(socketId) {
    const roomId = this.userRooms.get(socketId);
    return roomId ? this.rooms.get(roomId) : null;
  }

  /**
   * Get user data
   * @param {string} socketId - Socket ID
   * @returns {Object|null} User data
   */
  getUser(socketId) {
    const room = this.getRoomBySocketId(socketId);
    return room ? room.users.get(socketId) : null;
  }

  /**
   * Get all users in a room
   * @param {string} roomId - Room identifier
   * @returns {Array} Array of user objects
   */
  getRoomUsers(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.users.values());
  }

  /**
   * Get room statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      totalRooms: this.rooms.size,
      totalUsers: this.userRooms.size,
      rooms: Array.from(this.rooms.values()).map(room => ({
        id: room.id,
        users: room.users.size,
        operations: room.state.operations.length
      }))
    };
  }
}

module.exports = RoomManager;
