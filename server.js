const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory array to store wishes
let wishes = [];

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send existing wishes to the newly connected user
    socket.emit('load_wishes', wishes);

    // Handle incoming new wishes
    socket.on('new_wish', (wishText) => {
        const wish = {
            id: Date.now().toString() + Math.floor(Math.random() * 1000).toString(),
            text: wishText,
            timestamp: new Date()
        };
        wishes.push(wish);
        
        // Broadcast the new wish to ALL connected clients (including the sender)
        io.emit('receive_wish', wish);
    });

    // Handle wish deletion (Admin capability)
    socket.on('delete_wish', (wishId) => {
        wishes = wishes.filter(w => w.id !== wishId);
        io.emit('wish_deleted', wishId);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
