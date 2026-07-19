// backend/controllers/adminUserController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { ADMIN_ROLE, normalizeAdminRole, hasFullProjectAccess, canCreateUsers, canCreateProjects, canManageTargetUser } = require('../utils/adminRoles');

const getAdminById = async (adminId) => {
    const [rows] = await db.execute('SELECT id, name, email, role FROM admins WHERE id = ?', [adminId]);
    return rows[0] || null;
};

const getAdminProjectIds = async (adminId) => {
    const [rows] = await db.execute('SELECT project_id FROM admin_project_access WHERE admin_id = ?', [adminId]);
    return rows.map((row) => Number(row.project_id)).filter((projectId) => Number.isInteger(projectId));
};

const hasSharedProjectAccess = async (firstAdminId, secondAdminId) => {
    const [rows] = await db.execute(
        `SELECT 1
         FROM admin_project_access first_access
         JOIN admin_project_access second_access ON second_access.project_id = first_access.project_id
         WHERE first_access.admin_id = ? AND second_access.admin_id = ?
         LIMIT 1`,
        [firstAdminId, secondAdminId]
    );

    return rows.length > 0;
};

const areProjectIdsWithinActorScope = async (actor, projectIds = []) => {
    if (hasFullProjectAccess(actor?.role)) {
        return true;
    }

    const actorProjectIds = await getAdminProjectIds(actor.id);
    const actorProjectSet = new Set(actorProjectIds);
    return projectIds.every((projectId) => actorProjectSet.has(Number(projectId)));
};

const canAccessAdminTarget = async (actor, targetAdmin) => {
    const actorRole = normalizeAdminRole(actor?.role);
    const targetRole = normalizeAdminRole(targetAdmin?.role);

    if (!canManageTargetUser(actorRole, targetRole)) {
        return false;
    }

    if (actorRole !== ADMIN_ROLE.ADMIN) {
        return true;
    }

    if (Number(actor.id) === Number(targetAdmin.id)) {
        return true;
    }

    return hasSharedProjectAccess(actor.id, targetAdmin.id);
};

// 1. ดึงรายชื่อ Admin ทั้งหมด (สำหรับหน้า User Management)
exports.getAllUsers = async (req, res) => {
    try {
        const viewerRole = normalizeAdminRole(req.user?.role);
        const whereClauses = [];
        const params = [];

        if (viewerRole === ADMIN_ROLE.SUPER_ADMIN) {
            whereClauses.push('a.role <> ?');
            params.push(ADMIN_ROLE.OWNER);
        } else if (viewerRole === ADMIN_ROLE.ADMIN) {
            whereClauses.push('a.role = ?');
            params.push(ADMIN_ROLE.ADMIN);
            whereClauses.push(`EXISTS (
                SELECT 1
                FROM admin_project_access viewer_access
                JOIN admin_project_access target_access ON target_access.project_id = viewer_access.project_id
                WHERE viewer_access.admin_id = ? AND target_access.admin_id = a.id
            )`);
            params.push(req.user.id);
        }

        const sql = `
            SELECT 
                a.id, a.name, a.email, a.role, a.profile_image, a.created_at,
                GROUP_CONCAT(DISTINCT p.project_name ORDER BY p.project_name ASC SEPARATOR ', ') AS access_projects
            FROM admins a
            LEFT JOIN admin_project_access apa ON a.id = apa.admin_id
            LEFT JOIN projects p ON apa.project_id = p.id
            ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
            GROUP BY a.id
            ORDER BY a.created_at ASC 
        `;
        const [rows] = await db.execute(sql, params);
        res.json({ data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
};

// 2. ดึงรายชื่อ Projects ทั้งหมด (สำหรับ Dropdown/Checkbox ตอนสร้าง User)
exports.getAllProjects = async (req, res) => {
    try {
        const { id, role } = req.user;

        let sql = 'SELECT id, project_name AS name, description, api_key, created_at, theme_config, is_active FROM projects ORDER BY created_at ASC, id ASC, project_name ASC';
        let params = [];

        if (!hasFullProjectAccess(role)) {
            sql = `
                SELECT p.id, p.project_name AS name, p.description, p.api_key, p.created_at, p.theme_config, p.is_active
                FROM projects p
                JOIN admin_project_access apa ON p.id = apa.project_id
                WHERE apa.admin_id = ?
                ORDER BY p.created_at ASC, p.id ASC, p.project_name ASC
            `;
            params = [id];
        }

        const [rows] = await db.execute(sql, params);
        res.json({ data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Database error' });
    }
};

// 3. ดึงโปรเจคที่ "ฉัน" มีสิทธิ์ดูแล (สำหรับเมนู Sidebar และตั้งค่า Theme)
exports.getMyProjects = async (req, res) => {
    try {
        const { id, role } = req.user; 

        let sql = '';
        let params = [];

        if (hasFullProjectAccess(role)) {
            sql = 'SELECT id, project_name, description, api_key, theme_config, created_at, is_active FROM projects ORDER BY created_at ASC, id ASC, project_name ASC';
        } else {
            sql = `
                SELECT p.id, p.project_name, p.description, p.api_key, p.theme_config, p.created_at, p.is_active 
                FROM projects p
                JOIN admin_project_access apa ON p.id = apa.project_id
                WHERE apa.admin_id = ?
                ORDER BY p.created_at ASC, p.id ASC, p.project_name ASC
            `;
            params = [id];
        }

        const [rows] = await db.execute(sql, params);
        res.json({ data: rows });

    } catch (err) {
        console.error('Error in getMyProjects:', err);
        res.status(500).json({ message: 'Database error' });
    }
};

// 4. สร้าง User ใหม่
exports.createUser = async (req, res) => {
    const { name, email, password, role, projectIds, profileImage } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Please provide name, email, and password' });
    }

    try {
        const creatorRole = normalizeAdminRole(req.user?.role);
        if (!canCreateUsers(creatorRole)) {
            return res.status(403).json({ message: 'You do not have permission to create users' });
        }

        const [existing] = await db.execute('SELECT id FROM admins WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        const requestedRole = normalizeAdminRole(role || ADMIN_ROLE.ADMIN);
        const nextRole = creatorRole === ADMIN_ROLE.OWNER && requestedRole === ADMIN_ROLE.SUPER_ADMIN
            ? ADMIN_ROLE.SUPER_ADMIN
            : ADMIN_ROLE.ADMIN;

        if (creatorRole === ADMIN_ROLE.ADMIN && nextRole !== ADMIN_ROLE.ADMIN) {
            return res.status(403).json({ message: 'Admins can only create admin users' });
        }

        if (nextRole === ADMIN_ROLE.ADMIN && (!projectIds || projectIds.length === 0)) {
            return res.status(400).json({ message: 'Please assign at least one project to this admin' });
        }

        if (!(await areProjectIdsWithinActorScope(req.user, projectIds || []))) {
            return res.status(403).json({ message: 'You can only assign projects that have been granted to your account' });
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const [result] = await db.execute(
            'INSERT INTO admins (name, email, password_hash, role, profile_image) VALUES (?, ?, ?, ?, ?)',
            [name, email, hash, nextRole, profileImage || null]
        );
        
        const newAdminId = result.insertId;

        if (nextRole === ADMIN_ROLE.ADMIN && projectIds && projectIds.length > 0) {
            for (let pid of projectIds) {
                 await db.execute(
                    'INSERT INTO admin_project_access (admin_id, project_id) VALUES (?, ?)',
                    [newAdminId, pid]
                );
            }
        }

        res.status(201).json({ message: 'User created successfully' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// 5. ลบ User
exports.deleteUser = async (req, res) => {
    const { id } = req.params;
    try {
        const targetAdmin = await getAdminById(id);
        if (!targetAdmin) {
            return res.status(404).json({ message: 'User not found' });
        }

        const actorRole = normalizeAdminRole(req.user?.role);
        const targetRole = normalizeAdminRole(targetAdmin.role);
        const isDeletingOwnSuperAdminProfile = actorRole === ADMIN_ROLE.SUPER_ADMIN
            && targetRole === ADMIN_ROLE.SUPER_ADMIN
            && Number(id) === Number(req.user?.id);

        const canManageTarget = await canAccessAdminTarget(req.user, targetAdmin);

        if (!canManageTarget && !isDeletingOwnSuperAdminProfile) {
            return res.status(403).json({ message: 'You do not have permission to delete this user' });
        }

        await db.execute('DELETE FROM admins WHERE id = ?', [id]);
        res.json({ message: 'User deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// 6. สร้าง Project ใหม่
exports.createProject = async (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Project name is required' });

    try {
        if (!canCreateProjects(req.user?.role)) {
            return res.status(403).json({ message: 'Only owners and super admins can create projects' });
        }

        const apiKey = crypto.randomBytes(16).toString('hex'); 
        
        await db.execute(
            'INSERT INTO projects (project_name, description, api_key, is_active) VALUES (?, ?, ?, ?)',
            [name.trim(), description?.trim() || null, apiKey, 1]
        );
        res.status(201).json({ message: 'Project created successfully' });
    } catch (err) {
        console.error("Create Project Error:", err);
        res.status(500).json({ message: 'Server error while creating project' });
    }
};

// 7. แก้ไขข้อมูล User (ชื่อ และ สิทธิ์การเข้าถึง)
exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { name, role, projectIds } = req.body;

    try {
        const targetAdmin = await getAdminById(id);
        if (!targetAdmin) {
            return res.status(404).json({ message: 'User not found' });
        }

        const actorRole = normalizeAdminRole(req.user?.role);
        const targetRole = normalizeAdminRole(targetAdmin.role);
        const isEditingOwnOwnerProfile = actorRole === ADMIN_ROLE.OWNER
            && targetRole === ADMIN_ROLE.OWNER
            && Number(req.user?.id) === Number(targetAdmin.id);
        const isEditingOwnSuperAdminProfile = actorRole === ADMIN_ROLE.SUPER_ADMIN
            && targetRole === ADMIN_ROLE.SUPER_ADMIN
            && Number(req.user?.id) === Number(targetAdmin.id);

        const canManageTarget = await canAccessAdminTarget(req.user, targetAdmin);

        if (!canManageTarget && !isEditingOwnOwnerProfile && !isEditingOwnSuperAdminProfile) {
            return res.status(403).json({ message: 'You do not have permission to update this user' });
        }

        const requestedRole = normalizeAdminRole(role || targetAdmin.role);
        const nextRole = isEditingOwnOwnerProfile
            ? ADMIN_ROLE.OWNER
            : isEditingOwnSuperAdminProfile
                ? ADMIN_ROLE.SUPER_ADMIN
            : actorRole === ADMIN_ROLE.OWNER && requestedRole === ADMIN_ROLE.SUPER_ADMIN
                ? ADMIN_ROLE.SUPER_ADMIN
                : ADMIN_ROLE.ADMIN;

        if (actorRole === ADMIN_ROLE.ADMIN && nextRole !== ADMIN_ROLE.ADMIN) {
            return res.status(403).json({ message: 'Admins can only keep admin role assignments' });
        }

        if (nextRole === ADMIN_ROLE.ADMIN && (!projectIds || projectIds.length === 0)) {
            return res.status(400).json({ message: 'Please keep at least one project assigned to this admin' });
        }

        if (!(await areProjectIdsWithinActorScope(req.user, projectIds || []))) {
            return res.status(403).json({ message: 'You can only assign projects that have been granted to your account' });
        }

        await db.execute('UPDATE admins SET name = ?, role = ? WHERE id = ?', [name, nextRole, id]);

        await db.execute('DELETE FROM admin_project_access WHERE admin_id = ?', [id]);

        if (nextRole === ADMIN_ROLE.ADMIN && projectIds && projectIds.length > 0) {
            for (let pid of projectIds) {
                await db.execute(
                    'INSERT INTO admin_project_access (admin_id, project_id) VALUES (?, ?)',
                    [id, pid]
                );
            }
        }
        res.json({ message: 'User updated successfully' });
    } catch (err) {
        console.error("Update User Error:", err);
        res.status(500).json({ message: 'Server error while updating user' });
    }
};

// 8. รีเซ็ตรหัสผ่าน
exports.resetPassword = async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;

    try {
        const targetAdmin = await getAdminById(id);
        if (!targetAdmin) return res.status(404).json({ message: 'User not found' });

        const actorRole = normalizeAdminRole(req.user?.role);
        const targetRole = normalizeAdminRole(targetAdmin.role);
        const isResettingOwnOwnerPassword = actorRole === ADMIN_ROLE.OWNER
            && targetRole === ADMIN_ROLE.OWNER
            && Number(req.user?.id) === Number(targetAdmin.id);
        const isResettingOwnSuperAdminPassword = actorRole === ADMIN_ROLE.SUPER_ADMIN
            && targetRole === ADMIN_ROLE.SUPER_ADMIN
            && Number(req.user?.id) === Number(targetAdmin.id);

        const canManageTarget = await canAccessAdminTarget(req.user, targetAdmin);

        if (!canManageTarget && !isResettingOwnOwnerPassword && !isResettingOwnSuperAdminPassword) {
            return res.status(403).json({ message: 'You do not have permission to reset this password' });
        }

        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(newPassword, salt);

        await db.execute('UPDATE admins SET password_hash = ? WHERE id = ?', [newHash, id]);

        res.json({ message: 'Password reset successfully' });
    } catch (err) {
        console.error("Reset Password Error:", err);
        res.status(500).json({ message: 'Server error while resetting password' });
    }
};