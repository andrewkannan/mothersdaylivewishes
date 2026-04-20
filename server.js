const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// PostgreSQL Pool setup
let pool;
if (process.env.DATABASE_URL) {
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Required by Railway usually
    });

    pool.query(`
        CREATE TABLE IF NOT EXISTS wishes (
            id VARCHAR(50) PRIMARY KEY,
            text VARCHAR(255) NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `).then(() => {
        console.log("PostgreSQL database connected and schema is ready!");
    }).catch(err => console.error("Database schema init error:", err));
} else {
    console.log("No DATABASE_URL found. Falling back to temporary in-memory database.");
}

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory array fallback
let memoryWishes = [];

io.on('connection', async (socket) => {
    console.log('A user connected:', socket.id);

    try {
        // Send existing wishes to the newly connected user
        if (pool) {
            const result = await pool.query('SELECT * FROM wishes ORDER BY timestamp ASC');
            socket.emit('load_wishes', result.rows);
        } else {
            socket.emit('load_wishes', memoryWishes);
        }
    } catch (err) {
        console.error("Error loading wishes on connect", err);
    }

    // Handle incoming new wishes
    socket.on('new_wish', async (wishText) => {
        const id = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
        const wish = {
            id,
            text: wishText,
            timestamp: new Date()
        };
        
        if (pool) {
            try {
                await pool.query('INSERT INTO wishes (id, text, timestamp) VALUES ($1, $2, $3)', [wish.id, wish.text, wish.timestamp]);
                io.emit('receive_wish', wish);
            } catch (err) {
                console.error("Could not insert wish", err);
            }
        } else {
            memoryWishes.push(wish);
            io.emit('receive_wish', wish);
        }
    });

    // Handle wish deletion (Admin capability)
    socket.on('delete_wish', async (wishId) => {
        if (pool) {
            try {
                await pool.query('DELETE FROM wishes WHERE id = $1', [wishId]);
                io.emit('wish_deleted', wishId);
            } catch (err) {
                console.error("Could not delete wish", err);
            }
        } else {
            memoryWishes = memoryWishes.filter(w => w.id !== wishId);
            io.emit('wish_deleted', wishId);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
