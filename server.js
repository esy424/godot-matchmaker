const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Godot Matchmaking Server is Running!');
});

const wss = new WebSocketServer({ server });

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
                cleanupPlayerRoom(ws);

                if (!waitingQueue.some(p => p.id === ws.id)) {
                    waitingQueue.push(ws);
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
                }
            }

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

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
