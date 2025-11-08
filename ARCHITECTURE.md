# **Architecture**
## Data Flow Diagram
```
                                            User draws on canvas
                                                    │
                                                    ▼
                                            ┌──────────────────┐
                                            │   Canvas.js      │ 
                                            │   - mousemove    │ 
                                            │   - mouseup      │ 
                                            └────────┬─────────┘
                                                    │
                                                    ▼
                                            ┌──────────────────┐
                                            │  WebSocket.js    │
                                            │  - sendDrawPath  │ 
                                            └────────┬─────────┘
                                                    │
                                                    ▼ 
                                            ┌──────────────────┐
                                            │   Server.js      │ 
                                            │                  │ 
                                            └────────┬─────────┘
                                                    │
                                                    ▼ 
                                            ┌──────────────────┐
                                            │  Other Clients   │ 
                                            │  WebSocket.js    │ 
                                            └────────┬─────────┘
                                                    │
                                                    ▼
                                            ┌──────────────────┐
                                            │   Canvas.js      │ 
                                            │  drawPathSegment │ 
                                            └──────────────────┘
```
## **WebSocket Protocol**  

### **Client → Server Events**
- `join-room` — Join or create a room  
- `draw-path` — Send real-time drawing path (not stored)  
- `stroke-complete` — Finalize stroke to add to history  
- `undo` / `redo` — Request global undo or redo  
- `cursor-move` — Send current cursor position  
- `clear-canvas` — Clear the canvas for all users  

### **Server → Client Events**
- `user-joined` — Acknowledge new user with assigned color  
- `canvas-state` — Send complete current canvas state  
- `user-connected` / `user-disconnected` — Notify user list changes  
- `draw-path` — Broadcast real-time drawing data  
- `stroke-complete` — Broadcast completed strokes  
- `undo` / `redo` — Notify all clients to update canvas  
- `cursor-move` — Show other users’ cursor positions  

## **Undo/Redo Strategy**

- The server keeps **one shared history** of all drawing actions.  
- Every action (like drawing or clearing) is stored in order in `DrawingState.operations[]`.  
- A variable called `currentIndex` tracks which actions are active.  
- When someone presses **Undo**, the server moves one step back and tells all users to update their canvas.  
- Each user then **redraws the canvas** using only the actions up to the current index.  
- **Redo** works the same way but moves one step forward instead.  
- If a new stroke is drawn after undoing, the old undone actions are deleted.  
- This keeps everyone’s canvas in sync and prevents conflicts.

## **Performance Decisions**  
1. **Event Throttling:** Limit mouse move events to 60fps to reduce network load.  
2. **Event Batching:** Combine drawing points every 50ms before sending them for smoother performance.   
3. **Memory Management:** Keep only the latest 1000 drawing actions to save memory.  
4. **WebSocket Settings:** Allow auto-reconnect, use only WebSocket for faster updates, and limit data size to 1MB.  


## **Conflict Resolution**

- **Drawing at the Same Time:** Each stroke is independent and timestamped by the server. Draws are applied in the order received.
- **Overlapping Drawings:** Newer strokes appear on top of older ones. The eraser tool removes parts underneath.    
- **Lost Data:** If some drawing data is missed, the final stroke message (`stroke-complete`) fills in the missing parts.

