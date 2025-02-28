require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan')
const cookieParser = require('cookie-parser')
const db = require('./src/config/db.js');
const authRoutes = require("./src/routers/auth.route.js")
const messageRoutes = require('./src/routers/message.route.js')
const initializeSocket = require("./src/websocket/socket.js")
const app = express();
const server = http.createServer(app);

app.use(cookieParser())
// app.use(cors())
app.use(
    cors({
        origin: "http://localhost:5173", // Frontend URL
        credentials: true, // Allow cookies
    })
);
app.use(express.json());
app.use(morgan('dev'))
db.connect();
const PORT = process.env.PORT || 5000;

app.use("/",(req,res)=>{
    res.send("server is running")
})
// Initialize Socket.io
const io = initializeSocket(server);
// app.use((req, res, next) => {
//     req.io = io;
//     next();
// });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/message', messageRoutes);

server.listen(PORT, () => {
    console.log("Server running ");
    // console.log("Server running on http://localhost:3000");
})