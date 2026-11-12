import { io } from "socket.io-client";

const API_URL =
    import.meta.env.BACKEND_API_URL || "http://localhost:5000";

export function createSocket(token) {

    return io(API_URL, {
        auth: {
            token
        },

        autoConnect: true,

        reconnection: true,

        reconnectionAttempts: 5
    });

}