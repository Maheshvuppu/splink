// Minimal local server to (1) host the app and (2) save captured frames to disk
// Run: `node server.js` then open http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 3000;

const ALLOWED_EXERCISES = new Set(['squat', 'forward-bend', 'high-knee', 't-pose', 'plank']);

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
    res.writeHead(status, { 'Content-Type': contentType });
    res.end(body);
}

function sendJson(res, status, obj) {
    send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');
}

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.html': return 'text/html; charset=utf-8';
        case '.js': return 'text/javascript; charset=utf-8';
        case '.css': return 'text/css; charset=utf-8';
        case '.json': return 'application/json; charset=utf-8';
        case '.png': return 'image/png';
        case '.jpg':
        case '.jpeg': return 'image/jpeg';
        case '.svg': return 'image/svg+xml; charset=utf-8';
        default: return 'application/octet-stream';
    }
}

function safeFileName(name) {
    return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function readRequestBody(req, limitBytes = 10 * 1024 * 1024) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limitBytes) {
                reject(new Error('Request too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url || '/', `http://localhost:${PORT}`);

        // Health check
        if (req.method === 'GET' && url.pathname === '/api/ping') {
            sendJson(res, 200, { ok: true });
            return;
        }

        // Save frame endpoint
        if (req.method === 'POST' && url.pathname === '/api/save-frame') {
            const body = await readRequestBody(req);
            let payload;
            try {
                payload = JSON.parse(body || '{}');
            } catch {
                sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
                return;
            }

            const exercise = payload.exercise;
            const fileName = safeFileName(payload.fileName);
            const dataUrl = payload.dataUrl;

            if (!ALLOWED_EXERCISES.has(exercise)) {
                sendJson(res, 400, { ok: false, error: 'Invalid exercise' });
                return;
            }
            if (!fileName || !fileName.toLowerCase().endsWith('.jpg')) {
                sendJson(res, 400, { ok: false, error: 'Invalid fileName' });
                return;
            }
            if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/jpeg')) {
                sendJson(res, 400, { ok: false, error: 'Invalid dataUrl' });
                return;
            }

            const base64 = dataUrl.split(',')[1];
            if (!base64) {
                sendJson(res, 400, { ok: false, error: 'Missing base64 payload' });
                return;
            }

            const outDir = path.join(ROOT, exercise);
            fs.mkdirSync(outDir, { recursive: true });
            const outPath = path.join(outDir, fileName);

            fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));

            sendJson(res, 200, { ok: true, relPath: `${exercise}/${fileName}` });
            return;
        }

        // Static file hosting
        let reqPath = url.pathname;
        if (reqPath === '/') reqPath = '/index.html';

        // Prevent path traversal
        const fsPath = path.join(ROOT, path.normalize(reqPath).replace(/^([/\\])+/, ''));
        if (!fsPath.startsWith(ROOT)) {
            send(res, 403, 'Forbidden');
            return;
        }

        if (!fs.existsSync(fsPath) || fs.statSync(fsPath).isDirectory()) {
            send(res, 404, 'Not found');
            return;
        }

        const data = fs.readFileSync(fsPath);
        send(res, 200, data, getMimeType(fsPath));
    } catch (e) {
        console.error(e);
        send(res, 500, 'Server error');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    // Get local IP address for mobile access
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';
    
    for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
            // Skip internal and non-IPv4 addresses
            if (net.family === 'IPv4' && !net.internal) {
                localIP = net.address;
                break;
            }
        }
    }
    
    console.log(`\n🚀 Server running!`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://${localIP}:${PORT}  ← Use this on mobile\n`);
});
