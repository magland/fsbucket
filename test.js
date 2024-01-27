const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const SECRET_KEY = process.env.FSBUCKET_SECRET_KEY;
if (!SECRET_KEY) {
    console.error('FSBUCKET_SECRET_KEY environment variable is required');
    process.exit(-1);
}
if (!process.env.PORT) {
    console.error('PORT environment variable is required');
    process.exit(-1);
}
const PORT = parseInt(process.env.PORT);

class Client {
    constructor(baseURL, secretKey) {
        this.baseURL = baseURL;
        this.secretKey = secretKey;
    }

    createSignature({path, expires, method}) {
        const stringToSign = `${method}\n${path}\n${expires}\n${this.secretKey}`;
        const hash = crypto.createHash('sha256');
        hash.update(stringToSign);
        return hash.digest('hex');
    }

    putFile(filePath, targetPath, callback) {
        const expires = Math.floor(Date.now() / 1000) + 60; // Expires in 60 seconds
        const signature = this.createSignature({path: targetPath, expires, method: 'PUT'});
        const options = {
            hostname: this.baseURL,
            port: PORT,
            path: `${targetPath}?signature=${signature}&expires=${expires}`,
            method: 'PUT',
        };

        const req = http.request(options, res => {
            let data = '';
            res.on('data', chunk => {
                data += chunk;
            });
            res.on('end', () => {
                callback(null, data);
            });
        });

        req.on('error', error => {
            callback(error);
        });

        const readStream = fs.createReadStream(filePath);
        readStream.pipe(req);
    }

    getFile(targetPath, callback) {
        const expires = Math.floor(Date.now() / 1000) + 60; // Expires in 60 seconds
        const signature = this.createSignature({path: targetPath, expires, method: 'GET'});
        const options = {
            hostname: this.baseURL,
            port: PORT,
            path: `${targetPath}?signature=${signature}&expires=${expires}`,
            method: 'GET',
        };

        const req = http.request(options, res => {
            const chunks = [];
            res.on('data', chunk => {
                chunks.push(chunk);
            });
            res.on('end', () => {
                const data = Buffer.concat(chunks);
                callback(null, data);
            });
        });

        req.on('error', error => {
            callback(error);
        });

        req.end();
    }
}

function getRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

const thePath = '/test-' + getRandomString(10) + '.txt';
const theContent = getRandomString(100000);

// Test
const client = new Client('localhost', SECRET_KEY);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsbucket-'));
const testFilePath = path.join(tempDir, 'test.txt');
fs.writeFileSync(testFilePath, theContent);

client.putFile(testFilePath, thePath, (err, data) => {
    if (err) {
        console.error('Error putting file:', err);
        return;
    }
    console.log('Put file response:', data);

    client.getFile(thePath, (err, data) => {
        if (err) {
            console.error('Error getting file:', err);
            return;
        }
        const dataText = data.toString();
        console.log('Get file response:', dataText.length);
        if (dataText === theContent) {
            console.log('Content matches');
        } else {
            console.error('Content mismatch');
            return;
        }
    });
});