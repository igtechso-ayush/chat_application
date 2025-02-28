import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const socket = io("http://localhost:3000", {
    withCredentials: true,
    extraHeaders: {
        token: sessionStorage.getItem("token"),
    },
});


const Rooms = () => {
    const [roomName, setRoomName] = useState("");
    const [rooms, setRooms] = useState([]);
    const navigate = useNavigate();
    const user = JSON.parse(sessionStorage.getItem("user"));
    useEffect(() => {
        io("http://localhost:3000", {
            withCredentials: true,
            extraHeaders: {
                token: sessionStorage.getItem("token"),
            },
        });

        const fetchRooms = async () => {
            try {
                const response = await axios.get("http://localhost:3000/api/auth/rooms", {
                });
                // console.log("response ", response);
                const data = response.data
                setRooms(data.data);
            } catch (error) {
                console.error("Error fetching rooms:", error);
            }
        };

        fetchRooms();
    }, []);
    useEffect(() => {
        socket.on("connect", () => {
            console.log("Connected")
        });
        socket.on("room-created", (newRoom) => {
            setRooms((prevRooms) => [...prevRooms, newRoom]);
        });

        return () => {
            socket.off("room-created");
        };
    }, []);


    const createRoom = () => {
        if (roomName.trim() === "") return;
        socket.emit("room-create", { roomName });
        setRoomName(""); // Clear input after sending
    };
    const joinRoom = (roomId) => {
        socket.emit("room-join", { roomId });
        socket.on("room-Joined", () => {
            try {
                navigate(`/chat/${roomId}`); // Navigate to chat page
                // navigate(`/chat`);
            } catch (e) {
                console.error("Failed to join room", e);
            }
        });
    };
    return (
        <div className="flex flex-col items-center min-h-screen bg-gray-100 p-6">
            <h2 className="text-2xl font-bold mb-4">{user && user.name} {" "}Chat Rooms</h2>

            {/* Create Room */}
            <div className="flex gap-2 mb-4">
                <input
                    type="text"
                    placeholder="Enter room name"
                    className="p-2 border rounded"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                />
                <button
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                    onClick={createRoom}
                >
                    Create Room
                </button>
            </div>
            {/* List of Available Rooms */}
            <div className="w-full max-w-md bg-white p-4 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold mb-2">Available Rooms</h3>
                <ul className="space-y-2">
                    {rooms.length > 0 ? (
                        rooms.map((room) => (
                            <li
                                key={room._id}
                                className="p-3 bg-gray-200 rounded flex justify-between items-center"
                            >
                                {room.roomName}
                                <button
                                    className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                                    onClick={() => joinRoom(room._id)}
                                >
                                    Join
                                </button>
                            </li>
                        ))
                    ) : (
                        <p className="text-gray-500">No rooms available</p>
                    )}
                </ul>
            </div>
        </div>
    );
};

export default Rooms;
