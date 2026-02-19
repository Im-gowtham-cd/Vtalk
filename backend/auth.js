const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const supabase = require('./supabase');
const { authMiddleware } = require('./authMiddleware');
require('dotenv').config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'vtalk_secret_change_me_in_production';

// ── Helpers ───────────────────────────────────────────────────────────────────

function createToken(user) {
    return jwt.sign(
        { id: user.id, name: user.name, email: user.email },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
}

function sanitizeUser(user) {
    return { id: user.id, name: user.name, email: user.email };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /auth/signup
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const emailLower = email.toLowerCase().trim();

        // Check if email already exists
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('email', emailLower)
            .single();

        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const userId = uuidv4();

        const { data: user, error } = await supabase
            .from('users')
            .insert([{
                id: userId,
                name: name.trim(),
                email: emailLower,
                password_hash: passwordHash,
            }])
            .select()
            .single();

        if (error) {
            console.error('[auth] signup insert error:', error);
            return res.status(500).json({ error: 'Failed to create account' });
        }

        const token = createToken(user);
        res.status(201).json({ token, user: sanitizeUser(user) });
    } catch (err) {
        console.error('[auth] signup error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('email', email.toLowerCase().trim())
            .single();

        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = createToken(user);
        res.json({ token, user: sanitizeUser(user) });
    } catch (err) {
        console.error('[auth] login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /auth/me
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const { data: user } = await supabase
            .from('users')
            .select('id, name, email')
            .eq('id', req.user.id)
            .single();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user: sanitizeUser(user) });
    } catch (err) {
        console.error('[auth] me error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
