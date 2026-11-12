
// import { useEffect, useRef, useState } from "react";
// import { fetchMessages, sendMessage } from "../api";
// import { createSocket } from "../socket";

// function mergeMessages(existing, incoming) {
//   const messageMap = new Map();

//   [...existing, ...incoming].forEach((message) => {
//     messageMap.set(String(message._id), message);
//   });

//   return Array.from(messageMap.values()).sort(
//     (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
//   );
// }

// export default function ChatPage({ token, user, onLogout }) {
//   const [messages, setMessages] = useState([]);
//   const [messageText, setMessageText] = useState("");
//   const [loading, setLoading] = useState(true);
//   const [sending, setSending] = useState(false);
//   const [error, setError] = useState("");
//   const [connected, setConnected] = useState(false);

//   const bottomRef = useRef(null);
//   const socketRef = useRef(null);

//   // Add a message without creating duplicates.
//   function addMessage(message) {
//     setMessages((previous) => mergeMessages(previous, [message]));
//   }

//   // Connect to Socket.IO and retrieve recent messages.
//   useEffect(() => {
//     let active = true;

//     const socket = createSocket(token);
//     socketRef.current = socket;

//     socket.on("connect", () => {
//       if (active) setConnected(true);
//     });

//     socket.on("disconnect", () => {
//       if (active) setConnected(false);
//     });

//     socket.on("connect_error", (err) => {
//       if (active) {
//         setConnected(false);

//         if (
//           err.message.includes("expired") ||
//           err.message.includes("Invalid")
//         ) {
//           setError("Your session has expired. Please log in again.");
//         }
//       }
//     });

//     socket.on("newMessage", (message) => {
//       if (active) addMessage(message);
//     });

//     async function loadMessages() {
//       try {
//         const data = await fetchMessages(token);

//         if (active) {
//           // Merge rather than replace. This prevents losing a message
//           // received through Socket.IO while the history is loading.
//           setMessages((previous) => mergeMessages(previous, data));
//         }
//       } catch (err) {
//         if (active) {
//           setError(err.message);

//           if (
//             err.message.includes("session") ||
//             err.message.includes("expired") ||
//             err.message.includes("Authentication")
//           ) {
//             onLogout();
//           }
//         }
//       } finally {
//         if (active) setLoading(false);
//       }
//     }

//     loadMessages();

//     return () => {
//       active = false;
//       socket.removeAllListeners();
//       socket.disconnect();
//       socketRef.current = null;
//     };
//   }, [token]);

//   // Automatically scroll to the newest message.
//   useEffect(() => {
//     bottomRef.current?.scrollIntoView({ behavior: "smooth" });
//   }, [messages]);

//   async function handleSend(event) {
//     event.preventDefault();

//     const text = messageText.trim();

//     if (!text || sending) return;

//     setSending(true);
//     setError("");

//     try {
//       const savedMessage = await sendMessage(token, text);

//       // The server also broadcasts this message through Socket.IO.
//       // mergeMessages prevents it appearing twice.
//       addMessage(savedMessage);

//       setMessageText("");
//     } catch (err) {
//       setError(err.message);

//       if (
//         err.message.includes("session") ||
//         err.message.includes("expired") ||
//         err.message.includes("Authentication")
//       ) {
//         onLogout();
//       }
//     } finally {
//       setSending(false);
//     }
//   }

//   function formatTime(date) {
//     return new Date(date).toLocaleTimeString([], {
//       hour: "2-digit",
//       minute: "2-digit"
//     });
//   }

//   return (
//     <main className="chat-screen">
//       <section className="chat-container">

//         <header className="chat-header">
//           <div className="header-user">
//             <div className={`avatar ${user.role}`}>
//               {user.displayName.charAt(0).toUpperCase()}
//             </div>

//             <div>
//               <h2>WebChat</h2>
//               <p>Signed in as {user.displayName}</p>
//             </div>
//           </div>

//           <div className="header-actions">
//             <div className="connection-status">
//               <span className={`status-dot ${connected ? "online" : "offline"}`} />
//               {connected ? "Connected" : "Connecting..."}
//             </div>

//             <button
//               type="button"
//               className="logout-button"
//               onClick={onLogout}
//             >
//               Log out
//             </button>
//           </div>
//         </header>

//         <div className="chat-info">
//           <span>Private conversation</span>
//           <span>Last 60 seconds of messages</span>
//         </div>

//         <div className="messages-area">
//           {loading ? (
//             <div className="empty-state">
//               Loading messages...
//             </div>
//           ) : messages.length === 0 ? (
//             <div className="empty-state">
//               <div className="empty-icon">💬</div>
//               <h3>No recent messages</h3>
//               <p>Send a message to start the conversation.</p>
//             </div>
//           ) : (
//             messages.map((message) => {
//               const senderId = message.sender?._id;
//               const isOwnMessage =
//                 String(senderId) === String(user.id);

//               const senderName =
//                 message.sender?.displayName || "User";

//               const senderRole = message.sender?.role || "userA";

//               return (
//                 <div
//                   key={message._id}
//                   className={`message-row ${
//                     isOwnMessage ? "message-own" : "message-other"
//                   }`}
//                 >
//                   {!isOwnMessage && (
//                     <div className={`avatar small ${senderRole}`}>
//                       {senderName.charAt(0).toUpperCase()}
//                     </div>
//                   )}

//                   <div className="message-content">
//                     {!isOwnMessage && (
//                       <span className="message-sender">
//                         {senderName}
//                       </span>
//                     )}

//                     <div className="message-bubble">
//                       {message.text}
//                     </div>

//                     <span className="message-time">
//                       {formatTime(message.createdAt)}
//                     </span>
//                   </div>
//                 </div>
//               );
//             })
//           )}

//           <div ref={bottomRef} />
//         </div>

//         {error && (
//           <div className="chat-error">
//             {error}
//           </div>
//         )}

//         <form className="message-form" onSubmit={handleSend}>
//           <input
//             type="text"
//             placeholder="Write a message..."
//             value={messageText}
//             onChange={(event) => setMessageText(event.target.value)}
//             maxLength={5000}
//             disabled={sending}
//           />

//           <button
//             type="submit"
//             disabled={!messageText.trim() || sending}
//           >
//             {sending ? "Sending..." : "Send"}
//             <span>➤</span>
//           </button>
//         </form>

//         <footer className="chat-footer">
//           Private two-person messaging
//         </footer>

//       </section>
//     </main>
//   );
// }
