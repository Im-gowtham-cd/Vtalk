const express = require('express');
const supabase = require('./supabase');
const { authMiddleware } = require('./authMiddleware');

const router = express.Router();

// ── Public API (called by server.js on room close) ────────────────────────────

async function saveSession(userId, sessionData) {
    console.log(`[historyStore] Attempting to save session ${sessionData.sessionId} for user ${userId}`);
    const { error } = await supabase
        .from('sessions')
        .insert([{
            session_id: sessionData.sessionId,
            user_id: userId,
            room_id: sessionData.roomId,
            date: sessionData.date,
            duration: sessionData.duration,
            participants: sessionData.participants || [],
            transcript: sessionData.transcript || [],
            tasks: sessionData.tasks || [],
        }]);

    if (error) {
        // Ignore duplicate session_id for same user (multiple participants save the same session)
        if (error.code !== '23505') {
            console.error('[historyStore] saveSession error:', error.message);
        } else {
            console.log('[historyStore] Session already exists, skipping.');
        }
    } else {
        console.log(`[historyStore] Session ${sessionData.sessionId} saved successfully to Supabase.`);
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
