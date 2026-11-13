
const express = require("express");

const Message = require("../models/Message");
const User = require("../models/User");

const auth = require("../middleware/auth");

const router = express.Router();

const MESSAGE_EXPIRY_SECONDS = 60;


// GET messages for the authenticated user
router.get("/", auth, async (req, res) => {

    try {

        const currentUserId = req.user.id;
        const now = new Date();

        // Return:
        // 1. All unread messages.
        // 2. Read messages that have not expired yet.

        const messages = await Message.find({

            $and: [

                {
                    $or: [
                        { sender: currentUserId },
                        { recipient: currentUserId }
                    ]
                },

                {
                    $or: [
                        { readAt: null },
                        { expiresAt: { $gt: now } }
                    ]
                }

            ]

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

        // Identify the other user.
        const recipient = await User.findOne({
            _id: { $ne: req.user.id }
        });

        if (!recipient) {
            return res.status(404).json({
                message: "Recipient not found"
            });
        }

        const now = new Date();

        const expiryTime = new Date(
            now.getTime() + MESSAGE_EXPIRY_SECONDS * 1000
        );

        // Find all previous unread messages addressed to
        // the current user.
        //
        // Sending a reply indicates that the user has now
        // read the previous incoming messages.

        const unreadMessages = await Message.find({

            recipient: req.user.id,

            readAt: null

        }).select("_id");

        const unreadMessageIds = unreadMessages.map(
            msg => msg._id
        );

        // Mark previous incoming messages as read.
        // Their 60-second countdown starts now.

        if (unreadMessageIds.length > 0) {

            await Message.updateMany(

                {
                    _id: { $in: unreadMessageIds }
                },

                {
                    $set: {
                        readAt: now,
                        expiresAt: expiryTime
                    }
                }

            );

        }

        // Save the new outgoing message.
        // It remains unread for its recipient until they reply.

        const newMessage = await Message.create({

            sender: req.user.id,

            recipient: recipient._id,

            message: message.trim(),

            readAt: null,

            expiresAt: null,

            createdAt: now

        });

        // Populate sender and recipient information.
        const populatedMessage = await Message.findById(
            newMessage._id
        )
        .populate("sender", "username displayName role")
        .populate("recipient", "username displayName role");

        // Broadcast updated read status to connected clients.
        const io = req.app.get("io");

        if (unreadMessageIds.length > 0) {

            io.to("private-chat").emit("messagesRead", {
                messageIds: unreadMessageIds.map(id => id.toString()),
                readAt: now,
                expiresAt: expiryTime
            });

        }

        // Broadcast the new message.
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
