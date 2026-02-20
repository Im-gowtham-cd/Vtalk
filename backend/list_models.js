require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        // The listModels method might not be on the main class in some versions, 
        // but we can try common ways to check what's available.
        console.log('Checking for available models...');
        // In newer SDKs, this is how you list models
        // However, we can just try a few common ones
        const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp', 'gemini-2.0-flash'];
        for (const m of models) {
            try {
                const model = genAI.getGenerativeModel({ model: m });
                await model.generateContent('test');
                console.log(`Model ${m} is AVAILABLE`);
            } catch (e) {
                console.log(`Model ${m} is NOT available: ${e.message.substring(0, 50)}...`);
            }
        }
    } catch (err) {
        console.error('Error listing models:', err);
    }
}

listModels();
