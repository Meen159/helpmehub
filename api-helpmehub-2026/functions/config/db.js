const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
console.log("Loading file: " + __filename);
require('dotenv').config();

// 1. ตรวจสอบ Environment (Cloud Run / Firebase Gen 2)
const isFirebase = process.env.FUNCTIONS_WORKER_RUNTIME || process.env.K_SERVICE || process.env.FUNCTION_TARGET;

let dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+07:00',
    connectTimeout: 20000
};

// ==========================================
//  2. Setup Config & Logging
// ==========================================
if (isFirebase) {
    // --- Cloud Mode (Production) ---
    console.log('Environment: Firebase Cloud Functions (Gen 2)');

    // ดึงค่าผ่าน process.env แทนการพิมพ์ลงไปตรงๆ
    const socketPath = `/cloudsql/${process.env.DB_CONNECTION_NAME}`;
    dbConfig.socketPath = socketPath;

    // Log เพื่อตรวจสอบค่า
    console.log('DB Config:', {
        user: dbConfig.user,
        database: dbConfig.database,
        socketPath: dbConfig.socketPath, 
        password: dbConfig.password ? '****** (Hidden)' : 'MISSING '
    });
} else {
    // --- Local Mode (Development) ---
    console.log('Environment: Local Development');
    console.log(`Connecting via IP: ${process.env.DB_HOST}`);
    
    try {
        dbConfig.host = process.env.DB_HOST;
        dbConfig.port = process.env.DB_PORT || 3306;
        
        dbConfig.ssl = {
            ca: fs.readFileSync(path.join(__dirname, '../', process.env.DB_SSL_CA)),
            cert: fs.readFileSync(path.join(__dirname, '../', process.env.DB_SSL_CERT)),
            key: fs.readFileSync(path.join(__dirname, '../', process.env.DB_SSL_KEY)),
            rejectUnauthorized: false
        };
    } catch (error) {
        console.error("Warning: อ่านไฟล์ SSL Certs ไม่สำเร็จ:", error.message);
    }
}

// ==========================================
// 3. Create Connection Pool
// ==========================================
const pool = mysql.createPool(dbConfig);
const db = pool.promise();

// ==========================================
// 4. Health Check & Event Listeners
// ==========================================

pool.on('error', (err) => {
    console.error('Unexpected Database Error (Pool):', err.code, err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.error('Connection lost. Pool will try to reconnect...');
    }
});

pool.on('connection', (connection) => {
    console.log(`New DB Connection ID: ${connection.threadId}`);
});

// Test Query
(async () => {
    try {
        const connection = await pool.promise().getConnection();
        const [rows] = await connection.query('SELECT 1 + 1 AS result');
        connection.release(); 
        
        console.log('DATABASE HEALTH CHECK PASSED! Result:', rows[0].result);
        console.log('---------------------------------------------------');
    } catch (err) {
        console.error('---------------------------------------------------');
        console.error('DATABASE CONNECTION FAILED!!!');
        console.error('Error Code:', err.code);
        console.error('Error Message:', err.message);
        
        if (err.code === 'ENOENT') {
            console.error('TIP: ระบบหา Socket File ไม่เจอ เช็ค instanceConnections ใน index.js หรือสิทธิ์ IAM');
        } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('TIP: User/Password ผิด หรือ IP ไม่ได้รับอนุญาต');
        }
        console.error('---------------------------------------------------');
    }
})();

module.exports = db;