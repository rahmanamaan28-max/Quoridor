// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state storage
const rooms = new Map();

// Socket connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('create-room', (data) => {
        const { roomId, playerCount, moveTimer } = data;
        
        if (rooms.has(roomId)) {
            socket.emit('error', { message: 'Room already exists' });
            return;
        }
        
        // Create new room
        const room = {
            id: roomId,
            players: [],
            maxPlayers: playerCount,
            moveTimer: moveTimer,
            gameState: null,
            host: socket.id
        };
        
        rooms.set(roomId, room);
        
        // Add creating player to room
        joinRoom(socket, roomId);
    });
    
    socket.on('join-room', (roomId) => {
        joinRoom(socket, roomId);
    });
    
    socket.on('start-game', () => {
        const room = getPlayerRoom(socket.id);
        if (!room || room.host !== socket.id) return;
        
        // Initialize game state
        room.gameState = initializeGameState(room.players);
        
        // Notify all players
        io.to(room.id).emit('game-started', room.gameState);
        
        // Start first turn
        startPlayerTurn(room, room.gameState.currentPlayerIndex);
    });
    
    socket.on('end-turn', () => {
        const room = getPlayerRoom(socket.id);
        if (!room || !room.gameState) return;
        
        // Move to next player
        const nextPlayerIndex = (room.gameState.currentPlayerIndex + 1) % room.players.length;
        startPlayerTurn(room, nextPlayerIndex);
    });
    
    socket.on('move-pawn', (data) => {
        const room = getPlayerRoom(socket.id);
        if (!room || !room.gameState) return;
        
        // Validate and process move
        // This would contain game logic for valid moves
    });
    
    socket.on('place-wall', (data) => {
        const room = getPlayerRoom(socket.id);
        if (!room || !room.gameState) return;
        
        // Validate and process wall placement
        // This would contain game logic for valid wall placements
    });
    
    socket.on('leave-room', () => {
        leaveRoom(socket);
    });
    
    socket.on('disconnect', () => {
        leaveRoom(socket);
        console.log('User disconnected:', socket.id);
    });
});

function joinRoom(socket, roomId) {
    const room = rooms.get(roomId);
    if (!room) {
        socket.emit('error', { message: 'Room does not exist' });
        return;
    }
    
    if (room.players.length >= room.maxPlayers) {
        socket.emit('error', { message: 'Room is full' });
        return;
    }
    
    // Leave any current room
    leaveRoom(socket);
    
    // Join new room
    socket.join(roomId);
    
    // Add player to room
    const player = {
        id: socket.id,
        host: room.players.length === 0 // First player is host
    };
    
    room.players.push(player);
    
    // Update host if needed
    if (player.host) {
        room.host = socket.id;
    }
    
    // Notify all players in room
    io.to(roomId).emit('room-update', {
        roomId: room.id,
        players: room.players
    });
    
    socket.emit('room-joined', {
        roomId: room.id,
        players: room.players
    });
}

function leaveRoom(socket) {
    for (let [roomId, room] of rooms) {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            // Remove player from room
            room.players.splice(playerIndex, 1);
            
            // Clean up room if empty
            if (room.players.length === 0) {
                rooms.delete(roomId);
            } else {
                // Assign new host if needed
                if (room.host === socket.id) {
                    room.host = room.players[0].id;
                    room.players[0].host = true;
                }
                
                // Notify remaining players
                io.to(roomId).emit('room-update', {
                    roomId: room.id,
                    players: room.players
                });
            }
            
            socket.leave(roomId);
            break;
        }
    }
}

function getPlayerRoom(playerId) {
    for (let room of rooms.values()) {
        if (room.players.some(p => p.id === playerId)) {
            return room;
        }
    }
    return null;
}

function initializeGameState(players) {
    // Set up initial game state
    const gameState = {
        players: players.map((player, index) => ({
            id: player.id,
            color: index + 1,
            walls: 10, // Standard number of walls per player
            position: { x: 4, y: index === 0 ? 0 : 8 } // Starting positions
        })),
        walls: [],
        currentPlayerIndex: 0
    };
    
    return gameState;
}

function startPlayerTurn(room, playerIndex) {
    if (!room.gameState) return;
    
    room.gameState.currentPlayerIndex = playerIndex;
    const currentPlayerId = room.gameState.players[playerIndex].id;
    
    // Start timer for turn
    const timer = room.moveTimer;
    
    // Notify players
    io.to(room.id).emit('player-turn', {
        playerId: currentPlayerId,
        timeLeft: timer
    });
    
    // Set timeout for turn expiration
    room.turnTimeout = setTimeout(() => {
        // Auto-end turn if time runs out
        const nextPlayerIndex = (playerIndex + 1) % room.players.length;
        startPlayerTurn(room, nextPlayerIndex);
    }, timer * 1000);
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
