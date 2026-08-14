const { WebSocketServer } = require('ws');
const https = require('https');

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });

let waitingQueue = [];
let activeRooms = {};

wss.on('connection', (ws) => {
    ws.id = Math.floor(100000 + Math.random() * 900000);
    
    ws.send(JSON.stringify({
        type: "connected",
        id: ws.id
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === "find_match") {
                // پاکسازی صف از سوکت‌های بسته شده
                waitingQueue = waitingQueue.filter(p => p.readyState === 1 && p.id !== ws.id);

                waitingQueue.push(ws);

                if (waitingQueue.length >= 2) {
                    const player1 = waitingQueue.shift();
                    const player2 = waitingQueue.shift();

                    // چک کردن سلامتی اتصال هر دو بازیکن
                    if (player1.readyState === 1 && player2.readyState === 1) {
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
                    } else {
                        // اگر یکی قطع بود، اونیکی که سالمه رو برمی‌گردونیم به صف
                        if (player1.readyState === 1) waitingQueue.push(player1);
                        if (player2.readyState === 1) waitingQueue.push(player2);
                    }
                }
            }

            if (data.type === "game_action") {
                if (ws.roomId && activeRooms[ws.roomId]) {
                    const room = activeRooms[ws.roomId];
                    const opponent = room.find(p => p.id !== ws.id);
                    
                    if (opponent && opponent.readyState === 1) {
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
    });
});

const SERVER_URL = 'https://godot-matchmaker.onrender.com';
setInterval(() => {
    https.get(SERVER_URL, (res) => {}).on('error', (err) => {});
}, 4 * 60 * 1000);
