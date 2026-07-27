const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const Message = require("../models/Message");
const { getReceiverSocket, getIO } = require("../socket");

// Send Message
const sendMessage = async (req, res) => {
    console.log("1. sendMessage called");
    console.log("FILE RECEIVED:", req.file);
    console.log("FILE MIME:", req.file?.mimetype);
    console.log("FILE SIZE:", req.file?.size);
    console.log("req.file =", req.file);
    try {
        const { receiver, text, replyTo } = req.body;
        console.log("req.file =", req.file);
        console.log("MIME TYPE =", req.file?.mimetype);
        console.log("ReplyTo received:", replyTo);
        console.log("Body:", req.body);

        console.log("2. Before Cloudinary");

        let imageUrl = "";
        let voiceUrl = "";
        let videoUrl = "";

        // Upload Image
        if (req.file && req.file.mimetype.startsWith("image")) {

            console.log("📷 Image found");

            imageUrl = await new Promise((resolve, reject) => {

                const stream = cloudinary.uploader.upload_stream(
                    {
                        folder: "soulmate-chat",
                    },
                    (error, result) => {

                        if (error) return reject(error);

                        console.log("✅ Image uploaded");

                        resolve(result.secure_url);

                    }
                );

                streamifier.createReadStream(req.file.buffer).pipe(stream);

            });

        }

        // Upload Voice
        if (req.file && req.file.mimetype.startsWith("audio")) {

            console.log("🎤 Voice found");

            voiceUrl = await new Promise((resolve, reject) => {

                const stream = cloudinary.uploader.upload_stream(
                    {
                        resource_type: "video",
                        folder: "soulmate-chat/voice-notes",
                    },
                    (error, result) => {

                        if (error) return reject(error);

                        console.log("✅ Voice uploaded");

                        resolve(result.secure_url);

                    }
                );

                streamifier.createReadStream(req.file.buffer).pipe(stream);

            });

        }
        // Upload Video
        console.log("Checking MIME:", req.file?.mimetype);
        if (req.file && req.file.mimetype.includes("video")) {

            console.log("🎥 Video found");

            videoUrl = await new Promise((resolve, reject) => {

                const stream = cloudinary.uploader.upload_stream(
                    {
                        resource_type: "video",
                        folder: "soulmate-chat/videos",
                    },
                    (error, result) => {

                        if (error) return reject(error);

                        console.log("✅ Video uploaded");

                        resolve(result.secure_url);

                    }
                );

                streamifier.createReadStream(req.file.buffer).pipe(stream);

            });

        }
        console.log("5. Before Message.create");

        if (!receiver) {
            return res.status(400).json({
                message: "Receiver is required",
            });
        }

        console.log("Creating message...");
        const message = await Message.create({
            sender: req.user._id,
            receiver,
            text: text || "",
            image: imageUrl,
            voice: voiceUrl,
            video: videoUrl,
            replyTo: replyTo || null,
            delivered: false,
            seen: false,
        });
        await message.populate({
            path: "replyTo",
            populate: {
                path: "sender",
                select: "name",
            },
        });
        console.log("✅ Message created");
        console.log("Sending response...");

        const receiverSocketId = getReceiverSocket(message.receiver.toString());

        if (receiverSocketId) {
            getIO().to(receiverSocketId).emit("receiveMessage", message);
        }

        res.status(201).json({
            message: "Message sent successfully",
            data: message,
        });

    } catch (error) {
        res.status(500).json({
            message: error.message,
        });
    }
};

// Get Chat History
const getMessages = async (req, res) => {
    try {
        const { userId } = req.params;

        const page = parseInt(req.query.page) || 1;
        const limit = 30;

        const messages = await Message.find({
            $or: [
                { sender: req.user._id, receiver: userId },
                { sender: userId, receiver: req.user._id },
            ],
        })
            .populate("replyTo")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        res.status(200).json(messages.reverse());

    } catch (error) {
        res.status(500).json({
            message: error.message,
        });
    }
};
// Mark Delivered
const markDelivered = async (req, res) => {
    try {
        const message = await Message.findByIdAndUpdate(
            req.params.messageId,
            { delivered: true },
            { new: true }
        );

        if (!message) {
            return res.status(404).json({
                message: "Message not found",
            });
        }

        const senderSocket = getReceiverSocket(message.sender.toString());

        if (senderSocket) {
            getIO().to(senderSocket).emit("messageDelivered", message);
        }

        res.json(message);

    } catch (error) {
        res.status(500).json({
            message: error.message,
        });
    }
};

// Mark Seen
const markSeen = async (req, res) => {
    console.log("💜 markSeen called");

    try {
        const message = await Message.findByIdAndUpdate(
            req.params.messageId,
            {
                delivered: true,
                seen: true,
            },
            { new: true }
        );

        if (!message) {
            return res.status(404).json({
                message: "Message not found",
            });
        }

        console.log("Message:", message);

        const senderSocket = getReceiverSocket(message.sender.toString());

        console.log("Sender Socket:", senderSocket);

        if (senderSocket) {
            console.log("📤 Emitting messageSeen");

            getIO().to(senderSocket).emit("messageSeen", message);
        }

        res.json(message);

    } catch (error) {
        res.status(500).json({
            message: error.message,
        });
    }
};
const deleteMessage = async (req, res) => {
    try {
        const message = await Message.findById(req.params.messageId);

        if (!message) {
            return res.status(404).json({
                message: "Message not found",
            });
        }

        // Only the sender can delete the message
        if (message.sender.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                message: "Not authorized",
            });
        }

        await Message.findByIdAndDelete(req.params.messageId);

        const receiverSocketId = getReceiverSocket(message.receiver.toString());

        console.log("Receiver:", message.receiver.toString());
        console.log("Receiver Socket:", receiverSocketId);

        if (receiverSocketId) {
            console.log("📤 Emitting messageDeleted");

            getIO().to(receiverSocketId).emit("messageDeleted", {
                messageId: message._id,
            });
        }

        res.status(200).json({
            message: "Message deleted successfully",
        });

    } catch (error) {
        res.status(500).json({
            message: error.message,
        });
    }
};
module.exports = {
    sendMessage,
    getMessages,
    markDelivered,
    markSeen,
    deleteMessage,
};