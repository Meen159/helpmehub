// server.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const db = require('./config/db'); 
require('dotenv').config();

const widgetRoutes = require('./routes/widgetRoutes'); 
const authRoutes = require('./routes/authRoutes'); 
const adminRoutes = require('./routes/adminRoutes'); 

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(cookieParser());

app.use(cors({
    origin: true,
    credentials: true
}));

// =======================
// ROUTES
// =======================
app.use('/api/widget', widgetRoutes); 
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

app.use('/widget', widgetRoutes); 
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

app.get('/test-db', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT 1 + 1 AS solution');
        res.json({ status: 'ok', message: 'Connected to Cloud SQL Successfully!', result: rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/", (req, res) => {
    res.send("API Help Me Hub - READY 🚀");
});

module.exports = app;