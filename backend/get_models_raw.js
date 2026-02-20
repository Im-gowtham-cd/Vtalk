require('dotenv').config();
const https = require('https');

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.models) {
                console.log('Available Models:');
                json.models.forEach(m => console.log(` - ${m.name}`));
            } else {
                console.log('No models found or error response:', JSON.stringify(json, null, 2));
            }
        } catch (e) {
            console.error('Failed to parse response:', data);
        }
    });
}).on('error', (err) => {
    console.error('HTTPS error:', err.message);
});
