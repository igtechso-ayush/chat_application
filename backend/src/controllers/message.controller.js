
const express = require("express");
const Message = require("../models/Message.model");


// Send a message
exports.sendmessage = async (req, res) => {
    try {
        const { sender, receiver, message } = req.body;
        if (!sender || !receiver || !message) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const newMessage = new Message({ sender, receiver, message });
        await newMessage.save();

        res.status(201).json(newMessage);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

exports.chathistory = async (req, res) => {
    try {
        const { user1, user2 } = req.params;

        const messages = await Message.find({
            $or: [
                { sender: user1, receiver: user2 },
                { sender: user2, receiver: user1 }
            ]
        }).sort({ createdAt: 1 }); // Sort by oldest first

        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}


