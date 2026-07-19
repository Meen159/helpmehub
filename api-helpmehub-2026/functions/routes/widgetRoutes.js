// backend/routes/widgetRoutes.js
const express = require('express');
const router = express.Router();
const { registerUser, sendMessage, getMessages, getPublicFaqs, getWidgetInitData, getProjectUsers } = require('../controllers/widgetController');

router.post('/register', registerUser);
router.post('/send', sendMessage);
router.get('/history', getMessages);

router.get('/faqs', getPublicFaqs);

router.get('/users', getProjectUsers);

router.get('/init', getWidgetInitData);

module.exports = router;