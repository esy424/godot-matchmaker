const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });

let waitingQueue = [];
let activeRooms = {};

console.log(`Matchmaking Server Running on Port ${PORT}`);

wss.on('connection', (ws) => {
    // ایجاد آی‌دی شش رقمی یکتا برای هر بازیکن
    ws.id = Math.floor(100000 + Math.random() * 900000);
    
    // ۱. ارسال آی‌دی به کلاینت محض اتصال
    ws.send(JSON.stringify({
        type: "connected",
        id: ws.id
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === "find_match") {
                // اگر بازیکن قبلاً در صف نیست، به صف اضافه‌اش کن
                if (!waitingQueue.some(p => p.id === ws.id)) {
                    waitingQueue.push(ws);
                    console.log(`Player ${ws.id} added to queue. Total in queue: ${waitingQueue.length}`);
                }

                // اگر حداقل ۲ نفر در صف بودند، match بساز
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
        } catch (e) {
            console.error("Error parsing message:", e);
        }
    });

    ws.on('close', () => {
        // حذف از صف انتظار در صورت قطعی
        waitingQueue = waitingQueue.filter(p => p.id !== ws.id);
        
        // اگر در اتاقی بود، به بازیکن مقابل اطلاع بده (برای بعداً)
        if (ws.roomId && activeRooms[ws.roomId]) {
            delete activeRooms[ws.roomId];
        }
        console.log(`Player ${ws.id} disconnected.`);
    });
});
