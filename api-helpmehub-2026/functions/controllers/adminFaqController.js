const db = require('../config/db');
exports.getFaqs = async (req, res) => {
    try {
        const { projectId } = req.query;
        const [rows] = await db.execute('SELECT * FROM faqs WHERE project_id = ? ORDER BY id DESC', [projectId]);
        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.saveFaq = async (req, res) => {
    try {
        const { id, projectId, question, answer } = req.body;
        if (id) {
            await db.execute('UPDATE faqs SET question = ?, answer = ? WHERE id = ?', [question, answer, id]);
            res.json({ success: true, message: "Updated" });
        } else {
            const [result] = await db.execute('INSERT INTO faqs (project_id, question, answer) VALUES (?, ?, ?)', [projectId, question, answer]);
            res.json({ success: true, id: result.insertId });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteFaqs = async (req, res) => {
    try {
        const { ids } = req.body;
        await db.query('DELETE FROM faqs WHERE id IN (?)', [ids]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};