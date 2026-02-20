-- =====================================================================
-- Vtalk / SpiceZ-Cam — Supabase Database Schema
-- Run this in your Supabase SQL Editor (one-time setup)
-- =====================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL UNIQUE,
    password_hash TEXT      NOT NULL,
    
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast email lookup during login
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

-- ── Sessions table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sessions (
    id           BIGSERIAL   PRIMARY KEY,
    session_id   TEXT        NOT NULL,
    user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    room_id      TEXT        NOT NULL,
    date         TIMESTAMPTZ NOT NULL DEFAULT now(),
    duration     INTEGER     DEFAULT 0,         -- seconds
    participants JSONB       DEFAULT '[]'::jsonb,
    transcript   JSONB       DEFAULT '[]'::jsonb,
    tasks        JSONB       DEFAULT '[]'::jsonb,
    summary      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Each user can only have one record per session
    UNIQUE (session_id, user_id)
);

-- Indexes for history queries
CREATE INDEX IF NOT EXISTS idx_sessions_user_id  ON public.sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date      ON public.sessions (date DESC);

-- ── Row-Level Security (RLS) ───────────────────────────────────────────────
-- We use the service key on the server, so RLS is optional.
-- Disable it to keep things simple (server controls all access):
ALTER TABLE public.users    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions DISABLE ROW LEVEL SECURITY;

-- ── Verify ─────────────────────────────────────────────────────────────────
SELECT 'Schema updated successfully' AS status;
