
import { useState, useEffect, useRef, useCallback } from "react";
import { createSocket } from "./socket";
import "./App.css";

const API_URL = import.meta.env.VITE_BACKEND_API_URL;

function App() {

    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");

    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState("");

    const socketRef = useRef(null);
    const messagesEndRef = useRef(null);

    // Prevent unnecessary simultaneous message requests.
    const refreshPromiseRef = useRef(null);

    // Scroll to latest message.
    useEffect(() => {

        messagesEndRef.current?.scrollIntoView({
            behavior: "smooth"
        });

    }, [messages]);


    // FETCH AND SYNCHRONISE MESSAGES
    const refreshMessages = useCallback(async () => {

        if (!token) return;

        // Reuse an existing request if one is already running.
        if (refreshPromiseRef.current) {
            return refreshPromiseRef.current;
        }

        const request = (async () => {

            try {

                console.log("Synchronising messages...");

                const response = await fetch(
                    `${API_URL}/api/messages`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                );

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || "Unable to retrieve messages");
                }

                const now = Date.now();

                // Merge the server response with any messages
                // received through Socket.IO during the request.
                setMessages(previous => {

                    const messageMap = new Map();

                    // Server response is authoritative.
                    data.forEach(message => {
                        messageMap.set(message._id, message);
                    });

                    // Preserve messages received while the request
                    // was running, provided they have not expired.
                    previous.forEach(message => {

                        const expiry = message.expiresAt
                            ? new Date(message.expiresAt).getTime()
                            : null;

                        const stillVisible =
                            !message.readAt ||
                            (expiry !== null && expiry > now);

                        if (
                            stillVisible &&
                            !messageMap.has(message._id)
                        ) {
                            messageMap.set(message._id, message);
                        }

                    });

                    return Array.from(messageMap.values()).sort(
                        (a, b) =>
                            new Date(a.createdAt) -
                            new Date(b.createdAt)
                    );

                });

                console.log(
                    "Messages synchronised successfully:",
                    data.length
                );

            } catch (err) {

                console.error("Message synchronisation failed:", err);

                setError(err.message || "Unable to synchronise messages");

            }

        })();

        refreshPromiseRef.current = request;

        try {
            await request;
        } finally {
            refreshPromiseRef.current = null;
        }

    }, [token]);


    // LOGIN
    const handleLogin = async (e) => {

        e.preventDefault();

        setError("");
        setLoading(true);

        try {

            const response = await fetch(
                `${API_URL}/api/login`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
                        username,
                        password
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            // Authentication stays in memory only.
            setToken(data.token);
            setUser(data.user);

            setPassword("");

        } catch (err) {

            setError(err.message || "Login failed");

        } finally {

            setLoading(false);

        }

    };


    // CHAT INITIALISATION AND BACKGROUND SYNCHRONISATION
    useEffect(() => {

        if (!token || !user) return;

        let active = true;

        // Connect Socket.IO.
        const socket = createSocket(token);

        socketRef.current = socket;


        // Initial message retrieval.
        refreshMessages();


        // Receive new messages instantly.
        socket.on("newMessage", (message) => {

            if (!active) return;

            setMessages(previous => {

                const exists = previous.some(
                    item => item._id === message._id
                );

                if (exists) return previous;

                return [...previous, message].sort(
                    (a, b) =>
                        new Date(a.createdAt) -
                        new Date(b.createdAt)
                );

            });

        });


        // Receive message read-status updates.
        socket.on("messagesRead", (data) => {

            if (!active) return;

            const messageIds = new Set(
                data.messageIds.map(id => id.toString())
            );

            setMessages(previous =>

                previous.map(message => {

                    if (messageIds.has(message._id.toString())) {

                        return {
                            ...message,
                            readAt: data.readAt,
                            expiresAt: data.expiresAt
                        };

                    }

                    return message;

                })

            );

        });


        // Synchronise after Socket.IO connects or reconnects.
        socket.on("connect", () => {

            if (!active) return;

            console.log("Socket connected. Refreshing messages.");

            refreshMessages();

        });


        socket.on("connect_error", (err) => {

            if (active) {
                console.error("Socket connection error:", err.message);
            }

        });


        // Detect when the mobile shortcut or browser tab
        // returns to the foreground.
        const handleAppResume = () => {

            if (!active) return;

            if (document.visibilityState !== "visible") return;

            console.log("App resumed. Synchronising messages.");

            // Reconnect if the mobile browser suspended the socket.
            if (!socket.connected) {
                socket.connect();
            }

            // Always retrieve the latest messages from MongoDB.
            refreshMessages();

        };


        // App returns from background.
        document.addEventListener(
            "visibilitychange",
            handleAppResume
        );


        // Handles restored pages, including mobile browsers.
        window.addEventListener(
            "pageshow",
            handleAppResume
        );


        // Handles window/tab focus.
        window.addEventListener(
            "focus",
            handleAppResume
        );


        // Handles restored internet connectivity.
        window.addEventListener(
            "online",
            handleAppResume
        );


        return () => {

            active = false;

            socket.off("newMessage");
            socket.off("messagesRead");
            socket.off("connect");
            socket.off("connect_error");

            document.removeEventListener(
                "visibilitychange",
                handleAppResume
            );

            window.removeEventListener(
                "pageshow",
                handleAppResume
            );

            window.removeEventListener(
                "focus",
                handleAppResume
            );

            window.removeEventListener(
                "online",
                handleAppResume
            );

            socket.disconnect();

            if (socketRef.current === socket) {
                socketRef.current = null;
            }

        };

    }, [token, user, refreshMessages]);


    // AUTOMATICALLY REMOVE EXPIRED MESSAGES
    useEffect(() => {

        const now = Date.now();

        const expiryTimes = messages
            .filter(message => message.expiresAt)
            .map(message => new Date(message.expiresAt).getTime())
            .filter(expiry => expiry > now);

        if (expiryTimes.length === 0) {

            // Remove messages that have already expired.
            setMessages(previous =>
                previous.filter(message =>
                    !message.expiresAt ||
                    new Date(message.expiresAt).getTime() > now
                )
            );

            return;

        }

        const nextExpiry = Math.min(...expiryTimes);

        const timeout = setTimeout(() => {

            const currentTime = Date.now();

            setMessages(previous =>
                previous.filter(message =>
                    !message.expiresAt ||
                    new Date(message.expiresAt).getTime() > currentTime
                )
            );

        }, Math.max(0, nextExpiry - now));

        return () => clearTimeout(timeout);

    }, [messages]);


    // SEND MESSAGE
    const handleSendMessage = async (e) => {

        e.preventDefault();

        if (!newMessage.trim() || sending) return;

        const messageText = newMessage;

        setSending(true);
        setError("");

        try {

            const response = await fetch(
                `${API_URL}/api/messages`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",

                        Authorization: `Bearer ${token}`
                    },

                    body: JSON.stringify({
                        message: messageText
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message);
            }

            // Socket.IO broadcasts the message to both users.
            // No manual append is needed here.

            setNewMessage("");

        } catch (err) {

            setError(err.message || "Message could not be sent");

        } finally {

            setSending(false);

        }

    };


    // LOGOUT
    const handleLogout = () => {

        socketRef.current?.disconnect();

        socketRef.current = null;

        setMessages([]);
        setUser(null);
        setToken(null);

        setUsername("");
        setPassword("");
        setNewMessage("");
        setError("");

    };


    // FORMAT MESSAGE TIME
    const formatTime = (date) => {

        return new Date(date).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });

    };


    // LOGIN PAGE
    if (!user) {

        return (

            <div className="login-page">

                <div className="login-card">

                    <div className="login-icon">
                        <span>💬</span>
                    </div>

                    <h1>Share what is been happening</h1>

                    <p className="login-subtitle">
                        Sign in to continue your conversation
                    </p>

                    <form onSubmit={handleLogin}>

                        <label>Username</label>

                        <input
                            type="text"
                            placeholder="Enter your username"
                            value={username}
                            onChange={e =>
                                setUsername(e.target.value)
                            }
                            required
                        />

                        <label>Password</label>

                        <input
                            type="password"
                            placeholder="Enter your password"
                            value={password}
                            onChange={e =>
                                setPassword(e.target.value)
                            }
                            required
                        />

                        {error && (
                            <div className="error-message">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="login-button"
                            disabled={loading}
                        >
                            {loading ? "Signing in..." : "Login"}
                        </button>

                    </form>

                    <div className="login-footer">
                        Secure private messaging
                    </div>

                </div>

            </div>

        );

    }


    // CHAT PAGE
    return (

        <div className="chat-page">

            <div className="chat-container">

                {/* HEADER */}

                <header className="chat-header">

                    <div className="header-left">

                        <div className="header-icon">
                            💬
                        </div>

                        <div>
                            <h2>Hey ! Is life going amazing?</h2>

                            <p>
                                Explore the life
                            </p>
                        </div>

                    </div>

                    <div className="header-right">

                        <div className="logged-user">
                            <span className="online-dot"></span>

                            {user.displayName}
                        </div>

                        <button
                            className="logout-button"
                            onClick={handleLogout}
                        >
                            Logout
                        </button>

                    </div>

                </header>


                {/* USER INFORMATION */}

                <div className="participants">

                    <div className="participant">

                        <div className="avatar avatar-a">
                            A
                        </div>

                        <div>
                            <strong>Sami</strong>
                            <span>Participant 1</span>
                        </div>

                    </div>

                    <div className="conversation-label">
                        <span className="online-dot"></span>
                        Private conversation
                    </div>

                    <div className="participant participant-right">

                        <div>
                            <strong>PK</strong>
                            <span>Participant 2</span>
                        </div>

                        <div className="avatar avatar-b">
                            B
                        </div>

                    </div>

                </div>


                {/* MESSAGES */}

                <main className="messages-area">

                    <div className="history-label">
                        <span>Older messages are deleted</span>
                    </div>

                    {messages.length === 0 && (

                        <div className="empty-chat">

                            <div>👋</div>

                            <h3>No recent messages</h3>

                            <p>
                                Send a message to start the conversation.
                            </p>

                        </div>

                    )}

                    {messages.map((msg) => {

                        const isUserA =
                            msg.sender?.role === "userA";

                        const isMine =
                            msg.sender?._id === user.id ||
                            msg.sender?.toString() === user.id;

                        return (

                            <div
                                key={msg._id}
                                className={`message-row ${
                                    isUserA ? "message-a" : "message-b"
                                }`}
                            >

                                <div className={`message-avatar ${
                                    isUserA ? "avatar-a" : "avatar-b"
                                }`}>
                                    {isUserA ? "A" : "B"}
                                </div>

                                <div className="message-content">

                                    <div className="message-name">
                                        {isUserA ? "Sami" : "PK"}
                                        {isMine && " (You)"}
                                    </div>

                                    <div className="message-bubble">

                                        {msg.message}

                                    </div>

                                    <div className="message-time">
                                        {formatTime(msg.createdAt)}
                                    </div>

                                </div>

                            </div>

                        );

                    })}

                    <div ref={messagesEndRef} />

                </main>


                {/* ERROR */}

                {error && (
                    <div className="chat-error">
                        {error}
                    </div>
                )}


                {/* MESSAGE INPUT */}

                <form
                    className="message-input-area"
                    onSubmit={handleSendMessage}
                >

                    <input
                        type="text"
                        placeholder="Type your message..."
                        value={newMessage}
                        onChange={e =>
                            setNewMessage(e.target.value)
                        }
                        maxLength={5000}
                    />

                    <button
                        type="submit"
                        disabled={!newMessage.trim() || sending}
                    >
                        {sending ? "Sending..." : "Send ➤"}
                    </button>

                </form>

                <footer className="chat-footer">
                    Messages are delivered in real time
                </footer>

            </div>

        </div>

    );

}

export default App;
