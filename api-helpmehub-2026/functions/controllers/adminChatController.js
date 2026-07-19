// backend/controllers/adminChatController.js
const db = require('../config/db');
const { uploadBase64ToCloud } = require('../config/firebaseStorage.js');
const { ADMIN_ROLE, hasFullProjectAccess, canManageConversationAssignments, canEditConversationNicknames } = require('../utils/adminRoles');

const ensureProjectAccess = async (projectId, user) => {
    if (!projectId || !user?.id) return null;

    let sql = 'SELECT id, project_name FROM projects WHERE id = ?';
    let params = [projectId];

    if (!hasFullProjectAccess(user.role)) {
        sql = `
            SELECT p.id, p.project_name
            FROM projects p
            JOIN admin_project_access apa ON p.id = apa.project_id
            WHERE p.id = ? AND apa.admin_id = ?
        `;
        params = [projectId, user.id];
    }

    const [projects] = await db.execute(sql, params);
    return projects[0] || null;
};

const getUserProject = async (userId) => {
    const [rows] = await db.execute(
        'SELECT id, project_id, name, display_name, assigned_admin_id FROM end_users WHERE id = ?',
        [userId]
    );
    return rows[0] || null;
};

const getProjectFallbackSupportAdmin = async (projectId) => {
    const [rows] = await db.execute(
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

    return rows[0] || null;
};

const getConversationSupportIdentity = async ({ projectId, assignedAdminId = null }) => {
    if (assignedAdminId) {
        const [assignedRows] = await db.execute(
            'SELECT id, name, email, role, profile_image FROM admins WHERE id = ? LIMIT 1',
            [assignedAdminId]
        );

        if (assignedRows[0]) {
            return assignedRows[0];
        }
    }

    return getProjectFallbackSupportAdmin(projectId);
};

const getEligibleAdmin = async (adminId, projectId) => {
    const [rows] = await db.execute(
        `
            SELECT DISTINCT a.id, a.name, a.email, a.role, a.profile_image
            FROM admins a
            JOIN admin_project_access apa ON a.id = apa.admin_id
            WHERE a.id = ? AND a.role = ? AND apa.project_id = ?
            LIMIT 1
        `,
        [adminId, ADMIN_ROLE.ADMIN, projectId]
    );
    return rows[0] || null;
};

exports.getConversations = async (req, res) => {
    try {
        const { projectId } = req.query;

        const allowedProject = await ensureProjectAccess(projectId, req.user);
        if (!allowedProject) {
            return res.status(403).json({ message: 'You do not have access to this project' });
        }

        const sql = `
            SELECT 
                u.id AS user_id, 
                COALESCE(NULLIF(TRIM(u.display_name), ''), u.name) AS name,
                u.name AS original_name,
                u.display_name,
                u.email,
                u.phone,
                u.assigned_admin_id,
                aa.name AS assigned_admin_name,
                aa.email AS assigned_admin_email,
                aa.role AS assigned_admin_role,
                (SELECT message_text FROM messages WHERE end_user_id = u.id ORDER BY created_at DESC LIMIT 1) AS last_message,
                (SELECT image_url FROM messages WHERE end_user_id = u.id ORDER BY created_at DESC LIMIT 1) AS last_image_url,
                (SELECT created_at FROM messages WHERE end_user_id = u.id ORDER BY created_at DESC LIMIT 1) AS last_time,
                (SELECT sender_type FROM messages WHERE end_user_id = u.id ORDER BY created_at DESC LIMIT 1) AS sender_type,
                (SELECT COUNT(*) FROM messages WHERE end_user_id = u.id AND is_read = 0 AND sender_type = 'USER') AS unread_count
            FROM end_users u
            LEFT JOIN admins aa ON aa.id = u.assigned_admin_id
            WHERE EXISTS (SELECT 1 FROM messages WHERE end_user_id = u.id)
            AND u.project_id = ? 
            ORDER BY last_time DESC
        `;
        
        const [rows] = await db.execute(sql, [projectId || 0]);
        res.json({ data: rows });
        
    } catch (err) {
        console.error("SQL Error:", err);
        res.status(500).json({ error: 'Database error' });
    }
};

exports.getMessagesByUserId = async (req, res) => {
    const { userId } = req.params;
    try {
        const endUser = await getUserProject(userId);
        if (!endUser) return res.status(404).json({ error: 'User not found' });

        const allowedProject = await ensureProjectAccess(endUser.project_id, req.user);
        if (!allowedProject) {
            return res.status(403).json({ message: 'You do not have access to this conversation' });
        }

        const supportIdentity = await getConversationSupportIdentity({
            projectId: endUser.project_id,
            assignedAdminId: endUser.assigned_admin_id
        });

        const sql = `
            SELECT 
                m.*,
                a.name AS admin_name,
                a.role AS admin_role,
                a.profile_image AS admin_profile_image
            FROM messages m
            LEFT JOIN admins a ON m.admin_id = a.id
            WHERE m.end_user_id = ? 
            ORDER BY m.created_at ASC
        `;
        const [rows] = await db.execute(sql, [userId]);
        const hydratedRows = rows.map((row) => {
            if (row.sender_type !== 'ADMIN' && row.sender_type !== 'BOT') {
                return row;
            }

            return {
                ...row,
                admin_name: row.admin_name || supportIdentity?.name || 'Support',
                admin_role: row.admin_role || supportIdentity?.role || ADMIN_ROLE.ADMIN,
                admin_profile_image: row.admin_profile_image || supportIdentity?.profile_image || null
            };
        });

        res.json({ data: hydratedRows });
    } catch (err) {
        console.error("SQL Error:", err);
        res.status(500).json({ error: 'Database error' });
    }
};

exports.replyMessage = async (req, res) => {
    const { userId, message, imageUrl } = req.body;

    const adminId = req.user ? req.user.id : null;

    if (!message && !imageUrl) {
        return res.status(400).json({ error: 'Message or image is required' });
    }

    try {
        const [users] = await db.execute('SELECT project_id FROM end_users WHERE id = ?', [userId]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });
        const projectId = users[0].project_id;

        const allowedProject = await ensureProjectAccess(projectId, req.user);
        if (!allowedProject) {
            return res.status(403).json({ message: 'You do not have access to this conversation' });
        }

        let finalImageUrl = imageUrl || null;

        if (imageUrl && imageUrl.startsWith('data:image')) {
            finalImageUrl = await uploadBase64ToCloud(imageUrl);
            if (!finalImageUrl) {
                return res.status(500).json({ error: "Failed to upload image to Firebase" });
            }
        }

        await db.execute(
            'INSERT INTO messages (end_user_id, sender_type, message_text, image_url, project_id, admin_id) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, 'ADMIN', message || '', finalImageUrl, projectId, adminId] 
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error("SQL Error:", err);
        res.status(500).json({ error: 'Database error' });
    }
};

exports.markAsRead = async (req, res) => {
    const { userId } = req.params;
    try {
        const endUser = await getUserProject(userId);
        if (!endUser) return res.status(404).json({ error: 'User not found' });

        const allowedProject = await ensureProjectAccess(endUser.project_id, req.user);
        if (!allowedProject) {
            return res.status(403).json({ message: 'You do not have access to this conversation' });
        }

        await db.execute(
            "UPDATE messages SET is_read = 1 WHERE end_user_id = ? AND sender_type = 'USER' AND is_read = 0",
            [userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("SQL Error:", err);
        res.status(500).json({ error: 'Database error' });
    }
};

exports.getProjectCustomers = async (req, res) => {
    try {
        const { projectId } = req.query;
        const { id: adminId, role } = req.user;

        if (!projectId) {
            return res.status(400).json({ message: 'projectId is required' });
        }

        let accessSql = 'SELECT id, project_name FROM projects WHERE id = ?';
        let accessParams = [projectId];

        if (!hasFullProjectAccess(role)) {
            accessSql = `
                SELECT p.id, p.project_name
                FROM projects p
                JOIN admin_project_access apa ON p.id = apa.project_id
                WHERE p.id = ? AND apa.admin_id = ?
            `;
            accessParams = [projectId, adminId];
        }

        const [allowedProjects] = await db.execute(accessSql, accessParams);
        if (allowedProjects.length === 0) {
            return res.status(403).json({ message: 'You do not have access to this project' });
        }

        const [rows] = await db.execute(
            `
                SELECT 
                    eu.id,
                    eu.name,
                    eu.email,
                    eu.phone,
                    eu.project_id,
                    eu.created_at,
                    COUNT(m.id) AS total_messages,
                    MAX(m.created_at) AS last_message_at
                FROM end_users eu
                LEFT JOIN messages m ON m.end_user_id = eu.id
                WHERE eu.project_id = ?
                GROUP BY eu.id, eu.name, eu.email, eu.phone, eu.project_id, eu.created_at
                ORDER BY eu.id ASC
            `,
            [projectId]
        );

        res.json({
            data: rows,
            project: allowedProjects[0]
        });
    } catch (err) {
        console.error('Get Project Customers Error:', err);
        res.status(500).json({ message: 'Database error' });
    }
};

exports.getProjectChatAdmins = async (req, res) => {
    try {
        const { projectId } = req.query;

        if (!projectId) {
            return res.status(400).json({ message: 'projectId is required' });
        }

        const allowedProject = await ensureProjectAccess(projectId, req.user);
        if (!allowedProject) {
            return res.status(403).json({ message: 'You do not have access to this project' });
        }

        const [rows] = await db.execute(
            `
                SELECT DISTINCT a.id, a.name, a.email, a.role, a.profile_image
                FROM admins a
                JOIN admin_project_access apa ON a.id = apa.admin_id
                WHERE a.role = ? AND apa.project_id = ?
                ORDER BY a.name ASC
            `,
            [ADMIN_ROLE.ADMIN, projectId]
        );

        res.json({ data: rows, project: allowedProject });
    } catch (error) {
        console.error('Get Project Chat Admins Error:', error);
        res.status(500).json({ message: 'Database error' });
    }
};

exports.assignConversationAdmin = async (req, res) => {
    try {
        if (!canManageConversationAssignments(req.user?.role)) {
            return res.status(403).json({ message: 'You do not have permission to assign conversations' });
        }

        const { userId } = req.params;
        const { adminId } = req.body;

        const endUser = await getUserProject(userId);
        if (!endUser) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        const allowedProject = await ensureProjectAccess(endUser.project_id, req.user);
        if (!allowedProject) {
            return res.status(403).json({ message: 'You do not have access to this conversation' });
        }

        if (adminId === null || adminId === undefined || adminId === '') {
            await db.execute('UPDATE end_users SET assigned_admin_id = NULL WHERE id = ?', [userId]);
            return res.json({ status: 'ok', assignedAdmin: null });
        }

        const eligibleAdmin = await getEligibleAdmin(adminId, endUser.project_id);
        if (!eligibleAdmin) {
            return res.status(400).json({ message: 'Selected admin cannot manage this project' });
        }

        await db.execute('UPDATE end_users SET assigned_admin_id = ? WHERE id = ?', [eligibleAdmin.id, userId]);
        res.json({ status: 'ok', assignedAdmin: eligibleAdmin });
    } catch (error) {
        console.error('Assign Conversation Admin Error:', error);
        res.status(500).json({ message: 'Database error' });
    }
};

exports.updateConversationDisplayName = async (req, res) => {
    try {
        if (!canEditConversationNicknames(req.user?.role)) {
            return res.status(403).json({ message: 'You do not have permission to edit customer nicknames' });
        }

        const { userId } = req.params;
        const rawDisplayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
        const displayName = rawDisplayName || null;

        if (rawDisplayName.length > 255) {
            return res.status(400).json({ message: 'Nickname is too long' });
        }

        const endUser = await getUserProject(userId);
        if (!endUser) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        await db.execute('UPDATE end_users SET display_name = ? WHERE id = ?', [displayName, userId]);
        res.json({
            status: 'ok',
            data: {
                userId: endUser.id,
                originalName: endUser.name,
                displayName,
                name: displayName || endUser.name
            }
        });
    } catch (error) {
        console.error('Update Conversation Display Name Error:', error);
        res.status(500).json({ message: 'Database error' });
    }
};