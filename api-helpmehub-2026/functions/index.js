// index.js
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const app = require("./server"); 

setGlobalOptions({ region: "asia-southeast1" });

exports.api = onRequest({ 
    region: "asia-southeast1",
    memory: "2GB", 
    timeoutSeconds: 60,
    cors: true, 
    

    instanceConnections: ["pkindev-sql-2021:asia-east2:pkindev-sqlmain-2021"], 
    serviceAccount: "api-helpmehub-2026@appspot.gserviceaccount.com", 
}, app);