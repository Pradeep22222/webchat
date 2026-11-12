import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_BACKEND_API_URL;

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