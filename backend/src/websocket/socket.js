const { Server } = require('socket.io');
const Message = require("../models/Message.model");
const { verifyToken } = require("../utility/jwt");
const Room = require('../models/Room.model');


function initializeSocket(server) {
    const io = new Server(server, {
        cors: {
            // origin: "http://localhost:5173",
            origin: "https://chat-application-1-6ix7.onrender.com",
            methods: ["GET", "POST"],
            credentials: true,
        }
    });


    io.use(async (socket, next) => {
        try {

            const token = socket.handshake.headers.token;
            // console.log("token", token)
            if (!token) {
                return next(new Error("Authentication Error: Token not provided"));
            }


            const decoded = await verifyToken(token);
            socket.userId = decoded.userId;
            socket.userName = decoded.userName;
            next();
        } catch (err) {
            next(new Error("Authentication Error: Invalid Token"));
        }
    });

    io.on("connection", (socket) => {
        console.log("User connected:", socket.id);

        socket.on("room-create", async ({ roomName }) => {

            // console.log("Room created:", roomName, createdBy)
            const userId = socket.userId;


            try {
                // Check if room already exists
                let existingRoom = await Room.findOne({ roomName });
                if (existingRoom) {
                    console.log("Room already exists:", existingRoom)
                }

                // Create a new room
                const newRoom = new Room({
                    roomName,
                    createdBy: userId,
                    members: [userId]
                });
                await newRoom.save();
                console.log(newRoom)

                // Emit to all users that a new room is created
                io.emit("room-created", newRoom);

            } catch (error) {
                console.error("Error creating room:", error);

            }
        });

        socket.on("room-join", async (data) => {
            console.log("Received room-join event:", data);

            const { roomId } = data;
            const userId = socket.userId;

            try {
                let room = await Room.findById(roomId);
                if (!room) {
                    socket.emit("error", { message: "Room not found" });
                    return;
                }

                if (!room.members.includes(userId)) {
                    room.members.push(userId);
                    await room.save();
                }

                socket.join(roomId);  // user joins the room
                console.log(`User ${socket.userName} joined room ${room.roomName}`);


                io.to(roomId).emit("room-Joined", {
                    message: `${socket.userName} has joined the chat room`,
                    data: room
                });

                // Debugging: Show which rooms the socket is part of
                console.log("Rooms user is in:", socket.rooms);

                const messageHistory = await Message.find({ roomId })
                    .sort({ createdAt: 1 })
                    .limit(50)
                    .populate('sender', 'userName');

                // console.log("messageHistory", messageHistory)
                io.to(roomId).emit("message-history", {
                    roomId,
                    messages: messageHistory.map(msg => ({
                        id: msg._id,
                        senderId: msg.sender._id || msg.sender,
                        senderName: msg.sender.userName || "Unknown User",
                        text: msg.text,
                        isDeleted: msg.isDeleted,
                        createdAt: msg.createdAt
                    }))
                });
            } catch (error) {
                console.error("Error joining room:", error);
            }
        });


        socket.on("send-message", async ({ roomId, text }) => {
            try {
                const senderId = socket.userId;

                let room = await Room.findById(roomId);
                if (!room || !room.members.includes(senderId)) {
                    socket.emit("error", { message: "You are not a member of this room" });
                    return;
                }

                const message = new Message({
                    roomId,
                    sender: senderId,
                    text: text,
                });
                await message.save();

                // Emit message to all users in the room
                io.to(roomId).emit("recive-message", {
                    id: message._id,
                    senderId,
                    text,
                    createdAt: message.createdAt,
                });

                console.log(`Message sent in room ${room.roomName} by user ${socket.userName}`);
            } catch (error) {
                console.error("Error sending message:", error);
            }
        });

        socket.on("delete-message", async ({ messageId }) => {

            try {
                const message = await Message.findById({ _id: messageId });

                if (!message) {
                    socket.emit("error", { message: "Message not found" });
                    return;
                }

                // Ensure only the sender can delete (or admin)
                if (message.sender.toString() !== socket.userId) {
                    socket.emit("error", { message: "You can only delete your own messages" });
                    return;
                }

                // Soft delete the message
                message.isDeleted = true;
                await message.save();

                // Notify all users in the room that the message was deleted
                io.to(message.roomId.toString()).emit("message-deleted", { messageId });

            } catch (error) {
                console.error("Error deleting message:", error);
                socket.emit("error", { message: "Error deleting message" });
            }
        });

        socket.on("undo-message", async ({ messageId }) => {
            try {
                const message = await Message.findById({ _id: messageId });

                if (!message) {
                    socket.emit("error", { message: "Message not found" });
                    return;
                }

                // Ensure only the sender can undo their delete (or admin)
                if (message.sender.toString() !== socket.userId) {
                    socket.emit("error", { message: "You can only restore your own messages" });
                    return;
                }

                // Restore the message
                message.isDeleted = false;
                await message.save();

                console.log("Emitting message-restored event to room:", message.roomId);

                // Notify all users in the room that the message was restored
                io.to(message.roomId.toString()).emit("message-restored", { messageId, text: message.text });

            } catch (error) {
                console.error("Error restoring message:", error);
                socket.emit("error", { message: "Error restoring message" });
            }
        });

        socket.on("video-call-request", (data) => {
            const { roomId, callerId, callerName } = data;

            // Broadcast to all users in the room except the caller
            socket.to(roomId).emit("video-call-request", {
                roomId,
                callerId,
                callerName
            });
        });
        socket.on("video-call-accepted", (data) => {
            const { roomId, callerId, accepterId } = data;

            // Notify the caller that the call was accepted
            io.to(roomId).emit("video-call-accepted", {
                roomId,
                callerId,
                accepterId
            });
        });
        socket.on("video-call-rejected", (data) => {
            const { roomId, callerId, rejecterId, rejecterName } = data;

            // Notify the caller that the call was rejected
            socket.to(roomId).emit("video-call-rejected", {
                roomId,
                callerId,
                rejecterId,
                rejecterName
            });
        });

        // WebRTC signaling events
        socket.on("video-offer", (data) => {
            const { roomId, target, offer } = data;

            // Forward the offer to the target peer
            socket.to(roomId).emit("video-offer", {
                roomId,
                callerId: socket.userId,
                offer
            });
        });
        socket.on("video-answer", (data) => {
            const { roomId, target, answer } = data;

            // Forward the answer to the target peer
            socket.to(roomId).emit("video-answer", {
                roomId,
                answer
            });
        });


        socket.on("video-ice-candidate", (data) => {
            const { roomId, candidate } = data;

            // Broadcast ICE candidate to all peers in the room except sender
            socket.to(roomId).emit("video-ice-candidate", {
                roomId,
                candidate
            });
        });


        socket.on("video-call-ended", (data) => {
            const { roomId } = data;

            // Notify all users in the room that the call has ended
            io.to(roomId).emit("video-call-ended", {
                roomId
            });
        });
        socket.on("disconnect", () => {
            console.log("User disconnected:", socket.id);
        });
    });

    return io;
}

module.exports = initializeSocket;
