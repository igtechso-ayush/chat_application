import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
const Login = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post(
                "http://localhost:3000/api/auth/login",
                { email, password },
                { withCredentials: true }
            );

            // setEmail(response.data.user); 
            sessionStorage.setItem("token", response.data.token)
            sessionStorage.setItem("user", JSON.stringify(response.data.user))
            navigate("/rooms");
        } catch (err) {
            setError("Invalid credentials. Please try again.", err);
        }
    };

    return (
        <div className="flex items-center justify-center h-screen bg-gray-100">
            <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
                <h2 className="text-2xl font-bold text-center text-gray-700 mb-4">Login</h2>
                {error && <p style={{ color: "red" }}>{error}</p>}
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-700">Email</label>
                        <input
                            type="text"
                            className="w-full p-2 mt-1 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="mb-4">
                        <label className="block text-gray-700">Password</label>
                        <input
                            type="password"
                            className="w-full p-2 mt-1 border rounded-lg focus:outline-none focus:ring focus:border-blue-300"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full p-2 text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition"
                    >
                        Login
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
