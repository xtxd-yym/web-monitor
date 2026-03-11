const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../database/monitor.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.all("SELECT * FROM configs", (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log('Total rows:', rows.length);
        rows.forEach(row => {
            console.log('ID:', row.id);
            console.log('Project:', row.project);
            console.log('Env:', row.env);
            console.log('Config Raw Value:', row.config);
            console.log('Config Type:', typeof row.config);
            try {
                JSON.parse(row.config);
                console.log('JSON Parse: OK');
            } catch (e) {
                console.error('JSON Parse Error:', e.message);
            }
            console.log('-------------------');
        });
    });
});

db.close();
