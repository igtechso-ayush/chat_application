import axios from "axios";
import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";

const Chat = () => {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [roomName, setRoomName] = useState("");
  const [join, setJoin] = useState("");
  const [socket, setSocket] = useState(null);
  const currentUser = JSON.parse(sessionStorage.getItem("user"));
  const token = sessionStorage.getItem("token");
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const [inCall, setInCall] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  // Join room on component mount
  useEffect(() => {
    if (token) {
      const newSocket = io("https://chat-application-96bk.onrender.com", {
        withCredentials: true,
        extraHeaders: {
          token: token,
        },
      });

      // Set socket connection
      setSocket(newSocket);

      newSocket.on("connect", () => {
        console.log("Connected to socket server");
      });

      newSocket.emit("room-join", { roomId });

      newSocket.on("room-Joined", (data) => {
        try {
          const room = data.data;
          setRoomName(room.roomName);
          setJoin(data.message);
        } catch (e) {
          console.error("Failed to join room", e);
        }
      });
      newSocket.on("message-history", (data) => {
        setMessages(data.messages);
      });

      newSocket.on("recive-message", (message) => {
        setMessages((prevMessages) => [...prevMessages, message]);
      });
      newSocket.on("message-deleted", ({ messageId }) => {
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === messageId ? { ...msg, isDeleted: true } : msg
          )
        );
      });
      newSocket.on("message-restored", ({ messageId }) => {
        setMessages((prevMessages) =>
          prevMessages.map((msg) =>
            msg.id === messageId ? { ...msg, isDeleted: false } : msg
          )
        );
      });
      newSocket.on("incoming-call", async ({ roomId, callerId }) => {
        const acceptCall = window.confirm(`Incoming video call. Accept?`);
        if (acceptCall) {
          try {
            // Setup local media
            await setupMedia();
            setInCall(true);
            
            // Create peer connection
            peerConnection.current = createPeerConnection(newSocket, callerId);
            
            // Create and send offer to the caller
            const offer = await peerConnection.current.createOffer();
            await peerConnection.current.setLocalDescription(offer);
            
            // Send offer to the caller
            newSocket.emit("offer", { targetId: callerId, offer });
          } catch (error) {
            console.error("Error accepting call:", error);
            setInCall(false);
          }
        }
      });
      newSocket.on("receive-offer", async ({ offer, senderId }) => {
        console.log("Received offer from:", senderId);
        
        try {
          // Create peer connection if it doesn't exist yet
          if (!peerConnection.current) {
            peerConnection.current = createPeerConnection(newSocket, senderId);
          }
          
          // Set the remote description (the offer)
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
          
          // Create an answer
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);
          
          // Send the answer
          newSocket.emit("answer", { targetId: senderId, answer });
        } catch (error) {
          console.error("Error handling offer:", error);
        }
      });
      newSocket.on("answer", async ({ answer }) => {
        try {
          if (peerConnection.current) {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
            console.log("Successfully set remote description from answer");
          } else {
            console.error("Received answer but no peer connection exists");
          }
        } catch (error) {
          console.error("Error handling answer:", error);
        }
      });
      
      newSocket.on("ice-candidate", async ({ candidate }) => {
        try {
          if (peerConnection.current) {
            await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            console.error("Received ICE candidate but no peer connection exists");
          }
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      });
      newSocket.on("call-ended", () => {
        endCall();
      });
      newSocket.on("error", (error) => {
        alert(error.message);
      });
      return () => {
        newSocket.off("room-Joined");
        newSocket.off("message-history");
        newSocket.off("recive-message");
        newSocket.off("message-deleted");
        newSocket.off("message-restored");
        newSocket.off("incoming-call");
        newSocket.off("receive-offer");
        newSocket.off("answer");
        newSocket.off("ice-candidate");
        newSocket.off("call-ended");
        newSocket.off("error");
      };
    }
  }, [roomId,token]);
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log("Setting remote stream to video element");
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);
  useEffect(() => {
    if (localVideoRef.current && localStream.current) {
      console.log("Setting local stream to video element");
      localVideoRef.current.srcObject = localStream.current;
    }
  }, [inCall]); 
  const setupMedia = async () => {
    try {
      // If we already have a stream, stop all tracks first
      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }
      
      // Get new stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      // Store the stream reference
      localStream.current = stream;
      
      // Manually set it on the video element
      if (localVideoRef.current) {
        console.log("Setting local video stream directly");
        localVideoRef.current.srcObject = stream;
      }
      
      return stream;
    } catch (error) {
      console.error("Error accessing media devices", error);
      throw error; // Re-throw to allow caller to handle
    }
  };
  const createPeerConnection = (socket, targetId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
  
    // Add local tracks to the connection
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.current);
      });
    }
  
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { targetId, candidate: event.candidate });
      }
    };
  
    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log("Track received:", event.streams[0]);
      setRemoteStream(event.streams[0]);
    };
  
    return pc;
  };
  
  // Send message function
  const sendMessage = () => {
    if (newMessage.trim() !== "") {
      const messageData = {
        roomId,
        senderId: currentUser._id,
        text: newMessage,
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

  const handleLogout = async () => {
    try {
      await axios.post(
        "https://chat-application-96bk.onrender.com/api/auth/logout",
        {},
        { withCredentials: true }
      );
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("user");
      navigate("/");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const startVideoCall = async () => {
    if (socket) {
      try {
        await setupMedia();
        setInCall(true);
        
        // This will trigger the "incoming-call" event for other users in the room
        socket.emit("start-call", { roomId });
      } catch (error) {
        console.error("Failed to start video call:", error);
        setInCall(false);
      }
    } else {
      console.error("Socket is not initialized.");
    }
  };
  const endCall = () => {
    setInCall(false);
    
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
      localStream.current = null;
    }
    
    // Remote video cleanup
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    // Notify others that call has ended
    socket.emit("end-call", { roomId });
  };
  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <div className="bg-blue-500 text-white p-4 text-lg font-bold flex justify-between">
        {currentUser.name}: {roomName || "Loading..."}
        <button onClick={handleLogout}>Logout</button>
      </div>
      <div className="">
        {join && <p className="text-gray-500 text-center">{join}</p>}
      </div>
      {inCall && (
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

      {/* Chat Messages */}
      <div className={`flex-1 overflow-auto p-4`}>
        {messages.length > 0 ? (
          messages.map((msg, index) => (
            <div
              key={msg.id || index}
              className={`p-2 my-2 max-w-xs rounded-lg ${
                msg.senderId === currentUser._id
                  ? "ml-auto bg-blue-500 text-white"
                  : "bg-gray-300 text-black"
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <strong>
                    {msg.senderId === currentUser._id
                      ? "You"
                      : msg.senderName || "User"}
                    :
                  </strong>
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
                  <button
                    onClick={() => undoMessage(msg.id)}
                    className="ml-2 text-xs opacity-60 hover:opacity-100"
                  >
                    🗑️
                  </button>
                )}
              </div>

              {/* Timestamp */}
              {msg.createdAt && (
                <div className="text-xs opacity-60 mt-1">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
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
          onKeyPress={(e) => e.key === "Enter" && sendMessage()}
        />
        <button
          className={`ml-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center`}
          onClick={startVideoCall}
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