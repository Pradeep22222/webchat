const express = require("express");

const Message = require("../models/Message");
const User = require("../models/User");

const auth = require("../middleware/auth");

const router = express.Router();

// GET messages from the previous 60 seconds
router.get("/", auth, async (req, res) => {

    try {

        const oneMinuteAgo = new Date(
            Date.now() - 60 * 1000
        );

        const messages = await Message.find({
            createdAt: {
                $gte: oneMinuteAgo
            }
        })
        .sort({ createdAt: 1 })
        .populate("sender", "username displayName role")
        .populate("recipient", "username displayName role");

        res.json(messages);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Unable to retrieve messages"
        });

    }

});


// POST a new message
router.post("/", auth, async (req, res) => {

    try {

        const { message } = req.body;

        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                message: "Message cannot be empty"
            });
        }

        if (message.length > 5000) {
            return res.status(400).json({
                message: "Message is too long"
            });
        }

        // Identify the other user
        const recipient = await User.findOne({
            _id: { $ne: req.user.id }
        });

        if (!recipient) {
            return res.status(404).json({
                message: "Recipient not found"
            });
        }

        // Save message in MongoDB
        const newMessage = await Message.create({

            sender: req.user.id,

            recipient: recipient._id,

            message: message,

            createdAt: new Date()

        });

        // Populate sender and recipient information
        const populatedMessage = await Message.findById(
            newMessage._id
        )
        .populate("sender", "username displayName role")
        .populate("recipient", "username displayName role");

        // Immediately broadcast to both connected users
        const io = req.app.get("io");

        io.to("private-chat").emit(
            "newMessage",
            populatedMessage
        );

        res.status(201).json({
            message: "Message sent successfully",
            data: populatedMessage
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            message: "Unable to send message"
        });

    }

});

module.exports = router;