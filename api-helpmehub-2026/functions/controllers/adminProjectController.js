const db = require('../config/db.js');
const crypto = require('crypto');
const { canManageProjects, hasFullProjectAccess } = require('../utils/adminRoles');

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

// ==========================================
// ฟังก์ชัน: บันทึก Theme ลง Database
// ==========================================
exports.saveProjectTheme = async (req, res) => {
    const { projectId } = req.params;
    const { theme, chatTheme } = req.body;
    
    try {
        const allowedProject = await ensureProjectAccess(projectId, req.user);
        if (!allowedProject) {
            return res.status(403).json({ message: 'You do not have access to this project' });
        }

        const themeConfig = JSON.stringify({ theme, chatTheme });

        await db.execute(
            'UPDATE projects SET theme_config = ? WHERE id = ?', 
            [themeConfig, projectId]
        );
        
        res.json({ status: 'ok', message: 'Theme saved successfully' });
    } catch (error) {
        console.error("Save Theme Error:", error);
        res.status(500).json({ error: 'Failed to save theme' });
    }
};

exports.updateProject = async (req, res) => {
    const { projectId } = req.params;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Project name is required' });
    }

    try {
        if (!canManageProjects(req.user?.role)) {
            return res.status(403).json({ message: 'Only owners can update projects' });
        }

        await db.execute('UPDATE projects SET project_name = ?, description = ? WHERE id = ?', [name.trim(), description?.trim() || null, projectId]);
        res.json({ status: 'ok', message: 'Project updated successfully' });
    } catch (error) {
        console.error('Update Project Error:', error);
        res.status(500).json({ message: 'Failed to update project' });
    }
};

exports.toggleProjectStatus = async (req, res) => {
    const { projectId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
        return res.status(400).json({ message: 'isActive must be a boolean value' });
    }

    try {
        if (!canManageProjects(req.user?.role)) {
            return res.status(403).json({ message: 'Only owners can update project status' });
        }

        await db.execute('UPDATE projects SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, projectId]);
        res.json({ status: 'ok', message: `Project ${isActive ? 'enabled' : 'disabled'} successfully` });
    } catch (error) {
        console.error('Toggle Project Status Error:', error);
        res.status(500).json({ message: 'Failed to update project status' });
    }
};

exports.refreshProjectToken = async (req, res) => {
    const { projectId } = req.params;

    try {
        if (!canManageProjects(req.user?.role)) {
            return res.status(403).json({ message: 'Only owners can refresh project tokens' });
        }

        const apiKey = crypto.randomBytes(32).toString('hex');
        await db.execute('UPDATE projects SET api_key = ? WHERE id = ?', [apiKey, projectId]);
        res.json({ status: 'ok', message: 'API token refreshed successfully', apiKey });
    } catch (error) {
        console.error('Refresh Project Token Error:', error);
        res.status(500).json({ message: 'Failed to refresh API token' });
    }
};

exports.deleteProject = async (req, res) => {
    const { projectId } = req.params;
    const connection = await db.getConnection();

    try {
        if (!canManageProjects(req.user?.role)) {
            return res.status(403).json({ message: 'Only owners can delete projects' });
        }

        await connection.beginTransaction();

        const [endUsers] = await connection.execute('SELECT id FROM end_users WHERE project_id = ?', [projectId]);
        const endUserIds = endUsers.map((user) => user.id);

        await connection.execute('DELETE FROM admin_project_access WHERE project_id = ?', [projectId]);
        await connection.execute('DELETE FROM faqs WHERE project_id = ?', [projectId]);

        if (endUserIds.length > 0) {
            await connection.execute(`DELETE FROM messages WHERE project_id = ? OR end_user_id IN (${endUserIds.map(() => '?').join(',')})`, [projectId, ...endUserIds]);
        } else {
            await connection.execute('DELETE FROM messages WHERE project_id = ?', [projectId]);
        }

        await connection.execute('DELETE FROM end_users WHERE project_id = ?', [projectId]);
        await connection.execute('DELETE FROM projects WHERE id = ?', [projectId]);

        await connection.commit();
        res.json({ status: 'ok', message: 'Project deleted successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Delete Project Error:', error);
        res.status(500).json({ message: 'Failed to delete project' });
    } finally {
        connection.release();
    }
};