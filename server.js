const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 10000;

// ۱. ساخت یک HTTP Server استاندارد
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Godot Matchmaking Server is Running!');
});

// ۲. اتصال WebSocketServer به HTTP Server
const wss = new WebSocketServer({ server });

let waitingQueue = [];
let activeRooms = {};

console.log(`Matchmaking Server Running on Port ${PORT}`);

wss.on('connection', (ws) => {
    ws.id = Math.floor(100000 + Math.random() * 900000);
    
    ws.send(JSON.stringify({
        type: "connected",
        id: ws.id
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // ۱. جفت‌سازی اولیه (Matchmaking)
            if (data.type === "find_match") {
                cleanupPlayerRoom(ws);

                if (!waitingQueue.some(p => p.id === ws.id)) {
                    waitingQueue.push(ws);
                    console.log(`Player ${ws.id} added to queue. Total in queue: ${waitingQueue.length}`);
                }

                waitingQueue = waitingQueue.filter(p => p.readyState === WebSocket.OPEN);

                if (waitingQueue.length >= 2) {
                    const player1 = waitingQueue.shift();
                    const player2 = waitingQueue.shift();

                    const roomId = "room_" + Date.now();
                    activeRooms[roomId] = [player1, player2];

                    player1.roomId = roomId;
                    player2.roomId = roomId;

                    const matchData = {
                        type: "match_found",
                        roomId: roomId,
                        hostId: player1.id
                    };

                    player1.send(JSON.stringify(matchData));
                    player2.send(JSON.stringify(matchData));

                    console.log(`Created ${roomId} for Players: ${player1.id} & ${player2.id}`);
                }
            }

            // ۲. انصراف از صف جفت‌سازی
            if (data.type === "leave_queue" || data.type === "cancel_matchmaking") {
                waitingQueue = waitingQueue.filter(p => p.id !== ws.id);
                console.log(`Player ${ws.id} left the queue.`);
            }

            // ۳. ارسال پیام‌های بازی (Relay)
            if (data.type === "game_action") {
                if (ws.roomId && activeRooms[ws.roomId]) {
                    const room = activeRooms[ws.roomId];
                    const opponent = room.find(p => p.id !== ws.id);
                    
                    if (opponent && opponent.readyState === WebSocket.OPEN) {
                        data.senderId = ws.id;
                        opponent.send(JSON.stringify(data));
                    }
                }
            }

        } catch (e) {
            console.error("Error parsing message:", e);
        }
    });

    ws.on('close', () => {
        waitingQueue = waitingQueue.filter(p => p.id !== ws.id);
        cleanupPlayerRoom(ws);
        console.log(`Player ${ws.id} disconnected.`);
    });
});

function cleanupPlayerRoom(ws) {
    if (ws.roomId && activeRooms[ws.roomId]) {
        const room = activeRooms[ws.roomId];
        const opponent = room.find(p => p.id !== ws.id);

        if (opponent && opponent.readyState === WebSocket.OPEN) {
            opponent.send(JSON.stringify({
                type: "opponent_disconnected"
            }));
        }

        delete activeRooms[ws.roomId];
        ws.roomId = null;
    }
}

// Self-Ping برای بیدار نگه داشتن سرور Render
const SERVER_URL = 'https://godot-matchmaker.onrender.com';
setInterval(() => {
    https.get(SERVER_URL, (res) => {
        console.log(`Self-ping status: ${res.statusCode}`);
    }).on('error', (err) => {
        console.log('Self-ping error:', err.message);
    });
}, 4 * 60 * 1000);

// ۳. روشن کردن سرور روی پورت اختصاص داده شده
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
