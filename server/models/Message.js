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

    createdAt: {
        type: Date,
        default: Date.now
    }
});

messageSchema.index({ createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);