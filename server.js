const { WebSocketServer, WebSocket } = require('ws');
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

            // ۱. جفت‌سازی اولیه (Matchmaking)
            if (data.type === "find_match") {
                // اگر بازیکن از قبل در اتاق فعال است، ابتدا از آن خارج شود
                cleanupPlayerRoom(ws);

                // اضافه کردن به صف فقط در صورتی که قبلا وجود ندارد
                if (!waitingQueue.some(p => p.id === ws.id)) {
                    waitingQueue.push(ws);
                    console.log(`Player ${ws.id} added to queue. Total in queue: ${waitingQueue.length}`);
                }

                // پاک‌سازی سوکت‌های بسته یا قطعی از صف قبل از جفت‌سازی
                waitingQueue = waitingQueue.filter(p => p.readyState === WebSocket.OPEN);

                // اگر حداقل ۲ بازیکن زنده در صف بودند
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

            // ۲. انصراف از صف جفت‌سازی (Cancel Matchmaking)
            if (data.type === "leave_queue" || data.type === "cancel_matchmaking") {
                waitingQueue = waitingQueue.filter(p => p.id !== ws.id);
                console.log(`Player ${ws.id} left the queue.`);
            }

            // ۳. انتقال پیام‌های اکشن بازی بین دو بازیکن (Relay)
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

    // مدیریت قطعی اتصال
    ws.on('close', () => {
        // ۱. حذف از صف انتظار
        waitingQueue = waitingQueue.filter(p => p.id !== ws.id);
        
        // ۲. پاک‌سازی اتاق و اطلاع به حریف در صورت قطعی
        cleanupPlayerRoom(ws);

        console.log(`Player ${ws.id} disconnected.`);
    });
});

// تابع کمکی برای پاک‌سازی اتاق و اطلاع به حریف
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
