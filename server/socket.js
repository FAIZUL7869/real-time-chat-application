let io;

const onlineUsers = new Map();
const User = require("./models/User");
const initializeSocket = (socketIO) => {
    io = socketIO;

    io.on("connection", (socket) => {
        console.log("✅ User Connected:", socket.id);

        // User joins
        socket.on("join", (userId) => {
            onlineUsers.set(userId, socket.id);

            console.log(`User ${userId} joined`);

            // Notify everyone about online users
            io.emit("onlineUsers", Array.from(onlineUsers.keys()));
        });

        // User is typing
        socket.on("typing", ({ senderId, receiverId }) => {
            console.log("Typing Event:", senderId, "->", receiverId);
            const receiverSocket = onlineUsers.get(receiverId);

            if (receiverSocket) {
                io.to(receiverSocket).emit("typing", senderId);
            }
        });

        // User stopped typing
        socket.on("stopTyping", ({ senderId, receiverId }) => {
            const receiverSocket = onlineUsers.get(receiverId);

            if (receiverSocket) {
                io.to(receiverSocket).emit("stopTyping", senderId);
            }
        });
        socket.on("messageDelivered", ({ messageId, senderId }) => {
            console.log("📦 Delivered Event:", messageId, senderId);

            const senderSocket = onlineUsers.get(senderId);

            console.log("Sender Socket:", senderSocket);

            if (senderSocket) {
                io.to(senderSocket).emit("messageDelivered", {
                    messageId,
                });
            }
        });
        socket.on("messageSeen", ({ messageId, senderId }) => {
            const senderSocket = onlineUsers.get(senderId);

            if (senderSocket) {
                io.to(senderSocket).emit("messageSeen", {
                    messageId,
                });
            }
        });
        // =========================
        // VOICE CALL SIGNALING
        // =========================

        // Caller starts a call
        socket.on("callUser", ({ callerId, receiverId, callerName }) => {
            console.log(
                "📞 Call request:",
                callerId,
                "->",
                receiverId
            );

            const receiverSocket = onlineUsers.get(receiverId);

            if (receiverSocket) {
                io.to(receiverSocket).emit("incomingCall", {
                    callerId,
                    callerName,
                });
            } else {
                socket.emit("callUnavailable", {
                    receiverId,
                });
            }
        });

        // Caller cancels the call before it is accepted
        socket.on("cancelCall", ({ callerId, receiverId }) => {
            console.log(
                "📞 Call cancelled:",
                callerId,
                "->",
                receiverId
            );

            const receiverSocket = onlineUsers.get(receiverId);

            if (receiverSocket) {
                io.to(receiverSocket).emit("callCancelled", {
                    callerId,
                });
            }
        });

        // Receiver accepts the call
        socket.on("acceptCall", ({ callerId, receiverId }) => {
            console.log(
                "✅ Call accepted:",
                receiverId,
                "->",
                callerId
            );

            const callerSocket = onlineUsers.get(callerId);

            if (callerSocket) {
                io.to(callerSocket).emit("callAccepted", {
                    receiverId,
                });
            }
        });

        // Receiver declines the call
        socket.on("declineCall", ({ callerId, receiverId }) => {
            console.log(
                "❌ Call declined:",
                receiverId,
                "->",
                callerId
            );

            const callerSocket = onlineUsers.get(callerId);

            if (callerSocket) {
                io.to(callerSocket).emit("callDeclined", {
                    receiverId,
                });
            }
        });

        // =========================
        // WEBRTC SIGNALING
        // =========================

        // Send WebRTC offer
        socket.on("webrtcOffer", ({ callerId, receiverId, offer }) => {
            console.log("📡 WebRTC offer:", callerId, "->", receiverId);

            const receiverSocket = onlineUsers.get(receiverId);

            if (receiverSocket) {
                io.to(receiverSocket).emit("webrtcOffer", {
                    callerId,
                    receiverId,
                    offer,
                });
            }
        });

        // Send WebRTC answer
        socket.on("webrtcAnswer", ({ callerId, receiverId, answer }) => {
            console.log("📡 WebRTC answer:", receiverId, "->", callerId);

            const callerSocket = onlineUsers.get(callerId);

            if (callerSocket) {
                io.to(callerSocket).emit("webrtcAnswer", {
                    receiverId,
                    answer,
                });
            }
        });

        // Exchange ICE candidates
        socket.on("iceCandidate", ({ senderId, receiverId, candidate }) => {
            console.log("🧊 ICE candidate:", senderId, "->", receiverId);

            const receiverSocket = onlineUsers.get(receiverId);

            if (receiverSocket) {
                io.to(receiverSocket).emit("iceCandidate", {
                    senderId,
                    receiverId,
                    candidate,
                });
            }
        });

        // End active call
        socket.on("endCall", ({ callerId, receiverId }) => {
            console.log(
                "☎️ Call ended:",
                callerId,
                "->",
                receiverId
            );

            const receiverSocket = onlineUsers.get(receiverId);

            if (receiverSocket) {
                io.to(receiverSocket).emit("callEnded", {
                    callerId,
                });
            }
        });
        // User disconnects
        socket.on("disconnect", async () => {
            for (const [userId, socketId] of onlineUsers.entries()) {
                if (socketId === socket.id) {
                    await User.findByIdAndUpdate(userId, {
                        lastSeen: new Date(),
                    });
                    console.log(`✅ Updated lastSeen for ${userId}`);
                    onlineUsers.delete(userId);
                    break;
                }
            }

            console.log("❌ User Disconnected:", socket.id);

            // Notify everyone about online users
            io.emit("onlineUsers", Array.from(onlineUsers.keys()));
        });
    });
};

const getReceiverSocket = (userId) => {
    return onlineUsers.get(userId);
};

const getIO = () => io;

module.exports = {
    initializeSocket,
    getReceiverSocket,
    getIO,
};