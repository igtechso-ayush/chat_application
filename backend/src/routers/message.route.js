const express = require('express');
const { sendmessage } = require('../controllers/message.controller');

const router = express.Router();

router.post('/send', sendmessage);


module.exports = router;