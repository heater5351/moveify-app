const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.ttf': 'font/ttf',
};

const TEMPLATE_DIR = 'tailwind css template';

const server = http.createServer((req, res) => {
    // Handle API route locally
    if (req.method === 'POST' && req.url === '/api/contact') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                console.log('Contact form submission (local):', data.name, data.email);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
        });
        return;
    }

    // Local-dev mock for /api/reviews so the UI can be developed without the
    // Google Places API key. Production uses api/reviews.js on Vercel.
    if (req.method === 'GET' && req.url === '/api/reviews') {
        const mock = {
            businessName: 'Moveify Health Solutions',
            businessUrl: 'https://www.google.com/maps/search/Moveify+Health+Solutions+4+George+St+Williamstown+SA',
            rating: 5.0,
            reviewCount: 3,
            reviews: [
                { author: 'Sample Patient', authorPhoto: null, rating: 5, relativeTime: '2 weeks ago', publishedAt: null, text: 'Excellent care and a genuinely personalised program. The mock review you see in local dev only — production pulls live Google reviews.' },
                { author: 'Another Client', authorPhoto: null, rating: 5, relativeTime: '1 month ago', publishedAt: null, text: 'Ryan took the time to understand my history and built a plan that actually fits my life. Highly recommend.' },
                { author: 'Local Dev User', authorPhoto: null, rating: 5, relativeTime: '3 months ago', publishedAt: null, text: 'This is mock data shown only when running the site locally without GOOGLE_PLACES_API_KEY set.' },
            ],
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mock));
        return;
    }

    let filePath = req.url === '/' ? '/index.html' : req.url;
    let fullPath = path.join(__dirname, TEMPLATE_DIR, filePath);

    const ext = path.extname(fullPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(fullPath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`Moveify clinic website is running at http://localhost:${PORT}`);
});