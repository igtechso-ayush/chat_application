import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const socket = io("http://localhost:3000", {
    withCredentials: true,
    extraHeaders: {
        token: sessionStorage.getItem("token"),
    },
});

const Chat = () => {
    const navigate = useNavigate();
    const { roomId } = useParams();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [roomName, setRoomName] = useState("");
    const [join, setJoin] = useState("");
    const currentUser = JSON.parse(sessionStorage.getItem("user"));

    // Video call states
    const [isCallActive, setIsCallActive] = useState(false);
    const [incomingCall, setIncomingCall] = useState(false);
    const [incomingUser, setIncomingUser] = useState(null);
    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [targetUser, setTargetUser] = useState("");
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnection = useRef(null);
    const iceCandidatesQueue = useRef([]);

    // Join room
    useEffect(() => {
        socket.emit("room-join", { roomId });
        socket.on("room-Joined", (data) => {
            setRoomName(data.data.roomName);
            setJoin(data.message);
        });

        return () => {
            socket.off("room-Joined");
        };
    }, [roomId]);

    // Receive message history
    useEffect(() => {
        socket.on("message-history", (data) => {
            setMessages(data.messages);
        });

        return () => {
            socket.off("message-history");
        };
    }, []);

    // Listen for incoming messages
    useEffect(() => {
        socket.on("recive-message", (message) => {
            setMessages((prevMessages) => [...prevMessages, message]);
        });

        return () => {
            socket.off("recive-message");
        };
    }, []);

    // Message delete/restore handling
    useEffect(() => {
        socket.on("message-deleted", ({ messageId }) => {
            setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                    msg.id === messageId ? { ...msg, isDeleted: true } : msg
                )
            );
        });

        socket.on("message-restored", ({ messageId }) => {
            setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                    msg.id === messageId ? { ...msg, isDeleted: false } : msg
                )
            );
        });

        return () => {
            socket.off("message-deleted");
            socket.off("message-restored");
        };
    }, []);

    // Video call events
    useEffect(() => {
        socket.on("video-call-request", (data) => {
            setIncomingUser({ callerId: data.callerId, callerName: data.callerName });
            setIncomingCall(true);
        });

        socket.on("video-call-accepted", async (data) => {
            await setupPeerConnection();
            const offer = await peerConnection.current.createOffer();
            await peerConnection.current.setLocalDescription(offer);
            socket.emit("video-offer", { roomId, target: data.accepterId, offer });
        });

        socket.on("video-call-rejected", () => {
            alert("Call was rejected.");
            endCall();
        });

        socket.on("received-offer", async (data) => {
            if (!peerConnection.current) await setupPeerConnection();
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.offer));
            await processIceCandidates();
            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            socket.emit("video-answer", { roomId, target: data.callerId, answer });
        });

        socket.on("received-answer", async (data) => {
            if (peerConnection.current && !peerConnection.current.remoteDescription) {
                await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        });

        socket.on("received-ice-candidate", async (data) => {
            if (peerConnection.current && peerConnection.current.remoteDescription) {
                await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
                iceCandidatesQueue.current.push(data.candidate);
            }
        });

        return () => {
            socket.off("video-call-request");
            socket.off("video-call-accepted");
            socket.off("video-call-rejected");
            socket.off("received-offer");
            socket.off("video-answer");
            socket.off("received-ice-candidate");
        };
    }, [roomId]);

    useEffect(() => {
        if (localVideoRef.current && stream) {
            localVideoRef.current.srcObject = stream;
        }
    }, [stream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    // Send message function
    const sendMessage = () => {
        if (newMessage.trim() !== "") {
            const messageData = { roomId, senderId: currentUser._id, text: newMessage };
            socket.emit("send-message", messageData);
            setNewMessage("");
        }
    };

    const deleteMessage = (messageId) => {
        socket.emit("delete-message", { messageId });
    };

    const undoMessage = (messageId) => {
        socket.emit("undo-message", { messageId });
    };

    const startVideoCall = () => {
        socket.emit("video-call-request", {
            roomId,
            callerId: currentUser._id,
            callerName: currentUser.name || "User",
        });
    };

    const acceptCall = async () => {
        try {
            socket.emit("video-call-accepted", { roomId, callerId: incomingUser.callerId, accepterId: currentUser._id });
            setIncomingCall(false);
            setTargetUser(currentUser._id);
        } catch (err) {
            console.error("Error accepting call:", err);
        }
    };

    const rejectCall = () => {
        if (incomingUser) {
            socket.emit("video-call-rejected", { roomId, callerId: incomingUser.callerId, rejecterId: currentUser._id });
            setIncomingCall(false);
            setIncomingUser(null);
        }
    };

    const endCall = () => {
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            setStream(null);
        }

        if (remoteStream) {
            remoteStream.getTracks().forEach((track) => track.stop());
            setRemoteStream(null);
        }

        if (peerConnection.current) {
            peerConnection.current.close();
            peerConnection.current = null;
        }

        setIsCallActive(false);
        socket.emit("video-call-ended", { roomId });
    };

    const setupPeerConnection = async () => {
        try {
            const userMedia = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setStream(userMedia);
            peerConnection.current = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
            userMedia.getTracks().forEach((track) => peerConnection.current.addTrack(track, userMedia));
            peerConnection.current.ontrack = (event) => {
                console.log("Received track:", event);
                if (event.streams[0]) setRemoteStream(event.streams[0]);
            };
            peerConnection.current.onicecandidate = (event) => {
                if (event.candidate) socket.emit("ice-candidate", { roomId, candidate: event.candidate });
            };
            setIsCallActive(true);
        } catch (err) {
            console.error("Error setting up peer connection:", err);
            alert("Could not access camera and microphone");
        }
    };

    const processIceCandidates = async () => {
        if (peerConnection.current && peerConnection.current.remoteDescription) {
            while (iceCandidatesQueue.current.length > 0) {
                const candidate = iceCandidatesQueue.current.shift();
                try {
                    await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (err) {
                    console.error("Error adding queued ICE candidate:", err);
                }
            }
        }
    };

    const handleLogout = async () => {
        try {
            await axios.post("http://localhost:3000/api/auth/logout", {}, { withCredentials: true });
            sessionStorage.removeItem("token");
            sessionStorage.removeItem("user");
            navigate("/");
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            <div className="bg-blue-500 text-white p-4 text-lg font-bold flex justify-between">
                {currentUser.name}: {roomName || "Loading..."}
                <button onClick={handleLogout}>Logout</button>
            </div>

            <div>{join && <p className="text-gray-500 text-center">{join}</p>}</div>

            {isCallActive && (
                <div className="bg-gray-800 p-4 relative">
                    <div className="flex justify-center">
                        <div className="w-full max-w-3xl h-64 bg-black rounded-lg overflow-hidden">
                            <video ref={remoteVideoRef} className="w-full h-full object-cover" autoPlay playsInline />
                        </div>
                        <div className="absolute bottom-8 right-8 w-32 h-24 bg-gray-700 rounded-lg overflow-hidden border-2 border-white">
                            <video ref={localVideoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
                        </div>
                    </div>
                    <div className="flex justify-center mt-2">
                        <button className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600" onClick={endCall}>
                            End Call
                        </button>
                    </div>
                </div>
            )}

            {incomingCall && !isCallActive && (
                <div className="bg-yellow-100 p-4 border-l-4 border-yellow-500">
                    <div className="flex justify-between items-center">
                        <p className="font-semibold">Incoming video call from {incomingUser.callerName || "User"}</p>
                        <div className="flex space-x-2">
                            <button className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600" onClick={acceptCall}>
                                Accept
                            </button>
                            <button className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600" onClick={rejectCall}>
                                Reject
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-auto p-4">
                {messages.length > 0 ? (
                    messages.map((msg, index) => (
                        <div key={msg.id || index} className={`p-2 my-2 max-w-xs rounded-lg ${msg.senderId === currentUser._id ? "ml-auto bg-blue-500 text-white" : "bg-gray-300 text-black"}`}>
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <strong>{msg.senderId === currentUser._id ? "You" : msg.senderName || "User"}:</strong>
                                    {msg.isDeleted ? (
                                        <em className="text-gray-400">This message was deleted</em>
                                    ) : (
                                        <span>{msg.text}</span>
                                    )}
                                </div>
                                {msg.senderId === currentUser._id && !msg.isDeleted && (
                                    <button onClick={() => deleteMessage(msg.id)} className="ml-2 text-xs opacity-60 hover:opacity-100">
                                        🗑️
                                    </button>
                                )}
                                {msg.senderId === currentUser._id && msg.isDeleted && (
                                    <button onClick={() => undoMessage(msg.id)} className="ml-2 text-xs opacity-60 hover:opacity-100">
                                        🗑️
                                    </button>
                                )}
                            </div>
                            {msg.createdAt && (
                                <div className="text-xs opacity-60 mt-1">
                                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            )}
                        </div>
                    ))
                ) : (
                    <p className="text-gray-500 text-center">No messages yet...</p>
                )}
            </div>

            <div className="p-4 flex bg-white border-t">
                <input
                    type="text"
                    className="flex-1 p-2 border rounded-lg"
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                />
                <button
                    className={`ml-2 px-4 py-2 ${isCallActive ? "bg-gray-500 cursor-not-allowed" : "bg-green-500 hover:bg-green-600"} text-white rounded-lg flex items-center`}
                    onClick={!isCallActive ? startVideoCall : null}
                    disabled={isCallActive}
                >
                    📹 Video
                </button>
                <button className="ml-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600" onClick={sendMessage}>
                    Send
                </button>
            </div>
        </div>
    );
};

export default Chat;
