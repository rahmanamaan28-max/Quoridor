// script.js
document.addEventListener('DOMContentLoaded', function() {
    const socket = io();
    const lobbyScreen = document.getElementById('lobby');
    const gameScreen = document.getElementById('game');
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalButton = document.getElementById('modal-button');
    
    let playerId = null;
    let roomId = null;
    let isHost = false;
    let currentPlayer = null;
    let players = [];
    let gameState = null;
    let selectedAction = null;
    let selectedPawn = null;
    let possibleMoves = [];
    let possibleWalls = [];
    
    // Generate random room code
    document.getElementById('generate-room').addEventListener('click', function() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        document.getElementById('room-id').value = result;
    });
    
    // Create room
    document.getElementById('create-room').addEventListener('click', function() {
        const playerCount = parseInt(document.getElementById('player-count').value);
        const moveTimer = parseInt(document.getElementById('move-timer').value);
        roomId = document.getElementById('room-id').value || generateRoomId();
        
        if (roomId.length < 4) {
            showModal('Error', 'Room code must be at least 4 characters long', 'Try Again');
            return;
        }
        
        socket.emit('create-room', {
            roomId,
            playerCount,
            moveTimer
        });
    });
    
    // Join room
    document.getElementById('join-room').addEventListener('click', function() {
        roomId = document.getElementById('room-id').value;
        
        if (!roomId) {
            showModal('Error', 'Please enter a room code', 'OK');
            return;
        }
        
        socket.emit('join-room', roomId);
    });
    
    // Start game
    document.getElementById('start-game').addEventListener('click', function() {
        socket.emit('start-game');
    });
    
    // Leave room
    document.getElementById('leave-room').addEventListener('click', function() {
        socket.emit('leave-room');
        resetLobby();
    });
    
    // Quit game
    document.getElementById('quit-game').addEventListener('click', function() {
        socket.emit('leave-room');
        resetLobby();
        showScreen('lobby');
    });
    
    // Game actions
    document.getElementById('move-pawn').addEventListener('click', function() {
        selectedAction = 'move';
        updateActionButtons();
        calculatePossibleMoves();
    });
    
    document.getElementById('place-wall').addEventListener('click', function() {
        selectedAction = 'wall';
        updateActionButtons();
        calculatePossibleWalls();
    });
    
    document.getElementById('end-turn').addEventListener('click', function() {
        socket.emit('end-turn');
    });
    
    // Socket event handlers
    socket.on('connect', function() {
        playerId = socket.id;
        document.getElementById('player-name').textContent = `Player ${playerId.substring(0, 5)}`;
    });
    
    socket.on('room-created', function(data) {
        isHost = true;
        roomId = data.roomId;
        updateLobby(data);
        showScreen('lobby');
    });
    
    socket.on('room-joined', function(data) {
        updateLobby(data);
        showScreen('lobby');
    });
    
    socket.on('room-update', function(data) {
        updateLobby(data);
    });
    
    socket.on('game-started', function(data) {
        gameState = data;
        renderGame();
        showScreen('game');
    });
    
    socket.on('game-update', function(data) {
        gameState = data;
        updateGame();
    });
    
    socket.on('player-turn', function(data) {
        currentPlayer = data.playerId;
        startTimer(data.timeLeft);
        updateTurnIndicator();
    });
    
    socket.on('game-over', function(data) {
        showModal('Game Over', `Player ${data.winner} has won the game!`, 'Back to Lobby');
        modalButton.addEventListener('click', function() {
            showScreen('lobby');
            resetGame();
        }, { once: true });
    });
    
    socket.on('error', function(data) {
        showModal('Error', data.message, 'OK');
    });
    
    function generateRoomId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    
    function showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenName).classList.add('active');
    }
    
    function showModal(title, message, buttonText) {
        modalTitle.textContent = title;
        modalMessage.textContent = message;
        modalButton.textContent = buttonText;
        modal.classList.add('active');
        
        modalButton.onclick = function() {
            modal.classList.remove('active');
        };
    }
    
    function updateLobby(data) {
        roomId = data.roomId;
        players = data.players;
        isHost = data.players.find(p => p.id === playerId)?.host || false;
        
        document.getElementById('room-code-display').textContent = roomId;
        const playersList = document.getElementById('players-in-room');
        playersList.innerHTML = '';
        
        players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `Player ${player.id.substring(0, 5)}`;
            if (player.host) {
                li.classList.add('host');
            }
            playersList.appendChild(li);
        });
        
        const gameControls = document.getElementById('game-controls');
        if (isHost) {
            gameControls.style.display = 'block';
        } else {
            gameControls.style.display = 'none';
        }
    }
    
    function resetLobby() {
        roomId = null;
        isHost = false;
        players = [];
        document.getElementById('room-code-display').textContent = '-';
        document.getElementById('players-in-room').innerHTML = '';
        document.getElementById('game-controls').style.display = 'none';
    }
    
    function renderGame() {
        const board = document.getElementById('game-board');
        board.innerHTML = '';
        
        // Create board cells
        for (let y = 0; y < 9; y++) {
            for (let x = 0; x < 9; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.x = x;
                cell.dataset.y = y;
                board.appendChild(cell);
            }
        }
        
        // Render pawns
        gameState.players.forEach(player => {
            const pawn = document.createElement('div');
            pawn.className = `pawn player-${player.color}`;
            pawn.style.gridColumn = player.position.x + 1;
            pawn.style.gridRow = player.position.y + 1;
            pawn.dataset.player = player.id;
            board.appendChild(pawn);
        });
        
        // Render existing walls
        gameState.walls.forEach(wall => {
            placeWallOnBoard(wall);
        });
        
        updateGame();
    }
    
    function updateGame() {
        // Update player list
        const playersList = document.getElementById('players-turn-list');
        playersList.innerHTML = '';
        
        gameState.players.forEach(player => {
            const li = document.createElement('li');
            if (player.id === currentPlayer) {
                li.classList.add('active');
            }
            
            const indicator = document.createElement('span');
            indicator.className = `player-indicator`;
            indicator.style.backgroundColor = getPlayerColor(player.color);
            
            li.appendChild(indicator);
            li.appendChild(document.createTextNode(`Player ${player.id.substring(0, 5)} - Walls: ${player.walls}`));
            
            playersList.appendChild(li);
        });
        
        // Update walls remaining for current player
        const currentPlayerData = gameState.players.find(p => p.id === playerId);
        if (currentPlayerData) {
            document.getElementById('walls-remaining').textContent = currentPlayerData.walls;
        }
        
        // Update room code
        document.getElementById('current-room').textContent = roomId;
    }
    
    function updateTurnIndicator() {
        const isMyTurn = currentPlayer === playerId;
        document.getElementById('end-turn').disabled = !isMyTurn;
        
        if (isMyTurn) {
            document.querySelector('.action-panel h3').textContent = 'Your Turn';
        } else {
            document.querySelector('.action-panel h3').textContent = 'Other Player\'s Turn';
        }
    }
    
    function startTimer(seconds) {
        const timerDisplay = document.getElementById('move-timer-display');
        timerDisplay.textContent = `${seconds}s`;
        
        // Simple timer implementation
        let timeLeft = seconds;
        const timerInterval = setInterval(() => {
            timeLeft--;
            timerDisplay.textContent = `${timeLeft}s`;
            
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
            }
        }, 1000);
        
        return timerInterval;
    }
    
    function calculatePossibleMoves() {
        // This would calculate and highlight possible moves
        // Simplified for this example
        possibleMoves = [{x: 1, y: 1}, {x: 2, y: 1}]; // Example moves
        highlightPossibleMoves();
    }
    
    function calculatePossibleWalls() {
        // This would calculate and highlight possible wall placements
        // Simplified for this example
        possibleWalls = [{x: 3, y: 3, orientation: 'horizontal'}]; // Example wall
        highlightPossibleWalls();
    }
    
    function highlightPossibleMoves() {
        // Implementation for highlighting possible moves
    }
    
    function highlightPossibleWalls() {
        // Implementation for highlighting possible wall placements
    }
    
    function updateActionButtons() {
        const moveBtn = document.getElementById('move-pawn');
        const wallBtn = document.getElementById('place-wall');
        
        if (selectedAction === 'move') {
            moveBtn.classList.add('active');
            wallBtn.classList.remove('active');
        } else if (selectedAction === 'wall') {
            moveBtn.classList.remove('active');
            wallBtn.classList.add('active');
        } else {
            moveBtn.classList.remove('active');
            wallBtn.classList.remove('active');
        }
    }
    
    function getPlayerColor(colorIndex) {
        const colors = [
            'var(--player-1)', 
            'var(--player-2)', 
            'var(--player-3)', 
            'var(--player-4)', 
            'var(--player-5)', 
            'var(--player-6)'
        ];
        return colors[colorIndex - 1] || colors[0];
    }
    
    function placeWallOnBoard(wall) {
        const board = document.getElementById('game-board');
        const wallElement = document.createElement('div');
        wallElement.className = `wall ${wall.orientation}`;
        
        // Position the wall based on coordinates and orientation
        if (wall.orientation === 'horizontal') {
            wallElement.style.gridColumn = wall.x;
            wallElement.style.gridRow = wall.y;
            wallElement.style.marginTop = '40px'; // Adjust based on your board layout
        } else {
            wallElement.style.gridColumn = wall.x;
            wallElement.style.gridRow = wall.y;
            wallElement.style.marginLeft = '40px'; // Adjust based on your board layout
        }
        
        board.appendChild(wallElement);
    }
    
    function resetGame() {
        gameState = null;
        currentPlayer = null;
        selectedAction = null;
        possibleMoves = [];
        possibleWalls = [];
    }
    
    // Initialize the game
    showScreen('lobby');
});
