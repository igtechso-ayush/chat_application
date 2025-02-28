// In Chat.js
import axios from "axios";
import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";

const socket = io("https://chat-application-96bk.onrender.com", {
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
    const token = sessionStorage.getItem("token");

    // Video call states
    const [isCallActive, setIsCallActive] = useState(false);
    const [incomingCall, setIncomingCall] = useState(false);
    const [incomingUser, setIncomingUser] = useState(null);
    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnection = useRef(null);
    const pendingIceCandidates = useRef([]);
    const [callEnded, setCallEnded] = useState(false);

    // Join room on component mount
    useEffect(() => {
        if(token){
            io("https://chat-application-96bk.onrender.com", {
                withCredentials: true,
                extraHeaders: {
                    token: sessionStorage.getItem("token"),
                },
            }); 
        }

        socket.emit("room-join", { roomId });

        socket.on("room-Joined", (data) => {
            try {
                const room = data.data;
                setRoomName(room.roomName);
                setJoin(data.message);
            } catch (e) {
                console.error("Failed to join room", e);
            }
        });

        return () => {
            socket.off("room-Joined");
        };
    }, [roomId]);

    // Listen for message history
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

    // Listen for deleted messages
    useEffect(() => {
        socket.on("message-deleted", ({ messageId }) => {
            setMessages(prevMessages =>
                prevMessages.map(msg =>
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

        socket.on("error", (error) => {
            alert(error.message);
        });

        return () => {
            socket.off("message-deleted");
            socket.off("message-restored");
            socket.off("error");
        };
    }, []);

    // WebRTC and video call event listeners
    useEffect(() => {
        // Video call related socket events
        socket.on("video-call-request", (data) => {
            setIncomingUser({
                callerId: data.callerId,
                callerName: data.callerName
            });
            setIncomingCall(true);

        });

        socket.on("video-call-accepted", async (data) => {
            try {
                // Create peer connection when call is accepted
                await setupPeerConnection();

                // Create and send offer to the other peer
                const offer = await peerConnection.current.createOffer();
          await peerConnection.current.setLocalDescription(new RTCSessionDescription(offer));
                socket.emit("video-offer", {
                    roomId,
                    target: data.accepterId,
                    offer: offer
                });
            } catch (err) {
                console.error("Error creating offer:", err);
            }
        });

        socket.on("video-call-rejected", (data) => {
            alert(`Call was rejected by ${data.rejecterName || 'the user'}`);
            endCall();
        });

        socket.on("video-offer", async (data) => {
            console.log("video-offer", data);
            try {
                // Check if peerConnection is initialized
                if (!peerConnection.current) {
                    // Initialize peer connection if not already initialized
                    await setupPeerConnection();
                }
        
                // Now check if the signaling state is stable
                if (peerConnection.current.signalingState === "stable") {
                    // Set remote description when receiving an offer
                    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.offer));
                    await processPendingCandidates();
        
                    // Create an answer once remote description is set
                    const answer = await peerConnection.current.createAnswer();
                    await peerConnection.current.setLocalDescription(answer);
        
                    // Send the answer back to the caller
                    socket.emit("video-answer", {
                        roomId,
                        target: data.callerId,
                        answer: answer
                    });
                } else {
                    // Log if the state is not stable and cannot process the offer
                    console.warn("PeerConnection is not in stable state to handle offer:", peerConnection.current.signalingState);
                }
            } catch (err) {
                console.error("Error handling offer:", err);
            }
        });
        
        

        socket.on("video-answer", async (data) => {
            try {
                if (peerConnection.current && peerConnection.current.signalingState === "have-local-offer") {
                    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
                } else {
                    console.warn("Cannot set remote answer because signaling state is incorrect:", peerConnection.current.signalingState);
                }
            } catch (err) {
                console.error("Error handling answer:", err);
            }
        });

        socket.on("video-ice-candidate", async (data) => {
            try {
                if (peerConnection.current && peerConnection.current.remoteDescription) {
                    await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
                } else {
                    // Store the candidate for later
                    pendingIceCandidates.current.push(data.candidate);
                    console.log("ICE candidate stored for later processing");
                }
            } catch (err) {
                console.error("Error adding ICE candidate:", err);
            }
        });


        return () => {
            socket.off("video-call-request");
            socket.off("video-call-accepted");
            socket.off("video-call-rejected");
            socket.off("video-offer");
            socket.off("video-answer");
            socket.off("video-ice-candidate");
        };
    }, [roomId]);
    useEffect(() => {
        // Listen for the video call ended event
        socket.on("video-call-ended", () => {
            // Only show alert if call wasn't ended already
            if (!callEnded) {
                alert("Call has ended");
                setCallEnded(true);
                endCall(); // End the call for the user who receives the event
            }
        });

        return () => {
            socket.off("video-call-ended");
        };
    }, [callEnded]);

    // Set up video refs when streams are available
    useEffect(() => {
        if (localVideoRef.current && stream) {
            localVideoRef.current.srcObject = stream;
        }
    }, [stream, localVideoRef]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream, remoteVideoRef]);

    // Clean up on unmount
    useEffect(() => {
        return () => {
            endCall();
        };
    }, []);
    const processPendingCandidates = async () => {
        if (pendingIceCandidates.current.length > 0 && 
            peerConnection.current && 
            peerConnection.current.remoteDescription) {
            
            console.log(`Processing ${pendingIceCandidates.current.length} pending ICE candidates`);
            
            try {
                for (const candidate of pendingIceCandidates.current) {
                    await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
                }
                pendingIceCandidates.current = [];
            } catch (err) {
                console.error("Error processing pending ICE candidates:", err);
            }
        }
    };
    // Set up WebRTC peer connection
    const setupPeerConnection = async () => {
        try {
            // Get local media stream
            const userMedia = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            setStream(userMedia);

            // Create new RTCPeerConnection
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });
            // const pc = new RTCPeerConnection()
            // Add local tracks to peer connection
            userMedia.getTracks().forEach(track => {
                pc.addTrack(track, userMedia);
            });

            // Handle incoming tracks (remote stream)
            pc.ontrack = (event) => {
                setRemoteStream(event.streams[0]);
            };

            // Handle ICE candidates
            pc.onicecandidate = (event) => {
                // console.log("event", event)
                if (event.candidate) {
                    socket.emit("video-ice-candidate", {
                        roomId,
                        candidate: event.candidate
                    });
                }
            };

            peerConnection.current = pc;
            setIsCallActive(true);

            return pc;
        } catch (err) {
            console.error("Error setting up peer connection:", err);
            alert("Could not access camera and microphone");
            throw err;
        }
    };

    // Send message function
    const sendMessage = () => {
        if (newMessage.trim() !== "") {
            const messageData = {
                roomId,
                senderId: currentUser._id,
                text: newMessage
            };
            socket.emit("send-message", messageData);
            setNewMessage("");
        }
    };

    // Delete message function
    const deleteMessage = (messageId) => {
        socket.emit("delete-message", { messageId });
    };
    const undoMessage = (messageId) => {
        socket.emit("undo-message", { messageId });
    };
    // Start video call
    const startVideoCall = () => {
        socket.emit("video-call-request", {
            roomId,
            callerId: currentUser._id,
            callerName: currentUser.userName || "User"
        });
    };

    // Accept incoming call
    const acceptCall = async () => {
        try {
            socket.emit("video-call-accepted", {
                roomId,
                callerId: incomingUser.callerId,
                accepterId: currentUser._id
            });

            setIncomingCall(false);
        } catch (err) {
            console.error("Error accepting call:", err);
        }
    };

    // Reject incoming call
    const rejectCall = () => {
        socket.emit("video-call-rejected", {
            roomId,
            callerId: incomingCall.callerId,
            rejecterId: currentUser._id,
            rejecterName: currentUser.userName || "User"
        });

        setIncomingCall(null);
    };

    // End active call
    const endCall = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }

        if (remoteStream) {
            remoteStream.getTracks().forEach(track => track.stop());
            setRemoteStream(null);
        }

        if (peerConnection.current) {
            peerConnection.current.close();
            peerConnection.current = null;
        }

        setIsCallActive(false);
        setCallEnded(true);
        // Notify others that call has ended
        socket.emit("video-call-ended", { roomId, userId: currentUser._id });
    };
    const handleLogout = async () => {
        try {
            await axios.post("https://chat-application-96bk.onrender.com/api/auth/logout", {}, { withCredentials: true });
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
            <div className="">{join && (
                <p className="text-gray-500 text-center">{join}</p>
            )}</div>

            {/* Video Call UI */}
            {isCallActive && (
                <div className="bg-gray-800 p-4 relative">
                    <div className="flex justify-center">
                        {/* Remote Video (Main) */}
                        <div className="w-full max-w-3xl h-64 bg-black rounded-lg overflow-hidden">
                            <video
                                ref={remoteVideoRef}
                                className="w-full h-full object-cover"
                                autoPlay
                                playsInline
                            />
                        </div>

                        {/* Local Video (Small) */}
                        <div className="absolute bottom-8 right-8 w-32 h-24 bg-gray-700 rounded-lg overflow-hidden border-2 border-white">
                            <video
                                ref={localVideoRef}
                                className="w-full h-full object-cover"
                                autoPlay
                                playsInline
                                muted
                            />
                        </div>
                    </div>

                    {/* Call Controls */}
                    <div className="flex justify-center mt-2">
                        <button
                            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                            onClick={endCall}
                        >
                            End Call
                        </button>
                    </div>
                </div>
            )}

            {/* Incoming Call Alert */}
            {incomingCall && !isCallActive && (
                <div className="bg-yellow-100 p-4 border-l-4 border-yellow-500">
                    <div className="flex justify-between items-center">
                        <p className="font-semibold">
                            Incoming video call from {incomingCall.callerName || "User"}
                        </p>
                        <div className="flex space-x-2">
                            <button
                                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                                onClick={acceptCall}
                            >
                                Accept
                            </button>
                            <button
                                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                                onClick={rejectCall}
                            >
                                Reject
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Messages */}
            <div className={`flex-1 overflow-auto p-4 ${isCallActive ? 'max-h-40' : ''}`}>
                {messages.length > 0 ? (
                    messages.map((msg, index) => (
                        <div
                            key={msg.id || index}
                            className={`p-2 my-2 max-w-xs rounded-lg ${msg.senderId === currentUser._id
                                ? "ml-auto bg-blue-500 text-white"
                                : "bg-gray-300 text-black"
                                }`}
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <strong>{msg.senderId === currentUser._id ? "You" : (msg.senderName || "User")}:</strong>
                                    {msg.isDeleted ? (
                                        <em className="text-gray-400"> This message was deleted</em>
                                    ) : (
                                        <span> {msg.text}</span>
                                    )}
                                </div>

                                {/* Delete button (only for your own messages that aren't deleted) */}
                                {msg.senderId === currentUser._id && !msg.isDeleted && (
                                    <button
                                        onClick={() => deleteMessage(msg.id)}
                                        className="ml-2 text-xs opacity-60 hover:opacity-100"
                                    >
                                        🗑️
                                    </button>
                                )}
                                {msg.senderId === currentUser._id && msg.isDeleted && (
                                    <button onClick={() => undoMessage(msg.id)} className="ml-2 text-xs opacity-60 hover:opacity-100">
                                        🗑️
                                    </button>
                                )}
                            </div>

                            {/* Timestamp */}
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

            {/* Message Input */}
            <div className="p-4 flex bg-white border-t">
                <input
                    type="text"
                    className="flex-1 p-2 border rounded-lg"
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button
                    className={`ml-2 px-4 py-2 ${isCallActive ? 'bg-gray-500 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'} text-white rounded-lg flex items-center`}
                    onClick={!isCallActive ? startVideoCall : null}
                    disabled={isCallActive}
                >
                    📹 Video
                </button>

                <button
                    className="ml-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    onClick={sendMessage}
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default Chat;