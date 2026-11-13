
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    message: {
        type: String,
        required: true,
        maxlength: 5000
    },

    // Null means the recipient has not read the message yet.
    readAt: {
        type: Date,
        default: null
    },

    // Null means the message has not started its expiry countdown.
    expiresAt: {
        type: Date,
        default: null
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for efficient message retrieval.
messageSchema.index({ sender: 1, recipient: 1, createdAt: 1 });
messageSchema.index({ recipient: 1, readAt: 1, expiresAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
