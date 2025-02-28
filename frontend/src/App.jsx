
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import './App.css'
import Login from './pages/Login'
import Chat from "./pages/Chat";
import Rooms from "./pages/Rooms";
import ErrorBoundary from "./pages/ErrorBoundary";
// import { SocketProvider } from "./socketConnection/SocketContext";
function App() {


  return (
    <ErrorBoundary>
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/chat/:roomId" element={<Chat />} />
      </Routes>
    </Router>
    </ErrorBoundary>
  )
}

export default App
