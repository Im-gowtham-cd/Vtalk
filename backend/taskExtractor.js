const { v4: uuidv4 } = require('uuid');

/**
 * Extract structured tasks from a transcript using rule-based NLP.
 *
 * @param {Array<{ speaker: string, timestamp: number, text: string }>} segments
 * @param {number} callStartTime — epoch ms when the call started (for mentionedAt calculation)
 * @returns {Array<Object>} extracted tasks
 */
function extractTasks(segments, callStartTime = 0) {
    const tasks = [];

    // Combine patterns for task detection
    const patterns = [
        // "I will [action]"  / "I'll [action]"
        {
            regex: /\b(?:i will|i'll|i'm going to|i am going to)\s+(.+?)(?:\.|$)/gi,
            getAssignedTo: (match, speaker) => speaker,
            getAssignedBy: (match, speaker) => speaker,
        },
        // "[Name] will [action]"
        {
            regex: /\b([A-Z][a-z]+)\s+(?:will|should|needs to|has to|can)\s+(.+?)(?:\.|$)/gi,
            getAssignedTo: (match) => match[1],
            getAssignedBy: (match, speaker) => speaker,
            textGroup: 2,
        },
        // "can you [action]" / "could you [action]" / "please [action]"
        {
            regex: /\b(?:can you|could you|would you|please)\s+(.+?)(?:\?|\.|$)/gi,
            getAssignedTo: () => 'Unassigned',
            getAssignedBy: (match, speaker) => speaker,
        },
        // "we need to [action]" / "let's [action]"
        {
            regex: /\b(?:we need to|we should|let's|lets|we have to)\s+(.+?)(?:\.|$)/gi,
            getAssignedTo: () => 'Unassigned',
            getAssignedBy: (match, speaker) => speaker,
        },
    ];

    // Deadline patterns
    const deadlinePatterns = [
        { regex: /\bby\s+(tomorrow)\b/i, resolve: () => getRelativeDate(1) },
        { regex: /\bby\s+(today)\b/i, resolve: () => getRelativeDate(0) },
        { regex: /\bby\s+(end of (?:the )?week)\b/i, resolve: () => getEndOfWeek() },
        { regex: /\bby\s+(end of (?:the )?month)\b/i, resolve: () => getEndOfMonth() },
        { regex: /\bby\s+(next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i, resolve: (m) => getNextWeekday(m[1]) },
        { regex: /\bby\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i, resolve: (m) => parseDate(m[1]) },
        { regex: /\b(tomorrow)\b/i, resolve: () => getRelativeDate(1) },
        { regex: /\b(ASAP)\b/i, resolve: () => null },
    ];

    // Priority keywords
    function detectPriority(text) {
        const lower = text.toLowerCase();
        if (/\b(asap|urgent|urgently|immediately|critical|right away)\b/.test(lower)) return 'HIGH';
        if (/\b(when you get a chance|whenever|no rush|low priority|if you can)\b/.test(lower)) return 'LOW';
        return 'MEDIUM';
    }

    // Date helpers
    function getRelativeDate(daysFromNow) {
        const d = new Date();
        d.setDate(d.getDate() + daysFromNow);
        return d.toISOString().split('T')[0];
    }

    function getEndOfWeek() {
        const d = new Date();
        const day = d.getDay();
        const diff = day === 0 ? 0 : 7 - day; // Sunday = end of week
        d.setDate(d.getDate() + diff);
        return d.toISOString().split('T')[0];
    }

    function getEndOfMonth() {
        const d = new Date();
        d.setMonth(d.getMonth() + 1, 0); // last day of current month
        return d.toISOString().split('T')[0];
    }

    function getNextWeekday(phrase) {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const target = days.findIndex((d) => phrase.toLowerCase().includes(d));
        if (target === -1) return null;
        const d = new Date();
        const current = d.getDay();
        let diff = target - current;
        if (diff <= 0) diff += 7;
        d.setDate(d.getDate() + diff);
        return d.toISOString().split('T')[0];
    }

    function parseDate(str) {
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    }

    function formatTimestamp(ms, startMs) {
        const elapsed = Math.max(0, Math.floor((ms - startMs) / 1000));
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        const s = elapsed % 60;
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }

    for (const segment of segments) {
        const { speaker, timestamp, text } = segment;
        if (!text) continue;

        for (const pattern of patterns) {
            let match;
            const re = new RegExp(pattern.regex.source, pattern.regex.flags);
            while ((match = re.exec(text)) !== null) {
                const taskText = (match[pattern.textGroup || 1] || '').trim();
                if (taskText.length < 5) continue; // skip very short matches

                // Detect deadline
                let deadline = null;
                let deadlineRaw = null;
                for (const dp of deadlinePatterns) {
                    const dm = dp.regex.exec(text);
                    if (dm) {
                        deadlineRaw = dm[1];
                        deadline = dp.resolve(dm);
                        break;
                    }
                }

                const priority = detectPriority(text);

                tasks.push({
                    id: uuidv4(),
                    text: taskText.charAt(0).toUpperCase() + taskText.slice(1),
                    assignedTo: pattern.getAssignedTo(match, speaker),
                    assignedBy: pattern.getAssignedBy(match, speaker),
                    deadline,
                    deadlineRaw,
                    priority,
                    mentionedAt: formatTimestamp(timestamp, callStartTime),
                    status: 'pending',
                });
            }
        }
    }

    return tasks;
}

module.exports = { extractTasks };
