const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model.js")
const Room = require("../models/Room.model.js")
exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existuser = await User.findOne({ email: email });
        if (existuser) {
            return res.status(400).json({
                message: "User already exists"
            })
        }
        console.log("password: ", name, password)
        if (!password) {
            return res.status(400).json({ error: "Password is required" });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Save user to the database
        const user = new User({ name, email, password: hashedPassword });
        await user.save();

        res.status(201).json({ message: "User created successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

        const token = jwt.sign({ userId: user._id, userName: user.name }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.cookie("token", token, { httpOnly: true, secure: false, sameSite: "none" });
        res.json({ message: "Login successful", user, token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
exports.logout = async (req, res) => {
    try {
        // Clear the token from cookies (if stored in cookies)
        res.clearCookie("token");

        // Send success response
        res.json({ message: "Logged out successfully" });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
}

exports.allUser = async (req, res) => {
    try {
        const users = await User.find({}, { password: 0 }); // Exclude passwords
        res.json({
            message: "users found",
            data: users
        });
    } catch (error) {
        res.status(500).json({ error: "Error fetching users" });
    }
}
exports.allRoom = async (req, res) => {
    try {
        const rooms = await Room.find();
        res.json({
            message: "Room found",
            data: rooms
        });
    } catch (error) {
        res.status(500).json({ error: "Error fetching users" });
    }
}