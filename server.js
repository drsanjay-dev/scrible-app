const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let rooms = {}; // roomCode -> [{id,name,points}]
let games = {}; // roomCode -> { currentWord, drawerId }

const words = ['apple', 'house', 'car', 'tree', 'cat', 'dog', 'star', 'phone', 'book', 'cup'];

app.get('/create-room', (req, res) => {
    const code = Math.random().toString(36).substring(2,8).toUpperCase();
    rooms[code] = [];
    res.json({ room: code });
});

app.get('/active-room', (req, res) => {
    const active = Object.keys(rooms).find(r => rooms[r].length > 0);
    if (active) res.json({ room: active });
    else {
        const code = Math.random().toString(36).substring(2,8).toUpperCase();
        rooms[code] = [];
        res.json({ room: code });
    }
});

io.on('connection', (socket) => {
    socket.on('join', ({ room, name }) => {
        socket.join(room);
        socket.room = room;
        socket.username = name;

        if (!rooms[room]) rooms[room] = [];
        rooms[room].push({ id: socket.id, name, points: 0 });
        io.to(room).emit('scoreboard', sortByPoints(rooms[room]));
    });

    socket.on('startGame', () => startRound(socket.room));

    socket.on('drawing', data => socket.to(socket.room).emit('drawing', data));
    socket.on('fill', color => socket.to(socket.room).emit('fill', color));
    socket.on('clear', () => socket.to(socket.room).emit('clear'));

    socket.on('guess', guess => {
        const game = games[socket.room];
        if (!game) return;
        if (guess.toLowerCase() === game.currentWord.toLowerCase()) {
            const roomPlayers = rooms[socket.room];
            const guesser = roomPlayers.find(u => u.id === socket.id);
            const drawer = roomPlayers.find(u => u.id === game.drawerId);
            if (guesser) guesser.points += 10;
            if (drawer) drawer.points += 5;

            io.to(socket.room).emit('correctGuess', { name: socket.username, word: game.currentWord });
            io.to(socket.room).emit('scoreboard', sortByPoints(roomPlayers));

            nextDrawer(socket.room);
        } else {
            io.to(socket.room).emit('chat', { name: socket.username, msg: guess });
        }
    });

    socket.on('leave', () => leaveRoom(socket));
    socket.on('disconnect', () => leaveRoom(socket));
});

function startRound(room) {
    const roomPlayers = rooms[room];
    if (!roomPlayers || roomPlayers.length < 2) return;
    const drawer = roomPlayers[0];
    const word = pickWord();
    games[room] = { currentWord: word, drawerId: drawer.id };
    io.to(drawer.id).emit('yourWord', word);
    io.to(room).emit('newRound', { drawer: drawer.name });
}

function nextDrawer(room) {
    const roomPlayers = rooms[room];
    if (!roomPlayers || roomPlayers.length < 2) return;
    const current = games[room].drawerId;
    const idx = roomPlayers.findIndex(p => p.id === current);
    const next = roomPlayers[(idx+1)%roomPlayers.length];
    const word = pickWord();
    games[room] = { currentWord: word, drawerId: next.id };
    io.to(next.id).emit('yourWord', word);
    io.to(room).emit('newRound', { drawer: next.name });
}

function pickWord() {
    return words[Math.floor(Math.random()*words.length)];
}

function sortByPoints(arr) {
    return [...arr].sort((a,b) => b.points - a.points);
}

function leaveRoom(socket) {
    const room = socket.room;
    if (room && rooms[room]) {
        rooms[room] = rooms[room].filter(u => u.id !== socket.id);
        if (rooms[room].length === 0) {
            delete rooms[room];
            delete games[room];
        } else {
            io.to(room).emit('scoreboard', sortByPoints(rooms[room]));
        }
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
