const express = require('express');
const { register, login, allUser, logout, allRoom } = require('../controllers/auth.controller');
const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/users', allUser);
router.get('/rooms', allRoom);

module.exports = router;