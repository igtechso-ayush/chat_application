import { useEffect, useState, useRef } from "react";
import PropTypes from 'prop-types';
const VideoCall = ({
    socket,
    roomId,
    currentUser,
    onCallStatusChange,
    isCallInitiated,
    onCallEnded
}) => {
    // Video call states
    const [isCallActive, setIsCallActive] = useState(false);
    const [incomingCall, setIncomingCall] = useState(false);
    const [incomingUser, setIncomingUser] = useState(null);
    const [stream, setStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnection = useRef(null);
    const iceCandidatesQueue = useRef([]);

    // Handle call initiation from parent component
    useEffect(() => {
        if (isCallInitiated) {
            startVideoCall();
        }
    }, [isCallInitiated]);

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
                await peerConnection.current.setLocalDescription(offer);

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
            try {
                if (!peerConnection.current) {
                    console.warn("PeerConnection was not initialized. Initializing now...");
                    await setupPeerConnection();
                }

                console.log("Setting remote description with offer...");
                await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.offer));

                // Process any queued ICE candidates (if any)
                await processIceCandidates();

                console.log("Creating an answer...");
                const answer = await peerConnection.current.createAnswer();

                console.log("Setting local description...");
                await peerConnection.current.setLocalDescription(answer);

                console.log("Sending video-answer...");
                socket.emit("video-answer", {
                    roomId,
                    target: data.callerId,
                    answer: answer
                });

            } catch (err) {
                console.error("Error handling offer:", err);
            }
        });

        socket.on("video-answer", async (data) => {
            try {
                console.log("Received video-answer event.");

                if (!peerConnection.current.localDescription) {
                    console.error("Local description not set before answer.");
                    return;
                }

                if (peerConnection.current.remoteDescription) {
                    console.warn("Remote description already set. Ignoring duplicate answer.");
                    return;
                }

                console.log("Setting remote description...");
                await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));

                console.log("Remote answer set successfully.");
            } catch (error) {
                console.error("Error handling answer:", error);
            }
        });

        socket.on("video-ice-candidate", async (data) => {
            try {
                if (peerConnection.current && peerConnection.current.remoteDescription) {
                    // If remote description is set, add the candidate immediately
                    await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
                } else {
                    // Otherwise, queue the candidate for later
                    iceCandidatesQueue.current.push(data.candidate);
                }
            } catch (err) {
                console.error("Error adding ICE candidate:", err);
            }
        });

        socket.on("video-call-ended", () => {
            endCall();
        });

        return () => {
            socket.off("video-call-request");
            socket.off("video-call-accepted");
            socket.off("video-call-rejected");
            socket.off("video-offer");
            socket.off("video-answer");
            socket.off("video-ice-candidate");
            socket.off("video-call-ended");
        };
    }, [roomId, socket]);

    // Set up video refs when streams are available
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

    useEffect(() => {
        return () => {
            endCall();
        };
    }, []);

    // Update parent component about call status changes
    useEffect(() => {
        onCallStatusChange(isCallActive);
    }, [isCallActive, onCallStatusChange]);

    const startVideoCall = () => {
        socket.emit("video-call-request", {
            roomId,
            callerId: currentUser._id,
            callerName: currentUser.name || "User"
        });
    };

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

    const rejectCall = () => {
        if (!incomingUser) return;

        socket.emit("video-call-rejected", {
            roomId,
            callerId: incomingUser.callerId,
            rejecterId: currentUser._id,
            rejecterName: currentUser.name || "User"
        });

        setIncomingCall(false);
        setIncomingUser(null);
    };

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

        // Notify others that call has ended
        socket.emit("video-call-ended", { roomId });

        // Notify parent component
        onCallEnded();
    };

    const setupPeerConnection = async () => {
        try {
            const userMedia = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setStream(userMedia);

            peerConnection.current = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            userMedia.getTracks().forEach(track => peerConnection.current.addTrack(track, userMedia));

            peerConnection.current.ontrack = (event) => {
                if (event.streams[0]) setRemoteStream(event.streams[0]);
            };

            peerConnection.current.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit("video-ice-candidate", { roomId, candidate: event.candidate });
                }
            };

            setIsCallActive(true);
        } catch (err) {
            console.error("Error setting up peer connection:", err);
            alert("Could not access camera and microphone");
        }
    };

    const processIceCandidates = async () => {
        if (peerConnection.current && peerConnection.current.remoteDescription) {
            // Process any queued ICE candidates
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

    return (
        <>
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
                            Incoming video call from {incomingUser.callerName || "User"}
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
        </>
    );
};
export default VideoCall;
VideoCall.propTypes = {
    onCallStatusChange: PropTypes.func,
    onCallEnded: PropTypes.func,
    isCallInitiated: PropTypes.func,
    currentUser: PropTypes.func,
    roomId: PropTypes.func,
    socket: PropTypes.func,

    // other props
};