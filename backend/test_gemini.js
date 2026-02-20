require('dotenv').config();
const { extractTasks } = require('./taskExtractor');

async function testExtraction() {
    // Manually setting the clock for testing if possible, but for now we follow the user's prompt
    const testTranscript = [
        { speaker: 'Vijay', timestamp: Date.now(), text: "Good morning team. I am Vijay, your manager. Today we will assign tasks to the payment module development." },
        { speaker: 'Vijay', timestamp: Date.now() + 1000, text: "Unkissed, you will implement the payment gateway backend integration and complete it by March 5." },
        { speaker: 'Vijay', timestamp: Date.now() + 2000, text: "Meena, you will design the payment page UI and finish it by March 4." },
        { speaker: 'Vijay', timestamp: Date.now() + 3000, text: "And I implement the integration testing soon to begin." },
        { speaker: 'Vijay', timestamp: Date.now() + 4000, text: "Ravi, you will enter the content with payment backhand and complete it by March 11th." },
        { speaker: 'Vijay', timestamp: Date.now() + 5000, text: "Vibya, you will prepare test cases and complete testing by tomorrow." },
    ];

    console.log('--- Testing Gemini Task Extraction (User Scenario) ---');
    try {
        const tasks = await extractTasks(testTranscript, Date.now());
        console.log('Extracted Tasks:', JSON.stringify(tasks, null, 2));

        if (tasks.length > 0) {
            console.log('SUCCESS: Gemini extracted tasks!');
        } else {
            console.log('FAILURE: No tasks extracted.');
        }
    } catch (err) {
        console.error('ERROR during test:', err);
    }
}

testExtraction();
