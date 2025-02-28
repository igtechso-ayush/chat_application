import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import PropTypes from 'prop-types';  // Import PropTypes

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const token = sessionStorage.getItem("token");

    useEffect(() => {
        if (token) {
            const newSocket = io("https://chat-application-96bk.onrender.com", {
                withCredentials: true,
                extraHeaders: {
                    token: token,
                },
            });

            setSocket(newSocket);

            return () => {
                newSocket.disconnect();
            };
        }
    }, [token]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};
SocketProvider.propTypes = {
    children: PropTypes.node.isRequired,  // Validate that children is a required prop of type node
};