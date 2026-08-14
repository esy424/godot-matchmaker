const { WebSocketServer } = require('ws');
const https = require('https');

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });

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

            // ۱. جفت‌سازی اولیه
            if (data.type === "find_match") {
                if (!waitingQueue.some(p => p.id === ws.id)) {
                    waitingQueue.push(ws);
                    console.log(`Player ${ws.id} added to queue. Total in queue: ${waitingQueue.length}`);
                }

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

            // ۲. انتقال پیام‌های اکشن بازی بین دو بازیکن (Relay)
            if (data.type === "game_action") {
                if (ws.roomId && activeRooms[ws.roomId]) {
                    const room = activeRooms[ws.roomId];
                    // پیدا کردن حریف در همان اتاق
                    const opponent = room.find(p => p.id !== ws.id);
                    
                    if (opponent && opponent.readyState === 1) { // 1 یعنی WebSocket باز است
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
        
        if (ws.roomId && activeRooms[ws.roomId]) {
            delete activeRooms[ws.roomId];
        }
        console.log(`Player ${ws.id} disconnected.`);
    });
});

// Self-Ping برای بیدار نگه داشتن سرور Render
const SERVER_URL = 'https://godot-matchmaker.onrender.com';
setInterval(() => {
    https.get(SERVER_URL, (res) => {
        console.log(`Self-ping status: ${res.statusCode}`);
    }).on('error', (err) => {
        console.log('Self-ping error:', err.message);
    });
}, 4 * 60 * 1000);
