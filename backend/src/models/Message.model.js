const mongoose = require("mongoose")

const messageSchema = new mongoose.Schema({
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: {
        type: String,
        required: true,
        trim: true,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);