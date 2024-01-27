/*
******************************************************************************

FSBucket

This is an Express.js server that provides a simple file storage service. It
uses environment variables for configuration, including the base directory for
file storage, a secret key for signature validation, and the server port.

The environment variables are: FSBUCKET_BASE_DIR - the base directory for file
storage FSBUCKET_SECRET_KEY - the secret key for signature validation PORT - the
port the server will listen on

The server supports two main operations: GET and PUT.

The GET operation is used to retrieve files. It validates the request signature
and the safety of the requested path before proceeding. If the file exists and
the request includes a range header, it will return the requested range of
bytes. Otherwise, it will return the entire file.

The PUT operation is used to upload files. It also validates the request
signature and the safety of the requested path. If the file already exists, it
will return an error. Otherwise, it will write the incoming request data to a
new file.

The server also includes utility functions for signature validation and path
safety checking. The signature validation uses a HMAC SHA256 algorithm. The path
safety checking ensures that the path does not contain any unsafe parts and that
it is not too long.

The server starts listening on the configured port after it is set up.

The entity generating the signature must have access to the secret key. To
generate the signature, use the code below in the function:
createSignature({path, expires, method})

Author: Jeremy Magland
January, 2024

******************************************************************************
*/

const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const crypto = require('crypto');

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

///////////////////////////////////////////

app.get('/*', (req, res) => {
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
    if (!checkSafePath(reqPath)) {
        return res.status(403).send(`Invalid path: ${reqPath}`);
    }
    if (!checkValidSignature({path: reqPath, expires, method}, signature)) {
        return res.status(403).send('Invalid signature');
    }
    
    const filePath = path.join(BASE_DIR, reqPath);
    const exists = fs.existsSync(filePath);
    if (!exists) {
        return res.status(404).send('File not found');
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
    res.writeHead(206, head);
    readStream.pipe(res);

    readStream.on('error', err => {
        return res.status(500).send(`Error reading file: ${err.message}`);
    });
});

app.put('/*', (req, res) => {
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
    if (!checkSafePath(reqPath)) {
        return res.status(403).send(`Invalid path: ${reqPath}`);
    }
    if (!checkValidSignature({path: reqPath, expires, method}, signature)) {
        return res.status(403).send('Invalid signature');
    }

    const filePath = path.join(BASE_DIR, reqPath);
    const exists = fs.existsSync(filePath);
    if (exists) {
        return res.status(409).send('File already exists');
    }

    const writeStream = fs.createWriteStream(filePath);

    req.pipe(writeStream);

    req.on('error', err => {
        return res.status(500).send(`Error reading request: ${err.message}`);
    });

    writeStream.on('error', err => {
        return res.status(500).send(`Error writing file: ${err.message}`);
    });

    writeStream.on('finish', () => {
        return res.status(200).send('File uploaded successfully');
    });
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
    // This followin timestamp is the number of seconds since the Unix epoch and
    // should be the same no matter what timezone the server is in
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

function checkSafePath(path) {
    // decode the path to prevent encoded path traversal attempts
    const decodedPath = decodeURIComponent(path);

    if (!path.startsWith('/')) return false;
    if (path.includes('//')) return false;

    // split the path by both slashes and backslashes
    const parts = decodedPath.split(/\/|\\/).filter(x => x !== '');

    for (let part of parts) {
        // disallow empty parts, single dots, double dots, and null bytes
        if (part === '' || part === '.' || part === '..' || part.includes('\0')) return false;

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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});