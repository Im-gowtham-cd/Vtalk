const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini if API key is present
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let genAI = null;
if (GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('[taskExtractor] Gemini AI initialized for task extraction.');
}

/**
 * Extract structured tasks from a transcript using Gemini AI.
 * Falls back to rule-based extraction if API fails.
 */
async function extractTasks(segments, callStartTime = 0) {
    console.log(`[taskExtractor] extractTasks called with ${segments.length} segments.`);
    if (!genAI) {
        console.warn('[taskExtractor] Gemini API not configured. Using rule-based extraction.');
        return extractTasksRuleBased(segments, callStartTime);
    }

    // Prepare transcript for Gemini
    const transcriptText = segments
        .map(s => `[${s.speaker}]: ${s.text}`)
        .join('\n');

    if (!transcriptText.trim()) return [];

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

    const prompt = `
        Analyze the following meeting transcript and extract a list of action items/tasks.
        Today is: ${dayOfWeek}, ${today}.

        For each task, identify:
        1. The task description (clear and concise).
        2. Who is assigned to the task (e.g., Meena, Vijay, or "Unassigned").
        3. Who assigned the task.
        4. The priority (HIGH, MEDIUM, LOW).
        5. The deadline in YYYY-MM-DD format (or null).

        Output ONLY a valid JSON array of objects with keys: "text", "assignedTo", "assignedBy", "priority", "deadline"

        Transcript:
        ${transcriptText}
    `;

    let retryCount = 0;
    const maxRetries = 2;
    let jsonText = '';

    while (retryCount <= maxRetries) {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            console.log('[taskExtractor] Prompting Gemini...');
            const result = await model.generateContent(prompt);
            const response = await result.response;
            jsonText = response.text().trim();

            if (jsonText.startsWith('```json')) {
                jsonText = jsonText.replace(/^```json/, '').replace(/```$/, '').trim();
            } else if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/^```/, '').replace(/```$/, '').trim();
            }
            console.log('[taskExtractor] Gemini Raw Response:', jsonText);
            break;
        } catch (err) {
            if (err.status === 429 && retryCount < maxRetries) {
                const delay = 5000 * Math.pow(2, retryCount);
                console.warn(`[taskExtractor] 429 Quota hit. Retrying in ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
                retryCount++;
                continue;
            }
            console.error('[taskExtractor] Gemini error:', err.message);
            return extractTasksRuleBased(segments, callStartTime);
        }
    }

    try {
        const aiTasks = JSON.parse(jsonText);
        console.log(`[taskExtractor] Successfully parsed ${aiTasks.length} tasks from Gemini.`);

        return aiTasks.map(task => ({
            id: uuidv4(),
            text: task.text,
            assignedTo: task.assignedTo || 'Unassigned',
            assignedBy: task.assignedBy || 'AI Analysis',
            deadline: task.deadline || null,
            priority: task.priority || 'MEDIUM',
            mentionedAt: 'AI Analyzed',
            status: 'pending'
        }));
    } catch (err) {
        console.error('[taskExtractor] Parsing error:', err.message);
        return extractTasksRuleBased(segments, callStartTime);
    }
}

/** Legacy Rule-Based Fallback */
function extractTasksRuleBased(segments, callStartTime = 0) {
    const tasks = [];
    const patterns = [
        { regex: /\b(?:i will|i'll|i'm going to)\s+(.+?)(?:\.|$)/gi, getAssignedTo: (m, s) => s },
        { regex: /\b([A-Z][a-z]+)\s+(?:will|should|has to)\s+(.+?)(?:\.|$)/gi, getAssignedTo: m => m[1], textGroup: 2 }
    ];

    function formatTimestamp(ms, startMs) {
        const elapsed = Math.max(0, Math.floor((ms - startMs) / 1000));
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    for (const segment of segments) {
        const { speaker, timestamp, text } = segment;
        if (!text) continue;
        for (const pattern of patterns) {
            const re = new RegExp(pattern.regex.source, pattern.regex.flags);
            let match;
            while ((match = re.exec(text)) !== null) {
                const taskText = (match[pattern.textGroup || 1] || '').trim();
                if (taskText.length < 5) continue;
                tasks.push({
                    id: uuidv4(),
                    text: taskText,
                    assignedTo: pattern.getAssignedTo(match, speaker),
                    assignedBy: speaker,
                    deadline: null,
                    priority: 'MEDIUM',
                    mentionedAt: formatTimestamp(timestamp, callStartTime),
                    status: 'pending'
                });
            }
        }
    }
    return tasks;
}

async function extractTasksFromText(text) {
    if (!text || typeof text !== 'string') return [];
    const segments = [{ speaker: 'AI Analysis', timestamp: Date.now(), text: text.trim() }];
    return await extractTasks(segments, Date.now());
}

module.exports = { extractTasks, extractTasksFromText };
