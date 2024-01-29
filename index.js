const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const crypto = require('crypto');
const cors = require('cors');

///////////////////////////////////////////
// Configuration

// The base directory for file storage
const BASE_DIR = process.env.FSBUCKET_BASE_DIR;
// The secret key for signature validation
const SECRET_KEY = process.env.FSBUCKET_SECRET_KEY;
// The port the server will listen on
const PORT = parseInt(process.env.PORT || '8080');

if (!BASE_DIR) {
    console.error('FSBUCKET_BASE_DIR environment variable is required');
    process.exit(-1);
}
if (!SECRET_KEY) {
    console.error('FSBUCKET_SECRET_KEY environment variable is required');
    console.error('You may want to use this one: ' + generateRandomString(64));
    process.exit(-1);
}
if (SECRET_KEY.length < 64) {
    console.error('SECRET_KEY must be at least 64 characters long');
    console.error('You may want to use this one: ' + generateRandomString(64));
    process.exit(-1);
}

// Enable CORS for all origins
app.use(cors());

///////////////////////////////////////////

app.get('/*', async (req, res) => {
    const signature = req.query.signature;
    const expires = req.query.expires;
    const method = 'GET'
    const reqPath = req.path;
    // disallow other query parameters
    for (let key in req.query) {
        if (key !== 'signature' && key !== 'expires') {
            return res.status(403).send('Invalid query');
        }
    }
    if (!signature) {
        return res.status(403).send('Query parameter required: signature');
    }
    if (!expires) {
        return res.status(403).send('Query parameter required: expires');
    }
    if (!checkValidPath(reqPath)) {
        return res.status(403).send(`Invalid path: ${reqPath}`);
    }
    if (!checkValidSignature({path: reqPath, expires, method}, signature)) {
        return res.status(403).send('Invalid signature');
    }

    try {
        const filePath = path.join(BASE_DIR, reqPath);
        const exists = fs.existsSync(filePath);
        if (!exists) {
            throw new Error('File does not exist');
        }
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        let readStream
        let head
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0].trim(), 10);
            const end = parts[1].trim() ? parseInt(parts[1].trim(), 10) : fileSize-1;
            const chunkSize = (end-start)+1;
            readStream = fs.createReadStream(filePath, {start, end});
            head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize
            };   
        }
        else {
            readStream = fs.createReadStream(filePath);
            head = {
                'Content-Length': fileSize
            };
        }
        await new Promise((resolve, reject) => {
            let resolved = false;
            res.writeHead(200, head);
            readStream.pipe(res);

            readStream.on('error', err => {
                if (resolved) return;
                resolved = true;
                reject(`Error reading file: ${err.message}`);
            });

            readStream.on('end', () => {
                if (resolved) return;
                resolved = true;
                resolve();
            });
        });
    }
    catch(err) {
        res.status(500).send(err.message);
    }
});

app.put('/*', async (req, res) => {
    const signature = req.query.signature;
    const expires = req.query.expires;
    const method = 'PUT'
    const reqPath = req.path;
    // disallow other query parameters
    for (let key in req.query) {
        if (key !== 'signature' && key !== 'expires') {
            return res.status(403).send('Invalid query');
        }
    }
    if (!signature) {
        return res.status(403).send('Query parameter required: signature');
    }
    if (!expires) {
        return res.status(403).send('Query parameter required: expires');
    }
    if (!checkValidPath(reqPath)) {
        return res.status(403).send(`Invalid path: ${reqPath}`);
    }
    if (!checkValidSignature({path: reqPath, expires, method}, signature)) {
        return res.status(403).send('Invalid signature');
    }

    const temporaryFilePath = path.join(BASE_DIR, `.fsbucket/uploads/${generateRandomString(10)}.tmp`);

    try {
        const filePath = path.join(BASE_DIR, reqPath);
        const exists = fs.existsSync(filePath);
        if (exists) {
            throw new Error('File already exists');
        }

        await createDirectory(path.dirname(temporaryFilePath));

        const writeStream = fs.createWriteStream(temporaryFilePath);

        req.pipe(writeStream);

        await new Promise((resolve, reject) => {
            let resolved = false;
            req.on('error', err => {
                if (resolved) return;
                resolved = true;
                reject(`Error reading request: ${err.message}`);
            });

            writeStream.on('error', err => {
                if (resolved) return;
                resolved = true;
                reject(`Error writing file: ${err.message}`);
            });

            writeStream.on('finish', () => {
                if (resolved) return;
                resolved = true;
                resolve();
            });
        });

        const exists2 = fs.existsSync(filePath);
        if (exists2) {
            throw new Error('File already exists (2)');
        }
        await createDirectory(path.dirname(filePath));
        await fs.promises.rename(temporaryFilePath, filePath);
        res.status(200).send('File uploaded successfully');
    }
    catch(err) {
        try {
            const temporaryFileExists = fs.existsSync(temporaryFilePath);
            if (temporaryFileExists) {
                await fs.promises.unlink(temporaryFilePath).catch(() => {});
            }
        }
        catch(err2) {
            console.error(`Error removing temporary file: ${temporaryFilePath}`);
        }
        finally {
            res.status(500).send(err.message);
        }
    }
});

function checkValidSignature({path, expires, method}, signature) {
    if (signature.length !== 64) return false;
    try {
        const signatureToCheck = createSignature({path, expires, method});
        return signature === signatureToCheck;
    }
    catch (err) {
        return false;
    }
}

function createSignature({path, expires, method}) {
    if (!expires) throw new Error('Expires is required');
    const expiresSec = parseInt(expires);
    if (isNaN(expiresSec)) throw new Error('Invalid expires');
    // This following timestamp is the number of seconds since the Unix epoch
    // and should be the same no matter what timezone the server is in
    const nowSec = Date.now() / 1000;
    if (expiresSec < nowSec) throw new Error('Expired');
    if (expiresSec > nowSec + 60 * 60 * 24) throw new Error('Expires too far in the future');
    const stringToSign = `${method}\n${path}\n${expires}\n${SECRET_KEY}`;
    return sha1(stringToSign);
}

function sha1(str) {
    const hash = crypto.createHash('sha256');
    hash.update(str);
    return hash.digest('hex');
}

function checkValidPath(path) {
    // decode the path to prevent encoded path traversal attempts
    const decodedPath = decodeURIComponent(path);
    if (decodedPath !== path) return false; // path contained encoded characters

    // path must start with a slash and not contain two consecutive slashes
    if (!path.startsWith('/')) return false;
    if (path.includes('//')) return false;

    // split the path by both slashes and backslashes
    const parts = path.split(/[\\/]/).filter(x => x !== '');

    for (let part of parts) {
        // disallow empty parts, single dots, double dots, and null bytes
        if (part === '' || part === '.' || part === '..' || part.includes('\0')) return false;

        if (part === '.fsbucket') return false; // reserved for internal use

        // only allow alphanumeric, dashes, underscores, and dots
        if (!part.match(/^[a-zA-Z0-9\-_\.]+$/)) return false;

        // disallow overly long parts
        if (part.length > 1000) return false;
    }

    // disallow paths with no parts or too many parts
    if (parts.length === 0 || parts.length > 20) return false;

    return true;
}

function generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let ret = '';
    for (let i = 0; i < length; i++) {
        ret += chars[Math.floor(Math.random() * chars.length)];
    }
    return ret;
}

async function createDirectory(dirPath) {
    const exists = fs.existsSync(dirPath);
    if (exists) return;
    await fs.promises.mkdir(dirPath, {recursive: true});
}

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});