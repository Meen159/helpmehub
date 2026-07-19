// controllers/authController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 1. ลงทะเบียน Admin ใหม่ (สำหรับสร้าง User)
exports.registerAdmin = async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const [existing] = await db.query('SELECT id FROM admins WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(400).json({ error: 'Email already exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await db.query('INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)', 
            [name, email, hashedPassword]);

        res.json({ status: 'ok', message: 'Admin registered successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. เข้าสู่ระบบ (Login)
exports.loginAdmin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM admins WHERE email = ?', [email]);
        if (users.length === 0) return res.status(401).json({ error: 'User not found' });

        const admin = users[0];

        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) return res.status(401).json({ error: 'Invalid password' });

        const token = jwt.sign(
            { id: admin.id, email: admin.email },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ 
            status: 'ok', 
            token, 
            admin: { id: admin.id, name: admin.name, email: admin.email } 
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};