const express = require('express');
const supabase = require('./supabase');
const { authMiddleware } = require('./authMiddleware');
const { extractTasksFromText } = require('./taskExtractor');

const router = express.Router();

// ── Public API (called by server.js on room close) ────────────────────────────

async function saveSession(userId, sessionData) {
    console.log(`[historyStore] Attempting to save session ${sessionData.sessionId} for user ${userId}`);
    const payload = {
        session_id: sessionData.sessionId,
        user_id: userId,
        room_id: sessionData.roomId,
        date: sessionData.date,
        duration: sessionData.duration,
        participants: sessionData.participants || [],
        transcript: sessionData.transcript || [],
        tasks: sessionData.tasks || [],
        summary: sessionData.summary || null,
    };

    const { error } = await supabase
        .from('sessions')
        .upsert([payload], { onConflict: 'session_id,user_id' });

    if (error) {
        // If the 'summary' column specifically is missing, retry without it
        if (error.message.includes('summary')) {
            console.warn('[historyStore] Supabase "summary" column missing. Retrying without it.');
            delete payload.summary;
            const { error: retryError } = await supabase.from('sessions').upsert([payload], { onConflict: 'session_id,user_id' });
            if (retryError) console.error('[historyStore] saveSession retry error:', retryError.message);
        } else {
            console.error('[historyStore] saveSession error:', error.message);
        }
    } else {
        console.log(`[historyStore] Session ${sessionData.sessionId} upserted successfully to Supabase.`);
    }
}

// ── REST routes ───────────────────────────────────────────────────────────────

// GET /history — session summaries for the authenticated user
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('sessions')
            .select('session_id, room_id, date, duration, participants, tasks')
            .eq('user_id', req.user.id)
            .order('date', { ascending: false });

        if (error) throw error;

        const sessions = (data || []).map((s) => ({
            sessionId: s.session_id,
            roomId: s.room_id,
            date: s.date,
            duration: s.duration,
            participantCount: Array.isArray(s.participants) ? s.participants.length : 0,
            taskCount: Array.isArray(s.tasks) ? s.tasks.length : 0,
        }));

        res.json({ sessions });
    } catch (err) {
        console.error('[historyStore] GET / error:', err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// GET /history/all-tasks — flat list of all tasks for the user
router.get('/all-tasks', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('sessions')
            .select('session_id, room_id, date, tasks')
            .eq('user_id', req.user.id)
            .order('date', { ascending: false });

        if (error) throw error;

        const allTasks = [];
        (data || []).forEach((session) => {
            if (Array.isArray(session.tasks)) {
                session.tasks.forEach((t) => {
                    allTasks.push({
                        ...t,
                        sessionId: session.session_id,
                        roomId: session.room_id,
                        sessionDate: session.date,
                    });
                });
            }
        });

        res.json({ tasks: allTasks });
    } catch (err) {
        console.error('[historyStore] GET /all-tasks error:', err);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// GET /history/:sessionId — full session detail
router.get('/:sessionId', authMiddleware, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('session_id', req.params.sessionId)
            .eq('user_id', req.user.id)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Session not found' });

        res.json({
            session: {
                sessionId: data.session_id,
                roomId: data.room_id,
                date: data.date,
                duration: data.duration,
                participants: data.participants || [],
                transcript: data.transcript || [],
                tasks: data.tasks || [],
                summary: data.summary || null,
            }
        });
    } catch (err) {
        console.error('[historyStore] GET /:sessionId error:', err);
        res.status(500).json({ error: 'Failed to fetch session' });
    }
});

// PATCH /history/:sessionId/tasks/:taskId — update task status
router.patch('/:sessionId/tasks/:taskId', authMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'Status is required' });

        // Fetch full session first
        const { data, error } = await supabase
            .from('sessions')
            .select('tasks')
            .eq('session_id', req.params.sessionId)
            .eq('user_id', req.user.id)
            .single();

        if (error || !data) return res.status(404).json({ error: 'Session not found' });

        const tasks = data.tasks || [];
        const taskIndex = tasks.findIndex((t) => t.id === req.params.taskId);
        if (taskIndex === -1) return res.status(404).json({ error: 'Task not found' });

        tasks[taskIndex].status = status;

        const { error: updateError } = await supabase
            .from('sessions')
            .update({ tasks })
            .eq('session_id', req.params.sessionId)
            .eq('user_id', req.user.id);

        if (updateError) throw updateError;
        res.json({ success: true });
    } catch (err) {
        console.error('[historyStore] PATCH task error:', err);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// POST /history/analyze-transcript — extract tasks from raw text and save to a manual session
router.post('/analyze-transcript', authMiddleware, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || text.trim().length < 10) {
            return res.status(400).json({ error: 'Please provide more text to analyze' });
        }

        console.log('[historyStore] analyze-transcript received text length:', text.length);
        const extracted = await extractTasksFromText(text);
        console.log('[historyStore] extracted tasks count:', extracted.length);

        if (extracted.length === 0) {
            return res.json({ tasks: [], message: 'No tasks found in the text.' });
        }

        // Save these to a special "Manual" session for the user so they persist
        // We use a fixed ID for the manual session per user
        const manualSessionId = `manual_${req.user.id.substring(0, 8)}`;

        // 1. Get existing manual tasks
        const { data: existing } = await supabase
            .from('sessions')
            .select('tasks')
            .eq('session_id', manualSessionId)
            .eq('user_id', req.user.id)
            .maybeSingle();

        const allTasks = [...(existing?.tasks || []), ...extracted];

        // 2. Upsert the manual session
        const { error: upsertError } = await supabase
            .from('sessions')
            .upsert({
                session_id: manualSessionId,
                user_id: req.user.id,
                room_id: 'Manual Analysis',
                date: new Date().toISOString(),
                duration: 0,
                participants: [{ name: 'Manual Entry' }],
                tasks: allTasks,
                summary: 'Generated from Manual Transcript Entry'
            });

        if (upsertError) throw upsertError;

        res.json({ tasks: extracted, totalCount: allTasks.length });
    } catch (err) {
        console.error('[historyStore] analyze-transcript error:', err);
        res.status(500).json({ error: 'Failed to analyze text' });
    }
});

// DELETE /history/:sessionId — delete a session
router.delete('/:sessionId', authMiddleware, async (req, res) => {
    try {
        const { error, count } = await supabase
            .from('sessions')
            .delete({ count: 'exact' })
            .eq('session_id', req.params.sessionId)
            .eq('user_id', req.user.id);

        if (error) throw error;
        if (count === 0) return res.status(404).json({ error: 'Session not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('[historyStore] DELETE error:', err);
        res.status(500).json({ error: 'Failed to delete session' });
    }
});

module.exports = { router, saveSession };
