
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_BACKEND_API_URL;

export function createSocket(token) {

    return io(API_URL, {

        auth: {
            token
        },

        autoConnect: true,

        // Automatically reconnect when connectivity is interrupted.
        reconnection: true,

        // Continue reconnecting instead of stopping after five attempts.
        reconnectionAttempts: Infinity,

        // Initial reconnection delay.
        reconnectionDelay: 1000,

        // Maximum reconnection delay.
        reconnectionDelayMax: 5000,

        // Connection timeout.
        timeout: 20000

    });

}
