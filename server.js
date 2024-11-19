const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const gridSize = 20;
const canvasWidth = 600;
const canvasHeight = 400;
const gameSpeed = 150; // Slow down the snake movement (150ms)
let food = { x: 100, y: 100 };
let obstacles = [];
let players = {}; // Keeps track of all players

app.use(express.static('public')); // Serve the game static files from the 'public' folder

// Heartbeat endpoint to prevent Render free-tier timeout
app.get('/heartbeat', (req, res) => {
  res.status(200).send('Server is alive!');
});

// Serve the game on the root URL
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/snake.html');
});

// Handle player connections
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Initialize the player's snake and properties
  players[socket.id] = {
    name: `Player_${socket.id.slice(0, 5)}`, // Generate a unique player name
    snake: [{ x: 200, y: 200 }],
    direction: 'RIGHT',
    score: 0,
    alive: true, // Mark the player as alive initially
  };

  // Notify other players of the new player joining
  socket.broadcast.emit('playerJoined', players[socket.id].name);

  // Send the current game state to the new player
  socket.emit('gameState', { players, food, obstacles });

  // Handle player movement
  socket.on('move', (direction) => {
    const player = players[socket.id];
    if (player && player.alive) {
      player.direction = direction;
    }
  });

  // Start the game when at least two players are ready
  socket.on('startGame', () => {
    if (Object.keys(players).length >= 2) {
      // Game loop to update the game state at regular intervals
      const gameInterval = setInterval(() => {
        for (const playerId in players) {
          const player = players[playerId];
          if (player.alive) {
            // Move the snake in the specified direction
            const head = player.snake[0];
            if (player.direction === 'UP') head.y -= gridSize;
            if (player.direction === 'DOWN') head.y += gridSize;
            if (player.direction === 'LEFT') head.x -= gridSize;
            if (player.direction === 'RIGHT') head.x += gridSize;

            // Add the new head to the snake
            player.snake.unshift({ x: head.x, y: head.y });

            // Check for food collision
            if (head.x === food.x && head.y === food.y) {
              player.score += 1;
              // Create new food at a random position
              food = {
                x: Math.floor(Math.random() * (canvasWidth / gridSize)) * gridSize,
                y: Math.floor(Math.random() * (canvasHeight / gridSize)) * gridSize,
              };
            } else {
              // Remove the last part of the snake (tail)
              player.snake.pop();
            }

            // Check for collisions with walls
            if (head.x < 0 || head.x >= canvasWidth || head.y < 0 || head.y >= canvasHeight) {
              player.alive = false;
            }

            // Check for collisions with other players' snakes
            for (const otherPlayerId in players) {
              if (otherPlayerId !== playerId && players[otherPlayerId].alive) {
                const otherPlayer = players[otherPlayerId];
                if (otherPlayer.snake.some(segment => segment.x === head.x && segment.y === head.y)) {
                  player.alive = false;
                }
              }
            }

            // Check for collisions with obstacles
            if (obstacles.some(obstacle => obstacle.x === head.x && obstacle.y === head.y)) {
              player.alive = false; // Player crashes into an obstacle
            }

            // Check for self-collision
            if (player.snake.slice(1).some(segment => segment.x === head.x && segment.y === head.y)) {
              player.alive = false;
            }
          }
        }

        // Dynamically add obstacles
        if (Math.random() < 0.01) {
          obstacles.push({
            x: Math.floor(Math.random() * (canvasWidth / gridSize)) * gridSize,
            y: Math.floor(Math.random() * (canvasHeight / gridSize)) * gridSize,
          });
        }

        // Send the updated game state to all players
        io.emit('gameState', { players, food, obstacles });

        // If no players are left alive, stop the game and declare a winner
        if (Object.values(players).every(player => !player.alive)) {
          clearInterval(gameInterval);
          const winner = Object.values(players).reduce((max, player) =>
            player.score > max.score ? player : max, { score: 0 });
          io.emit('gameOver', winner.name || 'No Winner');
        }
      }, gameSpeed); // Update the game every 150ms
    }
  });

  // Handle player disconnections
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('gameState', { players, food, obstacles });
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
