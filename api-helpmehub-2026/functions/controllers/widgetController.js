// controllers/widgetController.js
const db = require('../config/db.js');
const { uploadBase64ToCloud } = require('../config/firebaseStorage.js');
const { ADMIN_ROLE } = require('../utils/adminRoles');

const normalizeUserName = (value = '') => value.toString().trim().toLowerCase().replace(/[\s\-]+/g, '');
const normalizeUserEmail = (value = '') => value.toString().trim().toLowerCase();
const inactiveProjectMessage = 'This project API is currently inactive.';

const getConversationSupportIdentity = async (projectId, userId) => {
    const [assignedRows] = await db.query(
        `
            SELECT a.id, a.name, a.email, a.role, a.profile_image
            FROM end_users eu
            JOIN admins a ON a.id = eu.assigned_admin_id
            WHERE eu.project_id = ? AND eu.id = ?
            LIMIT 1
        `,
        [projectId, userId]
    );

    if (assignedRows[0]) {
        return assignedRows[0];
    }

    const [fallbackRows] = await db.query(
        `
            SELECT DISTINCT a.id, a.name, a.email, a.role, a.profile_image
            FROM admins a
            LEFT JOIN admin_project_access apa ON apa.admin_id = a.id
            WHERE a.role IN (?, ?)
               OR (a.role = ? AND apa.project_id = ?)
            ORDER BY
                CASE a.role
                    WHEN ? THEN 0
                    WHEN ? THEN 1
                    ELSE 2
                END,
                a.id ASC
            LIMIT 1
        `,
        [ADMIN_ROLE.OWNER, ADMIN_ROLE.SUPER_ADMIN, ADMIN_ROLE.ADMIN, projectId, ADMIN_ROLE.OWNER, ADMIN_ROLE.SUPER_ADMIN]
    );

    return fallbackRows[0] || null;
};

// ==========================================
// 1. ฟังก์ชันสำหรับ Register 
// ==========================================
exports.registerUser = async (req, res) => {
    const { apiKey, name, email, phone, chatHistory } = req.body;

    try {
        const [projects] = await db.query('SELECT id FROM projects WHERE api_key = ? AND is_active = 1', [apiKey]);
        if (projects.length === 0) {
            return res.status(404).json({ error: inactiveProjectMessage });
        }
        const projectId = projects[0].id;
        const normalizedName = normalizeUserName(name);
        const normalizedEmail = normalizeUserEmail(email);

        if (!normalizedName) {
            return res.status(400).json({ error: "Name is required." });
        }

        if (!normalizedEmail) {
            return res.status(400).json({ error: "Email is required." });
        }

        const [emailCheck] = await db.query(
            'SELECT * FROM end_users WHERE LOWER(TRIM(email)) = ? AND project_id = ?',
            [normalizedEmail, projectId]
        );
        if (emailCheck.length > 0) {
            const dbNameClean = normalizeUserName(emailCheck[0].name);
            if (dbNameClean !== normalizedName) {
                return res.status(400).json({ error: "This email is already in use by another account." });
            }
        }

        const sql = `
            SELECT * FROM end_users 
            WHERE LOWER(REPLACE(REPLACE(TRIM(name), ' ', ''), '-', '')) = ? 
            AND project_id = ?
        `;
        const [existingUser] = await db.query(sql, [normalizedName, projectId]);

        let userId;
        let userName;

        if (existingUser.length > 0) {
            const user = existingUser[0];

            if (normalizeUserEmail(user.email) !== normalizedEmail) {
                return res.status(400).json({ error: "The email does not match your registered data." });
            }

            if (user.phone !== phone) {
                const lastTwoDigits = user.phone.slice(-2);
                return res.status(400).json({ 
                    error: `Incorrect phone number. Your registered number ends with **${lastTwoDigits}. Please provide the correct number.` 
                });
            }

            userId = user.id;
            userName = user.name; 
            
        } else {
            const [result] = await db.query(
                'INSERT INTO end_users (project_id, name, email, phone) VALUES (?, ?, ?, ?)',
                [projectId, name.trim(), normalizedEmail, phone]
            );
            userId = result.insertId;
            userName = name.trim();
        }

        if (chatHistory && Array.isArray(chatHistory) && chatHistory.length > 0) {
            for (const msg of chatHistory) {
                if (msg.message_text) {
                    await db.query(
                        'INSERT INTO messages (project_id, end_user_id, sender_type, message_text, is_read) VALUES (?, ?, ?, ?, ?)',
                        [projectId, userId, msg.sender_type || 'USER', msg.message_text, 1]
                    );
                }
            }
        }

        res.json({ status: 'ok', user: { id: userId, name: userName, email: normalizedEmail } });

    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ error: "Registration failed. Please try again later." });
    }
};

// ==========================================
// 2. ฟังก์ชัน: ส่งข้อความ
// ==========================================
exports.sendMessage = async (req, res) => {
    const { apiKey, userId, message, imageUrl, sender_type } = req.body; 

    try {
        const [projects] = await db.query('SELECT id FROM projects WHERE api_key = ? AND is_active = 1', [apiKey]);
        if (projects.length === 0) {
            return res.status(404).json({ error: inactiveProjectMessage });
        }
        const projectId = projects[0].id;
        let finalImageUrl = null;
        if (imageUrl) {
            finalImageUrl = await uploadBase64ToCloud(imageUrl, `chat_images/${projectId}/${userId}`);
        }

        await db.query(
            'INSERT INTO messages (project_id, end_user_id, sender_type, message_text, image_url, is_read) VALUES (?, ?, ?, ?, ?, ?)',
            [projectId, userId, sender_type || 'USER', message || '', finalImageUrl, 0]
        );

        res.json({ status: 'ok', message: 'Message sent' });
    } catch (error) {
        console.error("Send Message Error:", error);
        res.status(500).json({ error: "Failed to send message" });
    }
};

// ==========================================
// 3. ฟังก์ชัน: ดึงประวัติแชท (Get Chat History)
// ==========================================
exports.getMessages = async (req, res) => {
    const { apiKey, userId } = req.query;

    try {
        const [projects] = await db.query('SELECT id FROM projects WHERE api_key = ? AND is_active = 1', [apiKey]);
        if (projects.length === 0) return res.status(404).json({ error: inactiveProjectMessage });
        const projectId = projects[0].id;
        
        await db.query(
            `UPDATE messages 
             SET is_read = 1 
             WHERE project_id = ? AND end_user_id = ? AND sender_type IN ('ADMIN', 'BOT') AND is_read = 0`,
            [projectId, userId]
        );

        const supportIdentity = await getConversationSupportIdentity(projectId, userId);

        const [messages] = await db.query(
            `SELECT 
                m.id, 
                m.sender_type, 
                m.message_text, 
                m.image_url, 
                m.created_at, 
                m.is_read,
                a.name AS admin_name,
                a.role AS admin_role,
                a.profile_image AS admin_profile_image
             FROM messages m
             LEFT JOIN admins a ON m.admin_id = a.id
             WHERE m.project_id = ? AND m.end_user_id = ? 
             ORDER BY m.created_at ASC`,
            [projectId, userId]
        );

        const hydratedMessages = messages.map((message) => {
            if (message.sender_type !== 'ADMIN' && message.sender_type !== 'BOT') {
                return message;
            }

            return {
                ...message,
                admin_name: message.admin_name || supportIdentity?.name || 'Support',
                admin_role: message.admin_role || supportIdentity?.role || ADMIN_ROLE.ADMIN,
                admin_profile_image: message.admin_profile_image || supportIdentity?.profile_image || null
            };
        });

        res.json({ status: 'ok', data: hydratedMessages });

    } catch (error) {
        console.error("Get Messages Error:", error);
        res.status(500).json({ error: "Failed to fetch messages" });
    }
};

// ==========================================
// 4. ฟังก์ชัน: ดึงรายการ FAQ (สำหรับหน้าแรกของ Widget)
// ==========================================
exports.getPublicFaqs = async (req, res) => {
    const { apiKey } = req.query;

    try {
        const [projects] = await db.query('SELECT id FROM projects WHERE api_key = ? AND is_active = 1', [apiKey]);
        if (projects.length === 0) return res.status(404).json({ error: inactiveProjectMessage });
        const projectId = projects[0].id;

        const [faqs] = await db.query(
            'SELECT id, question, answer FROM faqs WHERE project_id = ? ORDER BY id ASC',
            [projectId]
        );

        res.json({ status: 'ok', data: faqs });

    } catch (error) {
        console.error("Get Public FAQs Error:", error);
        res.status(500).json({ error: "Failed to fetch FAQs" });
    }
};
// ==========================================
// 5. ฟังก์ชัน: ดึงข้อมูลเริ่มต้นของ Widget (รวมถึง Theme)
// ==========================================
exports.getWidgetInitData = async (req, res) => {
    const { apiKey } = req.query;

    try {
        // ดึงทั้ง id และ theme_config จากฐานข้อมูล
        const [projects] = await db.query('SELECT id, theme_config FROM projects WHERE api_key = ? AND is_active = 1', [apiKey]);
        
        if (projects.length === 0) {
            return res.status(404).json({ error: inactiveProjectMessage });
        }

        const project = projects[0];
        
        let themeConfig = null;
        if (project.theme_config) {
            try {
                themeConfig = typeof project.theme_config === 'string' ? JSON.parse(project.theme_config) : project.theme_config;
            } catch (e) {
                console.error("Error parsing theme_config:", e);
            }
        }

        res.json({ 
            status: 'ok', 
            projectId: project.id,
            themeConfig: themeConfig
        });

    } catch (error) {
        console.error("Get Widget Init Data Error:", error);
        res.status(500).json({ error: "Failed to fetch widget initialization data" });
    }
};

// ==========================================
// 6. ฟังก์ชัน: ดึงข้อมูลผู้ใช้งานของโปรเจค (end_users)
// ==========================================
exports.getProjectUsers = async (req, res) => {
    const { apiKey } = req.query;

    try {
        const [projects] = await db.query('SELECT id FROM projects WHERE api_key = ? AND is_active = 1', [apiKey]);
        if (projects.length === 0) {
            return res.status(404).json({ error: inactiveProjectMessage });
        }
        const projectId = projects[0].id;

        const [users] = await db.query(
            'SELECT id, name, email FROM end_users WHERE project_id = ? ORDER BY id ASC LIMIT 1',
            [projectId]
        );

        if (users.length === 0) {
            return res.status(404).json({ status: 'nok', message: 'No registered users found for this project' });
        }

        res.json({ status: 'ok', data: users });
    } catch (error) {
        console.error('Get Project Users Error:', error);
        res.status(500).json({ error: 'Failed to fetch project users' });
    }
};