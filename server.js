const { WebSocketServer } = require('ws');

// Render پورت را در process.env.PORT قرار می‌دهد
const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });

let waitingQueue = [];
let activeRooms = {};

console.log(`Matchmaking Server Running on Port ${PORT}`);

wss.on('connection', (ws) => {
    ws.id = Math.floor(100000 + Math.random() * 900000);
    console.log(`Player connected: ${ws.id}`);
    
    // ارسال فوری پیام اتصال
    ws.send(JSON.stringify({
        type: "connected",
        id: ws.id
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === "find_match") {
                // حذف اتصالات قطعی‌خورده از صف
                waitingQueue = waitingQueue.filter(p => p.readyState === 1 && p.id !== ws.id);
                
                if (!waitingQueue.some(p => p.id === ws.id)) {
                    waitingQueue.push(ws);
                    console.log(`Player ${ws.id} added to queue. Queue size: ${waitingQueue.length}`);
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

                    console.log(`Match Found! Sending to ${player1.id} & ${player2.id}`);
                    player1.send(JSON.stringify(matchData));
                    player2.send(JSON.stringify(matchData));
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
        console.log(`Player ${ws.id} disconnected`);
    });
});
