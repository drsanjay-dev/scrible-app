const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let rooms = {}; // roomCode -> [{id,name,points}]
let games = {}; // roomCode -> { currentWord, drawerId, wordList, wordIndex }

const words = [
  'apple', 'house', 'car', 'tree', 'cat', 'dog', 'star', 'phone', 'book', 'cup',
  'banana', 'bottle', 'laptop', 'shoe', 'hat', 'watch', 'train', 'boat', 'plane', 'cake',
  'guitar', 'chair', 'table', 'spoon', 'fork', 'knife', 'pencil', 'pen', 'ball', 'bed',
  'mirror', 'key', 'door', 'window', 'glove', 'sock', 'shirt', 'pants', 'bag', 'box',
  'robot', 'clock', 'flag', 'lamp', 'candle', 'camera', 'television', 'remote', 'fan', 'kite',
  'ice', 'snow', 'sun', 'moon', 'cloud', 'rain', 'storm', 'mountain', 'river', 'beach',
  'island', 'desert', 'forest', 'volcano', 'cave', 'bridge', 'road', 'tower', 'castle', 'tent',
  'zebra', 'lion', 'tiger', 'elephant', 'monkey', 'fish', 'shark', 'whale', 'dolphin', 'crab',
  'butterfly', 'bee', 'ant', 'spider', 'snake', 'frog', 'horse', 'cow', 'pig', 'goat',
  'chicken', 'duck', 'eagle', 'owl', 'parrot', 'penguin', 'bat', 'camel', 'kangaroo', 'panda',
  'bicycle', 'motorcycle', 'bus', 'truck', 'helicopter', 'submarine', 'rocket', 'tractor', 'skateboard', 'scooter',
  'toothbrush', 'toothpaste', 'soap', 'towel', 'comb', 'brush', 'shampoo', 'mirror', 'sink', 'toilet',
  'pizza', 'burger', 'fries', 'noodles', 'rice', 'bread', 'cheese', 'egg', 'milk', 'butter',
  'orange', 'grape', 'lemon', 'cherry', 'peach', 'mango', 'pineapple', 'watermelon', 'strawberry', 'coconut',
  'dragon', 'ghost', 'zombie', 'vampire', 'witch', 'alien', 'robot', 'pirate', 'ninja', 'knight',
  'doctor', 'nurse', 'police', 'firefighter', 'chef', 'teacher', 'farmer', 'pilot', 'soldier', 'astronaut',
  'balloon', 'gift', 'ribbon', 'crown', 'ring', 'necklace', 'bracelet', 'glasses', 'scarf', 'jacket',
  'cookie', 'chocolate', 'candy', 'icecream', 'popcorn', 'sugar', 'salt', 'pepper', 'honey', 'jam',
  'ladder', 'hammer', 'nail', 'screw', 'saw', 'drill', 'wrench', 'paint', 'brush', 'bucket',
  'newspaper', 'magazine', 'ticket', 'coin', 'wallet', 'money', 'creditcard', 'calendar', 'map', 'globe',
  'trophy', 'medal', 'ruler', 'eraser', 'notebook', 'file', 'envelope', 'sticker', 'badge', 'stamp'
];

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
    if (!games[room]) {
        // Initialize game data
        games[room] = {
            drawerId: drawer.id,
            wordList: shuffle([...words]),
            wordIndex: 0,
            currentWord: ''
        };
    }

    const game = games[room];
    const word = game.wordList[game.wordIndex];
    game.currentWord = word;
    game.drawerId = drawer.id;

    io.to(drawer.id).emit('yourWord', word);
    io.to(room).emit('newRound', { drawer: drawer.name });

    game.wordIndex = (game.wordIndex + 1) % game.wordList.length;
}

function nextDrawer(room) {
    const roomPlayers = rooms[room];
    if (!roomPlayers || roomPlayers.length < 2) return;

    const game = games[room];
    const currentId = game.drawerId;
    const idx = roomPlayers.findIndex(p => p.id === currentId);
    const nextPlayer = roomPlayers[(idx + 1) % roomPlayers.length];

    const word = game.wordList[game.wordIndex];
    game.currentWord = word;
    game.drawerId = nextPlayer.id;

    io.to(nextPlayer.id).emit('yourWord', word);
    io.to(room).emit('newRound', { drawer: nextPlayer.name });

    game.wordIndex = (game.wordIndex + 1) % game.wordList.length;
}

function sortByPoints(arr) {
    return [...arr].sort((a, b) => b.points - a.points);
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

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
