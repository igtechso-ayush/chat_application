import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  withCredentials: true,
  extraHeaders: {
    token: sessionStorage.getItem("token"),
  },
});

const VideoCall = ({ targetId }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const [inCall, setInCall] = useState(false);

  useEffect(() => {
    // Create Peer Connection
    peerConnection.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    // Handle Incoming ICE Candidate
    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("iceConnection", { candidate: event.candidate, targetId });
      }
    };

    // Handle Remote Stream
    peerConnection.current.ontrack = (event) => {
      remoteVideoRef.current.srcObject = event.streams[0];
    };

    // Listen for incoming call
    socket.on("incoming-call", async ({ from, offer }) => {
      peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      socket.emit("answer", { answer, roomId: "room1", targetId: from });
    });

    // Listen for call answer
    socket.on("call-answered", async ({ from, answer }) => {
      peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
    });

    // Handle ICE Candidates
    socket.on("iceCandidate", ({ from, candidate }) => {
      peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
    });

    // Handle Call End
    socket.on("call-ended", () => {
      peerConnection.current.close();
      setInCall(false);
    });

    return () => {
      socket.off("incoming-call");
      socket.off("call-answered");
      socket.off("iceCandidate");
      socket.off("call-ended");
    };
  }, [targetId]);

  // Start Call
  const startCall = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideoRef.current.srcObject = stream;

    stream.getTracks().forEach(track => {
      peerConnection.current.addTrack(track, stream);
    });

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);

    socket.emit("call-user", { targetId, offer });
    setInCall(true);
  };

  // End Call
  const endCall = () => {
    peerConnection.current.close();
    socket.emit("end-call", { targetId });
    setInCall(false);
  };

  return (
    <div className="flex flex-col items-center p-4">
      <div className="flex gap-4">
        <video ref={localVideoRef} autoPlay playsInline className="w-1/2 border" />
        <video ref={remoteVideoRef} autoPlay playsInline className="w-1/2 border" />
      </div>
      <div className="mt-4">
        {!inCall ? (
          <button onClick={startCall} className="bg-green-500 px-4 py-2 text-white rounded">
            Start Call
          </button>
        ) : (
          <button onClick={endCall} className="bg-red-500 px-4 py-2 text-white rounded">
            End Call
          </button>
        )}
      </div>
    </div>
  );
};

export default VideoCall;
