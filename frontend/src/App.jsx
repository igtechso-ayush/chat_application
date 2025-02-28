
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import './App.css'
import Login from './pages/login'
import Chat from "./pages/Chat";
import Rooms from "./pages/Rooms";

function App() {


  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/chat/:roomId" element={<Chat />} />
      </Routes>
    </Router>
  )
}

export default App
