const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });

let waitingPlayers = [];

console.log(`Server started on port ${PORT}`);

wss.on('connection', (ws) => {
    // تولید یک آی‌دی تصادفی برای بازیکن
    ws.id = Math.floor(100000 + Math.random() * 900000);
    
    // ۱. ارسال پیام خوش‌آمدگویی و آی‌دی به بازیکن
    ws.send(JSON.stringify({
        type: "connected",
        id: ws.id
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === "find_match") {
                // اگر بازیکن قبلا در صف نیست، اضافه‌اش کن
                if (!waitingPlayers.includes(ws)) {
                    waitingPlayers.push(ws);
                    console.log(`Player ${ws.id} joined match queue.`);
                }

                // ۲. اگر ۲ نفر در صف بودند، match را بستر
                if (waitingPlayers.length >= 2) {
                    const player1 = waitingPlayers.shift();
                    const player2 = waitingPlayers.shift();

                    const roomId = "room_" + Math.floor(Math.random() * 10000);

                    // پیام ساخت اتاق به هر دو بازیکن
                    const matchData = {
                        type: "match_found",
                        roomId: roomId,
                        hostId: player1.id
                    };

                    player1.send(JSON.stringify(matchData));
                    player2.send(JSON.stringify(matchData));

                    console.log(`Match created: ${roomId} between ${player1.id} and ${player2.id}`);
                }
            }
        } catch (e) {
            console.error("Error processing message:", e);
        }
    });

    ws.on('close', () => {
        // حذف بازیکن از صف در صورت قطعی
        waitingPlayers = waitingPlayers.filter(p => p !== ws);
        console.log(`Player ${ws.id} disconnected.`);
    });
});
