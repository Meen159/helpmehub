// backend/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { normalizeAdminRole } = require('../utils/adminRoles');

const { getConversations, replyMessage, getMessagesByUserId, markAsRead, getProjectCustomers, getProjectChatAdmins, assignConversationAdmin, updateConversationDisplayName } = require('../controllers/adminChatController');
const { adminLogin, getCurrentAdminProfile } = require('../controllers/adminAuthController');
const { getAllUsers, getAllProjects, createUser, deleteUser, getMyProjects, createProject, updateUser, resetPassword } = require('../controllers/adminUserController');
const { getFaqs, saveFaq, deleteFaqs } = require('../controllers/adminFaqController');
const { saveProjectTheme, updateProject, toggleProjectStatus, refreshProjectToken, deleteProject } = require('../controllers/adminProjectController');

// --- Middleware: เช็ค Token ---
const verifyToken = async (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(403).json({ message: 'No token provided' });

    try {
        const decoded = jwt.verify(token, 'secret_key_inverz_2026');
        const [rows] = await db.execute(
            'SELECT id, name, email, role FROM admins WHERE id = ? LIMIT 1',
            [decoded.id]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const admin = rows[0];
        req.user = {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: normalizeAdminRole(admin.role)
        };
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
};

// ==============================
// 🟢 Public Routes 
// ==============================
router.post('/login', adminLogin);

// ==============================
// 🔒 Protected Routes
// ==============================
router.get('/me', verifyToken, getCurrentAdminProfile);
router.get('/my-projects', verifyToken, getMyProjects);

// ==============================
// User Management
// ==============================
router.get('/users', verifyToken, getAllUsers);
router.post('/users', verifyToken, createUser);
router.put('/users/:id', verifyToken, updateUser);
router.put('/users/:id/reset-password', verifyToken, resetPassword);
router.delete('/users/:id', verifyToken, deleteUser);

// ==============================
// Project Management
// ==============================
router.get('/projects', verifyToken, getAllProjects);
router.post('/projects', verifyToken, createProject);
router.put('/projects/:projectId/theme', verifyToken, saveProjectTheme);
router.put('/projects/:projectId', verifyToken, updateProject);
router.put('/projects/:projectId/status', verifyToken, toggleProjectStatus);
router.post('/projects/:projectId/refresh-token', verifyToken, refreshProjectToken);
router.delete('/projects/:projectId', verifyToken, deleteProject);

// ==============================
// Chat System
// ==============================
router.get('/customers', verifyToken, getProjectCustomers);
router.get('/chat-admins', verifyToken, getProjectChatAdmins);
router.get('/conversations', verifyToken, getConversations);
router.get('/messages/:userId', verifyToken, getMessagesByUserId);
router.post('/reply', verifyToken, replyMessage);
router.put('/messages/read/:userId', verifyToken, markAsRead);
router.put('/conversations/:userId/assignment', verifyToken, assignConversationAdmin);
router.put('/conversations/:userId/display-name', verifyToken, updateConversationDisplayName);

// ==============================
// FAQ System
// ==============================
router.get('/faqs', verifyToken, getFaqs);
router.post('/faqs/save', verifyToken, saveFaq);
router.post('/faqs/delete', verifyToken, deleteFaqs);

module.exports = router;