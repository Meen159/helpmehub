// backend/controllers/adminAuthController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ADMIN_ROLE, normalizeAdminRole, hasFullProjectAccess } = require('../utils/adminRoles');

const getAllowedProjectIds = async (adminId, role) => {
    if (hasFullProjectAccess(role)) {
        return [];
    }

    const [accessRows] = await db.execute(
        'SELECT project_id FROM admin_project_access WHERE admin_id = ?',
        [adminId]
    );

    return accessRows.map((row) => row.project_id);
};

exports.adminLogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. ค้นหา Admin จาก Email (ดึง role มาด้วย)
        const [rows] = await db.execute('SELECT * FROM admins WHERE email = ?', [email]);
        
        if (rows.length === 0) {
            return res.status(401).json({ message: 'Email not found' });
        }

        const admin = rows[0];

        // 2. ตรวจสอบรหัสผ่าน
        const isMatch = await bcrypt.compare(password, admin.password_hash);
        
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid password' });
        }

        // 3. ดึงรายชื่อโปรเจกต์ที่ Admin คนนี้มีสิทธิ์ดูแล (เฉพาะกรณีไม่ใช่ Super Admin)
        const userRole = normalizeAdminRole(admin.role || ADMIN_ROLE.ADMIN);
        const allowedProjects = await getAllowedProjectIds(admin.id, userRole);


        // 4. สร้าง JWT Token (หมดอายุใน 3 ชั่วโมง)
        const token = jwt.sign(
            { 
                id: admin.id, 
                email: admin.email, 
                role: userRole
            },
            'secret_key_inverz_2026',
            { expiresIn: '3h' } 
        );

        res.json({ 
            message: 'Login successful',
            token: token,
            admin: { 
                id: admin.id, 
                name: admin.name, 
                email: admin.email,
                role: userRole,    
                allowedProjects: allowedProjects,
                profile_image: admin.profile_image
            }
        });

    } catch (err) {
        console.error('Admin Login Error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getCurrentAdminProfile = async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT id, name, email, role, profile_image FROM admins WHERE id = ? LIMIT 1',
            [req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        const admin = rows[0];
        const userRole = normalizeAdminRole(admin.role || ADMIN_ROLE.ADMIN);
        const allowedProjects = await getAllowedProjectIds(admin.id, userRole);

        res.json({
            admin: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: userRole,
                allowedProjects,
                profile_image: admin.profile_image
            }
        });
    } catch (error) {
        console.error('Get Current Admin Profile Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};