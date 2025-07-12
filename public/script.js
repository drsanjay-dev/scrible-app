const url = new URL(window.location.href);
const room = url.searchParams.get('room');
const name = url.searchParams.get('name');

document.getElementById('roomCode').textContent = 'Room: ' + room;

const socket = io();
socket.emit('join', { room, name });

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
resizeCanvas();

let drawing = false;
let prev = {};
let currentColor = '#000000';
let currentTool = 'brush';
let eraserSize = 10;

// Colors
const palette = ['#000000','#FF0000','#00FF00','#0000FF','#FFFF00','#FF00FF','#00FFFF','#FFA500','#808080','#8B4513'];
const colorDiv = document.getElementById('colors');
palette.forEach(c => {
    const btn = document.createElement('button');
    btn.style.background = c;
    btn.className = 'color-btn';
    btn.onclick = () => currentColor = c;
    colorDiv.appendChild(btn);
});

// Tools
function setTool(tool) { currentTool = tool; }
function changeEraserSize() {
    eraserSize = parseInt(document.getElementById('eraserSize').value, 10);
}
function clearBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('clear');
}
function startGame() {
    socket.emit('startGame');
}

// Resize canvas resolution to match displayed size
function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}

// Get correct coords, considering scaling
function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function getTouchCoords(touch) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
    };
}

// Handle window resize
window.addEventListener('resize', () => {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    resizeCanvas();
    ctx.putImageData(img, 0, 0);
});

// Drawing: mouse
canvas.addEventListener('mousedown', e => {
    drawing = true;
    prev = getCoords(e);
    if (currentTool === 'fill') {
        fillCanvas(currentColor, true);
        drawing = false;
    }
});
canvas.addEventListener('mousemove', e => {
    if (!drawing || currentTool === 'fill') return;
    const current = getCoords(e);
    const color = (currentTool === 'eraser') ? '#FFFFFF' : currentColor;
    draw(prev, current, color, true);
    prev = current;
});
canvas.addEventListener('mouseup', () => drawing = false);
canvas.addEventListener('mouseout', () => drawing = false);

// Drawing: touch
canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touch = e.touches[0];
    prev = getTouchCoords(touch);
    drawing = true;
    if (currentTool === 'fill') {
        fillCanvas(currentColor, true);
        drawing = false;
    }
});
canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!drawing || currentTool === 'fill') return;
    const touch = e.touches[0];
    const current = getTouchCoords(touch);
    const color = (currentTool === 'eraser') ? '#FFFFFF' : currentColor;
    draw(prev, current, color, true);
    prev = current;
});
canvas.addEventListener('touchend', () => drawing = false);
canvas.addEventListener('touchcancel', () => drawing = false);

// Draw function
function draw(from, to, color, emit) {
    ctx.strokeStyle = color;
    ctx.lineWidth = (currentTool === 'eraser') ? eraserSize : 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.closePath();
    if (emit) {
        socket.emit('drawing', { prev: from, current: to, color, size: ctx.lineWidth });
    }
}

function fillCanvas(color, emit) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (emit) socket.emit('fill', color);
}

// Chat / Guess
function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    socket.emit('guess', msg);
    input.value = '';
}
document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.keyCode === 13) sendChat();
});

// Socket events
socket.on('drawing', data => {
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(data.prev.x, data.prev.y);
    ctx.lineTo(data.current.x, data.current.y);
    ctx.stroke();
    ctx.closePath();
});
socket.on('fill', color => fillCanvas(color, false));
socket.on('clear', () => ctx.clearRect(0, 0, canvas.width, canvas.height));

socket.on('yourWord', word => alert('🎨 You are drawing: ' + word));
socket.on('newRound', data => alert('🧩 New round! Drawer: ' + data.drawer));
socket.on('correctGuess', data => alert(`✅ ${data.name} guessed correctly! Word was: ${data.word}`));

socket.on('chat', data => {
    const box = document.getElementById('chatBox');
    const div = document.createElement('div');
    div.textContent = `${data.name}: ${data.msg}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
});
socket.on('scoreboard', members => {
    const list = document.getElementById('members');
    list.innerHTML = '';
    members.forEach(m => {
        const li = document.createElement('li');
        li.textContent = `${m.name} - ${m.points} pts`;
        list.appendChild(li);
    });
});

function exitRoom() {
    socket.emit('leave');
    window.location.href = '/';
}
