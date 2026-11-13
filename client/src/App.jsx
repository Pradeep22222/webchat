
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
    const chatContainerRef = useRef(null);

    // Prevent multiple simultaneous message-fetch requests.
    const refreshPromiseRef = useRef(null);

    // Track whether the user is currently near the bottom.
    const shouldAutoScrollRef = useRef(true);

    // Track message changes so read-status updates do not trigger scrolling.
    const previousMessageCountRef = useRef(0);
    const previousLastMessageIdRef = useRef(null);

    // Determine whether a message belongs to the logged-in user.
    const isOwnMessage = useCallback((message) => {
        const senderId =
            message.sender?._id || message.sender;

        const currentUserId = user?._id || user?.id;

        return (
            senderId &&
            currentUserId &&
            senderId.toString() === currentUserId.toString()
        );
    }, [user]);


    // TRACK USER SCROLL POSITION.
    const handleChatScroll = () => {
        const container = chatContainerRef.current;

        if (!container) return;

        const distanceFromBottom =
            container.scrollHeight -
            container.scrollTop -
            container.clientHeight;

        // Consider the user at the bottom if within 100px.
        shouldAutoScrollRef.current = distanceFromBottom < 100;
    };


    // CONTROLLED AUTOMATIC SCROLLING.
    useEffect(() => {
        const container = chatContainerRef.current;

        const currentCount = messages.length;
        const latestMessage = messages[currentCount - 1];
        const latestMessageId = latestMessage?._id || null;

        const messageWasAdded =
            currentCount > previousMessageCountRef.current;

        const latestMessageChanged =
            latestMessageId !== previousLastMessageIdRef.current;

        // Scroll only when a new latest message has been added.
        // Do not scroll for read-status updates or message expiry.
        if (
            container &&
            messageWasAdded &&
            latestMessageChanged
        ) {
            const shouldScroll =
                shouldAutoScrollRef.current ||
                isOwnMessage(latestMessage);

            if (shouldScroll) {
                // Immediate scrolling: no slow smooth-scroll animation.
                container.scrollTop = container.scrollHeight;
            }
        }

        previousMessageCountRef.current = currentCount;
        previousLastMessageIdRef.current = latestMessageId;

    }, [messages, isOwnMessage]);


    // FETCH AND SYNCHRONISE MESSAGES.
    const refreshMessages = useCallback(async () => {
        if (!token) return;

        // Avoid unnecessary simultaneous requests.
        if (refreshPromiseRef.current) {
            return refreshPromiseRef.current;
        }

        const request = (async () => {
            const requestStartedAt = Date.now();

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
                    throw new Error(
                        data.message || "Unable to retrieve messages"
                    );
                }

                if (!Array.isArray(data)) {
                    throw new Error("Invalid message response from server");
                }

                const now = Date.now();

                setMessages(previous => {
                    const messageMap = new Map();

                    // Server response is authoritative.
                    data.forEach(message => {
                        messageMap.set(message._id, message);
                    });

                    // Preserve new Socket.IO messages received
                    // while the API request was running.
                    previous.forEach(message => {
                        const createdAt = new Date(
                            message.createdAt
                        ).getTime();

                        const expiry = message.expiresAt
                            ? new Date(message.expiresAt).getTime()
                            : null;

                        const notExpired =
                            expiry === null || expiry > now;

                        const receivedDuringRequest =
                            createdAt >= requestStartedAt;

                        if (
                            receivedDuringRequest &&
                            notExpired &&
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
                console.error(
                    "Message synchronisation failed:",
                    err
                );

                setError(
                    err.message || "Unable to synchronise messages"
                );
            }
        })();

        refreshPromiseRef.current = request;

        try {
            await request;
        } finally {
            refreshPromiseRef.current = null;
        }

    }, [token]);


    // LOGIN.
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
                throw new Error(data.message || "Login failed");
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


    // CHAT INITIALISATION AND BACKGROUND SYNCHRONISATION.
    useEffect(() => {
        if (!token || !user) return;

        let active = true;

        // Create authenticated Socket.IO connection.
        const socket = createSocket(token);

        socketRef.current = socket;

        // Initial message retrieval after login.
        refreshMessages();


        // RECEIVE NEW MESSAGES IN REAL TIME.
        const handleNewMessage = (message) => {
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
        };

        socket.on("newMessage", handleNewMessage);


        // RECEIVE MESSAGE READ-STATUS UPDATES.
        const handleMessagesRead = (data) => {
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
        };

        socket.on("messagesRead", handleMessagesRead);


        // SOCKET CONNECTION AND RECONNECTION.
        const handleSocketConnect = () => {
            if (!active) return;

            console.log(
                "Socket connected. Synchronising messages."
            );

            refreshMessages();
        };

        socket.on("connect", handleSocketConnect);


        const handleConnectError = (err) => {
            if (!active) return;

            console.error(
                "Socket connection error:",
                err.message
            );
        };

        socket.on("connect_error", handleConnectError);


        // MOBILE APP / BROWSER RESUME HANDLER.
        const handleAppResume = () => {
            if (!active) return;

            if (document.visibilityState !== "visible") {
                return;
            }

            console.log(
                "App returned to foreground. Synchronising messages."
            );

            // Reconnect Socket.IO if the connection was suspended.
            if (!socket.connected) {
                socket.connect();
            }

            // Retrieve messages missed while the app was suspended.
            refreshMessages();
        };


        // Detect when the app becomes visible again.
        document.addEventListener(
            "visibilitychange",
            handleAppResume
        );

        // Detect restored or resumed pages.
        window.addEventListener(
            "pageshow",
            handleAppResume
        );

        // Detect when the browser window regains focus.
        window.addEventListener(
            "focus",
            handleAppResume
        );

        // Detect when internet connectivity returns.
        window.addEventListener(
            "online",
            handleAppResume
        );


        // CLEANUP.
        return () => {
            active = false;

            socket.off("newMessage", handleNewMessage);
            socket.off("messagesRead", handleMessagesRead);
            socket.off("connect", handleSocketConnect);
            socket.off("connect_error", handleConnectError);

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


    // AUTOMATICALLY REMOVE EXPIRED MESSAGES.
    useEffect(() => {
        const now = Date.now();

        const hasExpiredMessages = messages.some(message => {
            if (!message.expiresAt) return false;

            const expiry = new Date(
                message.expiresAt
            ).getTime();

            return expiry <= now;
        });

        if (hasExpiredMessages) {
            setMessages(previous =>
                previous.filter(message => {
                    if (!message.expiresAt) return true;

                    return (
                        new Date(message.expiresAt).getTime() >
                        Date.now()
                    );
                })
            );

            return;
        }

        // Find the next message expiry time.
        const expiryTimes = messages
            .filter(message => message.expiresAt)
            .map(message =>
                new Date(message.expiresAt).getTime()
            )
            .filter(expiry => expiry > now);

        if (expiryTimes.length === 0) return;

        const nextExpiry = Math.min(...expiryTimes);

        // Schedule removal when the next message expires.
        const timeout = setTimeout(() => {
            const currentTime = Date.now();

            setMessages(previous =>
                previous.filter(message => {
                    if (!message.expiresAt) return true;

                    return (
                        new Date(message.expiresAt).getTime() >
                        currentTime
                    );
                })
            );
        }, Math.max(0, nextExpiry - now));

        return () => clearTimeout(timeout);

    }, [messages]);


    // SEND MESSAGE.
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
                throw new Error(
                    data.message || "Message could not be sent"
                );
            }

            // Socket.IO broadcasts the message to both users.
            // No manual append is needed here.
            setNewMessage("");

        } catch (err) {
            setError(
                err.message || "Message could not be sent"
            );

        } finally {
            setSending(false);
        }
    };


    // LOGOUT.
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

        // Reset scroll tracking for the next login.
        shouldAutoScrollRef.current = true;
        previousMessageCountRef.current = 0;
        previousLastMessageIdRef.current = null;
    };


    // FORMAT MESSAGE TIME.
    const formatTime = (date) => {
        return new Date(date).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    };


    // LOGIN PAGE.
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


    // CHAT PAGE.
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
                            <p>Explore the life</p>
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
                <main
                    className="messages-area"
                    ref={chatContainerRef}
                    onScroll={handleChatScroll}
                >

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

                        const isMine = isOwnMessage(msg);

                        return (
                            <div
                                key={msg._id}
                                className={`message-row ${
                                    isUserA ? "message-a" : "message-b"
                                }`}
                            >

                                <div
                                    className={`message-avatar ${
                                        isUserA ? "avatar-a" : "avatar-b"
                                    }`}
                                >
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
